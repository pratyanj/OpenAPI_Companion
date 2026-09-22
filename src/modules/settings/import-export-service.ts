import { ok, err, type Result, type AppError } from '@/types'
import { APP_NAME, APP_VERSION, SCHEMA_VERSION, STORAGE_ROOTS } from '@/constants'
import type { EventBus, ImportSummary } from '@/core/events'
import { backupKey, projectKey, type StorageService } from '@/core/storage'
import {
  DEFAULT_BACKUP_FOLDER,
  type ExportBundle,
  type ImportCategory,
  type ImportMode,
  type ImportPreview,
  type ImportPreviewCategoryItem,
  type PreImportSnapshot,
} from './types'
import { encryptBackup, decryptBackup, isEncryptedBackup } from '@/utils/crypto-backup'
import { type Downloader, formatBackupFilename, universalDownloader } from './downloader'

export type { Downloader } from './downloader'

export interface ImportExportServiceOptions {
  storage: StorageService
  bus?: EventBus
  now?: () => number
  download?: Downloader
}

const KNOWN_ROOTS = new Set<string>(Object.values(STORAGE_ROOTS))
const SNAPSHOT_KEY = backupKey('last-pre-import-snapshot')

const errors = {
  invalid: (message: string): AppError => ({ code: 'IMPORT_INVALID', message, recoverable: true }),
  unsupported: (v: number): AppError => ({
    code: 'IMPORT_UNSUPPORTED_VERSION',
    message: `Backup schema version ${v} is newer than this extension supports (${SCHEMA_VERSION}).`,
    recoverable: true,
  }),
  unsafe: (key: string): AppError => ({
    code: 'IMPORT_UNSAFE',
    message: `Refusing to import unknown key "${key}" (outside the extension's namespace).`,
    recoverable: true,
  }),
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Map storage key to its import category for selective filtering and preview badges. */
export function categorizeKey(key: string): ImportCategory {
  if (key.startsWith(`${STORAGE_ROOTS.settings}/`)) return 'settings'
  if (key.includes('/history/')) return 'history'
  if (
    key.includes('/auth-vault/') ||
    key.includes('/authentication/') ||
    key.includes('/auth-active-credential') ||
    key.includes('/auth-login-endpoint')
  ) {
    return 'auth'
  }
  if (key.includes('/requests/template/') || key.includes('/requests/draft/')) return 'presets'
  if (key.includes('/environments/') || key.endsWith('/environments')) return 'environments'
  if (key.includes('/workflows')) return 'workflows'
  if (key.includes('/global-headers')) return 'headers'
  if (key.includes('/extraction-rules') || key.includes('/environment/extraction-rules')) {
    return 'rules'
  }
  return 'presets'
}

export interface ImportExportApi {
  exportAll(passphrase?: string): Promise<Result<string>>
  exportProject(projectId: string, passphrase?: string): Promise<Result<string>>
  backup(
    auto?: boolean,
    passphrase?: string,
    projectId?: string,
    projectName?: string,
    subfolder?: string,
  ): Promise<Result<string>>
  hasChangesSince(lastBackupAt: number, projectId?: string): Promise<boolean>
  decryptBackup(json: string, passphrase: string): Promise<Result<string>>
  isEncrypted(json: string): boolean
  previewImport(json: string): Result<ImportPreview>
  applyImport(
    json: string,
    mode: ImportMode,
    passphrase?: string,
    selectedCategories?: ImportCategory[],
  ): Promise<Result<ImportSummary>>
  createPreImportSnapshot(): Promise<Result<void>>
  getPreImportSnapshot(): Promise<PreImportSnapshot | null>
  rollbackLastImport(): Promise<Result<ImportSummary>>
}

/**
 * Strip credentials that must never leave the browser in a file.
 */
function redactSecrets(key: string, value: unknown): unknown {
  if (!key.includes('/auth-vault/') || typeof value !== 'object' || value === null) return value
  const entry = value as { login?: Record<string, unknown> }
  if (!entry.login) return value
  const login = { ...entry.login }
  delete login.password
  return { ...entry, login: { ...login, password: '' } }
}

/**
 * Data portability (FDD-010, EPIC-09, DD-039).
 * Handles full workspace / single-project backup, smart delta detection,
 * granular entity-level smart merge, and pre-import undo snapshots.
 */
export class ImportExportService implements ImportExportApi {
  private readonly storage: StorageService
  private readonly bus: EventBus | undefined
  private readonly now: () => number
  private readonly download: Downloader

  constructor(options: ImportExportServiceOptions) {
    this.storage = options.storage
    this.bus = options.bus
    this.now = options.now ?? (() => Date.now())
    this.download = options.download ?? universalDownloader
  }

  /** Build a JSON backup of every stored entry. */
  async exportAll(passphrase?: string): Promise<Result<string>> {
    const keys = await this.storage.list('')
    if (!keys.ok) return keys
    const entries: Record<string, unknown> = {}
    const hasPassphrase = typeof passphrase === 'string' && passphrase.trim().length > 0

    for (const key of keys.value) {
      if (key === SNAPSHOT_KEY) continue
      const got = await this.storage.getData<unknown>(key)
      if (got.ok && got.value !== null) {
        entries[key] = hasPassphrase ? got.value : redactSecrets(key, got.value)
      }
    }

    const bundle: ExportBundle = {
      app: APP_NAME,
      appVersion: APP_VERSION,
      schemaVersion: SCHEMA_VERSION,
      exportedAt: this.now(),
      entries,
    }

    if (hasPassphrase) {
      try {
        const encrypted = await encryptBackup(JSON.stringify(bundle, null, 2), passphrase.trim(), {
          app: APP_NAME,
          appVersion: APP_VERSION,
          schemaVersion: SCHEMA_VERSION,
          exportedAt: bundle.exportedAt,
        })
        this.bus?.publish('DATA_EXPORTED', { modules: rootsOf(Object.keys(entries)) })
        return ok(JSON.stringify(encrypted, null, 2))
      } catch (e) {
        return err(errors.invalid((e as Error).message || 'Failed to encrypt backup'))
      }
    }

    this.bus?.publish('DATA_EXPORTED', { modules: rootsOf(Object.keys(entries)) })
    return ok(JSON.stringify(bundle, null, 2))
  }

  /** Build a JSON backup scoped strictly to a single project. */
  async exportProject(projectId: string, passphrase?: string): Promise<Result<string>> {
    const prefix = `${STORAGE_ROOTS.projects}/${projectId}/`
    const keys = await this.storage.list(prefix)
    if (!keys.ok) return keys
    const entries: Record<string, unknown> = {}
    const hasPassphrase = typeof passphrase === 'string' && passphrase.trim().length > 0

    for (const key of keys.value) {
      if (key === SNAPSHOT_KEY) continue
      const got = await this.storage.getData<unknown>(key)
      if (got.ok && got.value !== null) {
        entries[key] = hasPassphrase ? got.value : redactSecrets(key, got.value)
      }
    }

    // Include project metadata if stored separately
    const metaKeyStr = projectKey(projectId, 'metadata')
    if (!entries[metaKeyStr]) {
      const gotMeta = await this.storage.getData<unknown>(metaKeyStr)
      if (gotMeta.ok && gotMeta.value !== null) {
        entries[metaKeyStr] = gotMeta.value
      }
    }

    const bundle: ExportBundle = {
      app: APP_NAME,
      appVersion: APP_VERSION,
      schemaVersion: SCHEMA_VERSION,
      exportedAt: this.now(),
      entries,
    }

    if (hasPassphrase) {
      try {
        const encrypted = await encryptBackup(JSON.stringify(bundle, null, 2), passphrase.trim(), {
          app: APP_NAME,
          appVersion: APP_VERSION,
          schemaVersion: SCHEMA_VERSION,
          exportedAt: bundle.exportedAt,
        })
        this.bus?.publish('DATA_EXPORTED', { modules: rootsOf(Object.keys(entries)) })
        return ok(JSON.stringify(encrypted, null, 2))
      } catch (e) {
        return err(errors.invalid((e as Error).message || 'Failed to encrypt backup'))
      }
    }

    this.bus?.publish('DATA_EXPORTED', { modules: rootsOf(Object.keys(entries)) })
    return ok(JSON.stringify(bundle, null, 2))
  }

  /**
   * Check whether any storage entries have been modified since `lastBackupAt`.
   * Enables delta detection to skip downloading redundant backups.
   */
  async hasChangesSince(lastBackupAt: number, projectId?: string): Promise<boolean> {
    if (!lastBackupAt || lastBackupAt <= 0) return true
    const prefix = projectId ? `${STORAGE_ROOTS.projects}/${projectId}/` : ''
    const keys = await this.storage.list(prefix)
    if (!keys.ok) return true
    for (const key of keys.value) {
      if (key === SNAPSHOT_KEY) continue
      const envelope = await this.storage.get(key)
      if (envelope.ok && envelope.value && envelope.value.updatedAt > lastBackupAt) {
        return true
      }
    }
    return false
  }

  /** Export and write the bundle to Downloads; emits DATA_BACKED_UP. */
  async backup(
    auto = false,
    passphrase?: string,
    projectId?: string,
    projectName?: string,
    subfolder?: string,
  ): Promise<Result<string>> {
    const exported = projectId
      ? await this.exportProject(projectId, passphrase)
      : await this.exportAll(passphrase)
    if (!exported.ok) return exported

    const filename = formatBackupFilename(projectId ? 'current' : 'all', projectName, this.now())
    this.download(filename, exported.value, 'application/json', {
      subfolder: subfolder ?? DEFAULT_BACKUP_FOLDER,
      saveAs: false,
    })
    this.bus?.publish('DATA_BACKED_UP', {
      modules: rootsOf(Object.keys(parseEntries(exported.value))),
      auto,
      filename,
    })
    return ok(filename)
  }

  isEncrypted(json: string): boolean {
    return isEncryptedBackup(json)
  }

  async decryptBackup(json: string, passphrase: string): Promise<Result<string>> {
    try {
      const decrypted = await decryptBackup(json, passphrase)
      return ok(decrypted)
    } catch (e) {
      return err(errors.invalid((e as Error).message || 'Decryption failed'))
    }
  }

  private parse(json: string): Result<ExportBundle> {
    let parsed: unknown
    try {
      parsed = JSON.parse(json)
    } catch {
      return err(errors.invalid('The file is not valid JSON.'))
    }
    if (!isPlainObject(parsed) || !isPlainObject(parsed.entries)) {
      return err(errors.invalid('Unrecognized backup format (missing "entries").'))
    }
    if (parsed.app !== APP_NAME) {
      return err(errors.invalid('This file is not an OpenAPI Companion backup.'))
    }
    const schemaVersion = typeof parsed.schemaVersion === 'number' ? parsed.schemaVersion : 0
    if (schemaVersion > SCHEMA_VERSION) return err(errors.unsupported(schemaVersion))
    // Sanitize: every key must live under a known root.
    for (const key of Object.keys(parsed.entries)) {
      const root = key.split('/')[0] ?? ''
      if (!KNOWN_ROOTS.has(root)) return err(errors.unsafe(key))
    }
    return ok(parsed as unknown as ExportBundle)
  }

  previewImport(json: string): Result<ImportPreview> {
    if (isEncryptedBackup(json)) {
      return err({
        code: 'IMPORT_ENCRYPTED',
        message:
          'This backup is encrypted with a passphrase. Please enter the passphrase to unlock and preview.',
        recoverable: true,
      })
    }
    const parsed = this.parse(json)
    if (!parsed.ok) return parsed
    const bundle = parsed.value
    const keys = Object.keys(bundle.entries)
    const byRoot: Record<string, number> = {}
    const projectIds = new Set<string>()

    const categoryCounts: Record<ImportCategory, number> = {
      presets: 0,
      environments: 0,
      workflows: 0,
      headers: 0,
      rules: 0,
      auth: 0,
      settings: 0,
      history: 0,
    }

    for (const key of keys) {
      const root = key.split('/')[0] ?? ''
      byRoot[root] = (byRoot[root] ?? 0) + 1
      if (root === STORAGE_ROOTS.projects) {
        const id = key.split('/')[1]
        if (id) projectIds.add(id)
      }

      const cat = categorizeKey(key)
      const val = bundle.entries[key]
      if (cat === 'workflows' && Array.isArray(val)) {
        categoryCounts.workflows += val.length
      } else if (cat === 'headers' && Array.isArray(val)) {
        categoryCounts.headers += val.length
      } else if (cat === 'rules' && Array.isArray(val)) {
        categoryCounts.rules += val.length
      } else {
        categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1
      }
    }

    const categoryLabels: Record<ImportCategory, string> = {
      presets: 'Request Presets',
      environments: 'Environments & Variables',
      workflows: 'Workflows',
      headers: 'Global Debug Headers',
      rules: 'Auto-Extraction Rules',
      auth: 'Authentication Vault',
      settings: 'Preferences & Settings',
      history: 'Request History',
    }

    const categories: ImportPreviewCategoryItem[] = (
      Object.keys(categoryCounts) as ImportCategory[]
    )
      .filter((cat) => categoryCounts[cat] > 0)
      .map((cat) => ({
        id: cat,
        label: categoryLabels[cat],
        count: categoryCounts[cat],
        defaultSelected: cat !== 'settings' && cat !== 'history',
      }))

    return ok({
      appVersion: bundle.appVersion,
      schemaVersion: bundle.schemaVersion,
      exportedAt: bundle.exportedAt,
      total: keys.length,
      byRoot,
      projectCount: projectIds.size,
      containsSecrets: keys.some(
        (k) => k.includes('/authentication/') || k.includes('/auth-vault/'),
      ),
      categories,
    })
  }

  /** Capture a full storage snapshot before applying an import, enabling 1-click rollback. */
  async createPreImportSnapshot(): Promise<Result<void>> {
    const allKeys = await this.storage.list('')
    if (!allKeys.ok) return allKeys
    const entries: Record<string, unknown> = {}
    for (const key of allKeys.value) {
      if (key === SNAPSHOT_KEY) continue
      const got = await this.storage.getData(key)
      if (got.ok && got.value !== null) {
        entries[key] = got.value
      }
    }
    const snapshot: PreImportSnapshot = {
      timestamp: this.now(),
      mode: 'replace',
      entries,
    }
    return await this.storage.set(SNAPSHOT_KEY, snapshot, { immediate: true })
  }

  /** Retrieve current pre-import snapshot, if any. */
  async getPreImportSnapshot(): Promise<PreImportSnapshot | null> {
    const got = await this.storage.getData<PreImportSnapshot>(SNAPSHOT_KEY)
    return got.ok && got.value ? got.value : null
  }

  /** Roll back storage to the exact state captured prior to the last import. */
  async rollbackLastImport(): Promise<Result<ImportSummary>> {
    const snapshot = await this.getPreImportSnapshot()
    if (!snapshot || !snapshot.entries) {
      return err(errors.invalid('No pre-import restore point found to roll back.'))
    }
    let restored = 0
    for (const [key, value] of Object.entries(snapshot.entries)) {
      const written = await this.storage.set(key, value)
      if (!written.ok) return written
      restored++
    }
    await this.storage.remove(SNAPSHOT_KEY)
    const flushed = await this.storage.flush()
    if (!flushed.ok) return flushed
    const summary: ImportSummary = { imported: restored, skipped: 0, renamed: 0 }
    this.bus?.publish('DATA_IMPORTED', { summary })
    return ok(summary)
  }

  /**
   * Apply import bundle with support for 'replace', 'skip', and deep entity 'merge'.
   * Creates an automatic pre-import snapshot so the user can easily undo if needed.
   */
  async applyImport(
    json: string,
    mode: ImportMode,
    passphrase?: string,
    selectedCategories?: ImportCategory[],
  ): Promise<Result<ImportSummary>> {
    let payload = json
    if (isEncryptedBackup(json)) {
      if (!passphrase) {
        return err({
          code: 'IMPORT_ENCRYPTED',
          message: 'Passphrase is required to import this encrypted backup.',
          recoverable: true,
        })
      }
      const dec = await this.decryptBackup(json, passphrase)
      if (!dec.ok) return dec
      payload = dec.value
    }
    const parsed = this.parse(payload)
    if (!parsed.ok) return parsed

    // Create automatic pre-import restore point
    await this.createPreImportSnapshot()

    let imported = 0
    let skipped = 0
    let renamed = 0

    const selectedSet = selectedCategories ? new Set(selectedCategories) : null

    for (const [key, value] of Object.entries(parsed.value.entries)) {
      const category = categorizeKey(key)
      if (selectedSet && !selectedSet.has(category)) {
        skipped++
        continue
      }

      if (mode === 'replace') {
        const written = await this.storage.set(key, value)
        if (!written.ok) return written
        imported++
        continue
      }

      if (mode === 'skip') {
        const existing = await this.storage.get(key)
        if (existing.ok && existing.value) {
          skipped++
          continue
        }
        const written = await this.storage.set(key, value)
        if (!written.ok) return written
        imported++
        continue
      }

      // mode === 'merge': Deep entity-level merge & rename
      // 1. Request Presets / Templates
      if (key.includes('/requests/template/')) {
        const existing = await this.storage.getData<Record<string, unknown>>(key)
        if (existing.ok && existing.value) {
          const incomingVal = value as Record<string, unknown>
          const incomingName = String(incomingVal?.name ?? 'Preset')
          const newId = `t_${this.now()}_${Math.random().toString(36).slice(2, 7)}`
          const newKey = key.slice(0, key.lastIndexOf('/') + 1) + newId
          const renamedVal = {
            ...incomingVal,
            id: newId,
            name: `${incomingName} (Imported)`,
          }
          const written = await this.storage.set(newKey, renamedVal)
          if (!written.ok) return written
          imported++
          renamed++
        } else {
          const written = await this.storage.set(key, value)
          if (!written.ok) return written
          imported++
        }
        continue
      }

      // 2. Workflows array
      if (key.endsWith('/workflows')) {
        const existingRes = await this.storage.getData<Array<Record<string, unknown>>>(key)
        const existing: Array<Record<string, unknown>> =
          existingRes.ok && Array.isArray(existingRes.value) ? existingRes.value : []
        const incomingList = Array.isArray(value) ? (value as Array<Record<string, unknown>>) : []
        const mergedList = [...existing]
        for (const item of incomingList) {
          const conflict = existing.find(
            (e: Record<string, unknown>) => e.id === item.id || (e.name && e.name === item.name),
          )
          if (conflict) {
            const newId = `wf_${this.now()}_${Math.random().toString(36).slice(2, 7)}`
            const renamedName = `${String(item.name ?? 'Workflow')} (Imported)`
            mergedList.push({ ...item, id: newId, name: renamedName })
            imported++
            renamed++
          } else {
            mergedList.push(item)
            imported++
          }
        }
        const written = await this.storage.set(key, mergedList)
        if (!written.ok) return written
        continue
      }

      // 3. Global Headers array
      if (key.endsWith('/global-headers')) {
        const existingRes = await this.storage.getData<Array<Record<string, unknown>>>(key)
        const existing: Array<Record<string, unknown>> =
          existingRes.ok && Array.isArray(existingRes.value) ? existingRes.value : []
        const incomingList = Array.isArray(value) ? (value as Array<Record<string, unknown>>) : []
        const mergedList = [...existing]
        for (const item of incomingList) {
          const nameLower = String(item.name ?? '').toLowerCase()
          const conflict = existing.some(
            (e: Record<string, unknown>) => String(e.name ?? '').toLowerCase() === nameLower,
          )
          if (conflict) {
            skipped++
          } else {
            mergedList.push(item)
            imported++
          }
        }
        const written = await this.storage.set(key, mergedList)
        if (!written.ok) return written
        continue
      }

      // 4. Extraction rules array
      if (key.endsWith('/extraction-rules')) {
        const existingRes = await this.storage.getData<Array<Record<string, unknown>>>(key)
        const existing: Array<Record<string, unknown>> =
          existingRes.ok && Array.isArray(existingRes.value) ? existingRes.value : []
        const incomingList = Array.isArray(value) ? (value as Array<Record<string, unknown>>) : []
        const mergedList = [...existing]
        for (const item of incomingList) {
          const conflict = existing.some(
            (e: Record<string, unknown>) =>
              e.variableName === item.variableName && e.path === item.path,
          )
          if (conflict) {
            skipped++
          } else {
            const newId = `rule_${this.now()}_${Math.random().toString(36).slice(2, 7)}`
            mergedList.push({ ...item, id: newId })
            imported++
          }
        }
        const written = await this.storage.set(key, mergedList)
        if (!written.ok) return written
        continue
      }

      // 5. Environments (merges variables non-destructively)
      if (key.includes('/environments/')) {
        const existing = await this.storage.getData<Record<string, unknown>>(key)
        if (existing.ok && existing.value) {
          const incomingEnv = value as Record<string, unknown>
          const localVars = (existing.value.variables as Record<string, unknown>) ?? {}
          const incomingVars = (incomingEnv.variables as Record<string, unknown>) ?? {}
          const mergedVars = { ...incomingVars, ...localVars }
          const mergedEnv = {
            ...incomingEnv,
            ...existing.value,
            variables: mergedVars,
          }
          const written = await this.storage.set(key, mergedEnv)
          if (!written.ok) return written
          imported++
        } else {
          const written = await this.storage.set(key, value)
          if (!written.ok) return written
          imported++
        }
        continue
      }

      // 6. Settings or other scalar keys in merge mode: keep local data if present
      const existing = await this.storage.get(key)
      if (existing.ok && existing.value) {
        skipped++
        continue
      }
      const written = await this.storage.set(key, value)
      if (!written.ok) return written
      imported++
    }

    const flushed = await this.storage.flush()
    if (!flushed.ok) return flushed
    const summary: ImportSummary = { imported, skipped, renamed }
    this.bus?.publish('DATA_IMPORTED', { summary })
    return ok(summary)
  }
}

function rootsOf(keys: string[]): string[] {
  return [...new Set(keys.map((k) => k.split('/')[0] ?? ''))].filter(Boolean)
}

function parseEntries(json: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(json) as { entries?: Record<string, unknown> }
    return parsed.entries ?? {}
  } catch {
    return {}
  }
}

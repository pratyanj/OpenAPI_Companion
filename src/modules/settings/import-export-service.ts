import { ok, err, type Result, type AppError } from '@/types'
import { APP_NAME, APP_VERSION, SCHEMA_VERSION, STORAGE_ROOTS } from '@/constants'
import type { EventBus, ImportSummary } from '@/core/events'
import type { StorageService } from '@/core/storage'
import type { ExportBundle, ImportMode, ImportPreview } from './types'
import { encryptBackup, decryptBackup, isEncryptedBackup } from '@/utils/crypto-backup'

/** Inject a downloader (tests spy it; default writes a file via an anchor). */
export type Downloader = (filename: string, content: string, mime: string) => void

export interface ImportExportServiceOptions {
  storage: StorageService
  bus?: EventBus
  now?: () => number
  download?: Downloader
}

const KNOWN_ROOTS = new Set<string>(Object.values(STORAGE_ROOTS))

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

/** Anchor+Blob download — works from the content script (no chrome.downloads). */
const anchorDownload: Downloader = (filename, content, mime) => {
  if (typeof URL === 'undefined' || !URL.createObjectURL) return
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export interface ImportExportApi {
  exportAll(passphrase?: string): Promise<Result<string>>
  backup(auto?: boolean, passphrase?: string): Promise<Result<string>>
  decryptBackup(json: string, passphrase: string): Promise<Result<string>>
  isEncrypted(json: string): boolean
  previewImport(json: string): Result<ImportPreview>
  applyImport(json: string, mode: ImportMode, passphrase?: string): Promise<Result<ImportSummary>>
}

/**
 * Strip credentials that must never leave the browser in a file.
 *
 * A saved token is scoped and expires; the LOGIN attached to it (username +
 * password) does not, and backups get emailed, committed and shared. Tokens stay
 * — losing them just means re-authorizing — but the password is dropped, so a
 * restored vault entry simply asks for it again.
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
 * Data portability (FDD-010, EPIC-09, DD-039). Exports every stored entry to a
 * versioned JSON bundle and re-imports it with strict validation: unparseable or
 * future-schema files are rejected before any write, and keys outside the
 * extension's own namespace are refused (sanitization, EC-045/047) so a hostile
 * file can never inject arbitrary storage. Imports never overwrite without an
 * explicit mode (business rule).
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
    this.download = options.download ?? anchorDownload
  }

  /**
   * Build a JSON backup of every stored entry.
   * If a passphrase is provided, credentials are kept and the bundle is encrypted with AES-GCM (PBKDF2).
   * If omitted, passwords are redacted to ensure plaintext files do not leak credentials.
   */
  async exportAll(passphrase?: string): Promise<Result<string>> {
    const keys = await this.storage.list('')
    if (!keys.ok) return keys
    const entries: Record<string, unknown> = {}
    const hasPassphrase = typeof passphrase === 'string' && passphrase.trim().length > 0

    for (const key of keys.value) {
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
        const encrypted = await encryptBackup(
          JSON.stringify(bundle, null, 2),
          passphrase.trim(),
          {
            app: APP_NAME,
            appVersion: APP_VERSION,
            schemaVersion: SCHEMA_VERSION,
            exportedAt: bundle.exportedAt,
          },
        )
        this.bus?.publish('DATA_EXPORTED', { modules: rootsOf(Object.keys(entries)) })
        return ok(JSON.stringify(encrypted, null, 2))
      } catch (e) {
        return err(errors.invalid((e as Error).message || 'Failed to encrypt backup'))
      }
    }

    this.bus?.publish('DATA_EXPORTED', { modules: rootsOf(Object.keys(entries)) })
    return ok(JSON.stringify(bundle, null, 2))
  }

  /** Export and write the bundle to Downloads; emits DATA_BACKED_UP. */
  async backup(auto = false, passphrase?: string): Promise<Result<string>> {
    const exported = await this.exportAll(passphrase)
    if (!exported.ok) return exported
    const filename = `openapi-companion-backup-${this.now()}.json`
    this.download(filename, exported.value, 'application/json')
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
        message: 'This backup is encrypted with a passphrase. Please enter the passphrase to unlock and preview.',
        recoverable: true,
      })
    }
    const parsed = this.parse(json)
    if (!parsed.ok) return parsed
    const bundle = parsed.value
    const keys = Object.keys(bundle.entries)
    const byRoot: Record<string, number> = {}
    const projectIds = new Set<string>()
    for (const key of keys) {
      const root = key.split('/')[0] ?? ''
      byRoot[root] = (byRoot[root] ?? 0) + 1
      if (root === STORAGE_ROOTS.projects) {
        const id = key.split('/')[1]
        if (id) projectIds.add(id)
      }
    }
    return ok({
      appVersion: bundle.appVersion,
      schemaVersion: bundle.schemaVersion,
      exportedAt: bundle.exportedAt,
      total: keys.length,
      byRoot,
      projectCount: projectIds.size,
      containsSecrets: keys.some((k) => k.includes('/authentication/')),
    })
  }

  async applyImport(json: string, mode: ImportMode, passphrase?: string): Promise<Result<ImportSummary>> {
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
    let imported = 0
    let skipped = 0
    for (const [key, value] of Object.entries(parsed.value.entries)) {
      if (mode === 'skip') {
        const existing = await this.storage.get(key)
        if (existing.ok && existing.value) {
          skipped++
          continue
        }
      }
      const written = await this.storage.set(key, value)
      if (!written.ok) return written
    }
    const flushed = await this.storage.flush()
    if (!flushed.ok) return flushed
    imported = Object.keys(parsed.value.entries).length - skipped
    const summary: ImportSummary = { imported, skipped, renamed: 0 }
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

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Result } from '@/types'
import type { EventBus, ImportSummary } from '@/core/events'
import { useTheme } from '@/hooks'
import type { ThemeManager, ThemePreference } from '@/services'
import { APP_NAME, APP_VERSION } from '@/constants'
import {
  Badge,
  Button,
  Dialog,
  DeleteIcon,
  ExternalLinkIcon,
  EyeIcon,
  LockIcon,
} from '@/components'
import type { SettingsApi } from './settings-service'
import type { ImportExportApi } from './import-export-service'
import type {
  BackupFrequency,
  BackupScope,
  ImportCategory,
  ImportMode,
  ImportPreview,
  Preferences,
  PreImportSnapshot,
  StorageMetrics,
} from './types'
import { DEFAULT_BACKUP_FOLDER } from './types'

interface SettingsPanelProps {
  settings: SettingsApi
  io: ImportExportApi
  theme: ThemeManager
  projectId?: string
  bus: EventBus
}

const THEMES: ThemePreference[] = ['light', 'dark', 'system']

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

/** Blob.text() with a FileReader fallback (older engines / jsdom). */
function readFileText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted">{title}</h3>
      {children}
    </section>
  )
}

export function SettingsPanel({ settings, io, theme, projectId, bus }: SettingsPanelProps) {
  const { preference } = useTheme(theme)
  const [prefs, setPrefs] = useState<Preferences | null>(null)
  const [metrics, setMetrics] = useState<StorageMetrics | null>(null)
  type ConfirmTarget = 'project' | 'all' | { type: 'single'; projectId: string; name?: string }
  const [confirm, setConfirm] = useState<ConfirmTarget | null>(null)
  const [importText, setImportText] = useState('')
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)
  const [importMode, setImportMode] = useState<ImportMode>('skip')
  const [selectedCategories, setSelectedCategories] = useState<Record<ImportCategory, boolean>>({
    presets: true,
    environments: true,
    workflows: true,
    headers: true,
    rules: true,
    auth: true,
    settings: false,
    history: false,
  })
  const [hasRestorePoint, setHasRestorePoint] = useState<PreImportSnapshot | null>(null)

  // Passphrase protection for backup & restore
  const [backupPassphrase, setBackupPassphrase] = useState('')
  const [showBackupPassphrase, setShowBackupPassphrase] = useState(false)

  // Encrypted restore state
  const [isEncryptedPayload, setIsEncryptedPayload] = useState(false)
  const [decryptPassphrase, setDecryptPassphrase] = useState('')
  const [showDecryptPassphrase, setShowDecryptPassphrase] = useState(false)
  const [decryptError, setDecryptError] = useState<string | null>(null)
  const [decryptedPayload, setDecryptedPayload] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const restoreFileRef = useRef<HTMLInputElement>(null)

  const notify = (kind: 'success' | 'warning' | 'error', message: string) =>
    bus.publish('NOTIFY', { kind, message })

  const loadMetrics = useCallback(
    async () => setMetrics(await settings.getStorageMetrics()),
    [settings],
  )

  useEffect(() => {
    void settings.getPreferences().then(setPrefs)
    void loadMetrics()
    void io.getPreImportSnapshot?.().then((snap) => setHasRestorePoint(snap ?? null))
  }, [settings, loadMetrics, io])

  const setPref = async <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    await settings.setPreference(key, value)
    setPrefs((p) => (p ? { ...p, [key]: value } : p))
  }

  const runClear = async () => {
    const which = confirm
    setConfirm(null)
    if (which === 'project' && projectId) {
      const r = await settings.clearProject(projectId)
      notify(r.ok ? 'success' : 'error', r.ok ? `Cleared ${r.value} entries.` : r.error.message)
    } else if (typeof which === 'object' && which?.type === 'single') {
      const r = await settings.clearProject(which.projectId)
      notify(
        r.ok ? 'success' : 'error',
        r.ok ? `Cleared ${r.value} entries for ${which.name || which.projectId}.` : r.error.message,
      )
    } else if (which === 'all') {
      const r = await settings.clearAll()
      notify(
        r.ok ? 'success' : 'error',
        r.ok ? 'All data cleared. Reload the page.' : r.error.message,
      )
    }
    await loadMetrics()
  }

  const openUrl = (url: string) => {
    try {
      if (
        typeof chrome !== 'undefined' &&
        chrome.tabs &&
        typeof chrome.tabs.create === 'function'
      ) {
        void chrome.tabs.create({ url })
      } else {
        window.open(url, '_blank', 'noopener,noreferrer')
      }
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  const backup = async (scope: BackupScope = 'all') => {
    setBusy(true)
    const pass = backupPassphrase.trim() || undefined
    const projId = scope === 'current' ? projectId : undefined
    const currentMetric = metrics?.projects.find((p) => p.projectId === projectId)
    const projName = currentMetric?.name || projectId
    const folder = prefs?.backupFolder
    const isCustomFolder = Boolean(folder && folder !== DEFAULT_BACKUP_FOLDER)
    const r = projId
      ? await io.backup(false, pass, projId, projName, isCustomFolder ? folder : undefined)
      : pass !== undefined
        ? isCustomFolder
          ? await io.backup(false, pass, undefined, undefined, folder)
          : await io.backup(false, pass)
        : isCustomFolder
          ? await io.backup(false, undefined, undefined, undefined, folder)
          : await io.backup(false)
    notify(
      r.ok ? 'success' : 'error',
      r.ok
        ? `Backup saved: ${r.value}${pass ? ' (encrypted with passphrase)' : ''}`
        : r.error.message,
    )
    if (r.ok) {
      await setPref('lastBackupAt', Date.now())
      await setPref('lastBackupStatus', `Saved ${r.value}`)
    }
    setBusy(false)
  }

  const preview = (text = importText) => {
    const raw = text.trim()
    if (!raw) return

    if (io.isEncrypted?.(raw) ?? false) {
      setIsEncryptedPayload(true)
      setDecryptError(null)
      setImportPreview(null)
      return
    }

    setIsEncryptedPayload(false)
    const r = io.previewImport(raw)
    if (r.ok) {
      setImportPreview(r.value)
      if (r.value.categories) {
        const next: Record<string, boolean> = {}
        for (const cat of r.value.categories) {
          next[cat.id] = cat.defaultSelected
        }
        setSelectedCategories((prev) => ({ ...prev, ...next }))
      }
    } else {
      setImportPreview(null)
      notify('error', r.error.message)
    }
  }

  const handleDecrypt = async () => {
    if (!decryptPassphrase.trim()) return
    setBusy(true)
    setDecryptError(null)
    const r = await io.decryptBackup(importText, decryptPassphrase)
    if (r.ok) {
      setDecryptedPayload(r.value)
      setIsEncryptedPayload(false)
      const prev = io.previewImport(r.value)
      if (prev.ok) {
        setImportPreview({ ...prev.value, isEncrypted: true })
        if (prev.value.categories) {
          const next: Record<string, boolean> = {}
          for (const cat of prev.value.categories) {
            next[cat.id] = cat.defaultSelected
          }
          setSelectedCategories((p) => ({ ...p, ...next }))
        }
        notify('success', 'Backup decrypted successfully!')
      } else {
        setDecryptError(prev.error.message)
      }
    } else {
      setDecryptError('Incorrect passphrase or corrupted backup file.')
    }
    setBusy(false)
  }

  /** Restore = pick the downloaded backup file → same preview → import flow. */
  const onRestoreFile = async (file: File | undefined) => {
    if (!file) return
    try {
      const text = await readFileText(file)
      setImportText(text)
      setDecryptedPayload(null)
      setDecryptPassphrase('')
      setDecryptError(null)
      preview(text)
    } catch {
      notify('error', 'Could not read the selected file.')
    }
  }

  const applyImport = async () => {
    setBusy(true)
    const payloadToImport = decryptedPayload || importText
    const pass = decryptedPayload ? undefined : decryptPassphrase.trim() || undefined
    const chosenCategories = (Object.keys(selectedCategories) as ImportCategory[]).filter(
      (k) => selectedCategories[k],
    )
    const isCustomCategories =
      importPreview?.categories && chosenCategories.length < importPreview.categories.length
    const r: Result<ImportSummary> =
      pass !== undefined
        ? await io.applyImport(
            payloadToImport,
            importMode,
            pass,
            isCustomCategories ? chosenCategories : undefined,
          )
        : isCustomCategories
          ? await io.applyImport(payloadToImport, importMode, undefined, chosenCategories)
          : await io.applyImport(payloadToImport, importMode)
    if (r.ok) {
      const { imported, skipped, renamed } = r.value
      const details = [
        `Imported: ${imported}`,
        renamed > 0 ? `Renamed: ${renamed}` : null,
        skipped > 0 ? `Skipped: ${skipped}` : null,
      ]
        .filter(Boolean)
        .join(', ')
      notify('success', `Import complete (${details}).`)
      setImportText('')
      setImportPreview(null)
      setDecryptedPayload(null)
      setDecryptPassphrase('')
      setIsEncryptedPayload(false)
      await loadMetrics()
      void io.getPreImportSnapshot?.().then((snap) => setHasRestorePoint(snap ?? null))
    } else {
      notify('error', r.error.message)
    }
    setBusy(false)
  }

  const handleRollback = async () => {
    setBusy(true)
    const r = await io.rollbackLastImport()
    if (r.ok) {
      notify('success', `Rolled back ${r.value.imported} items to pre-import restore point.`)
      setHasRestorePoint(null)
      await loadMetrics()
    } else {
      notify('error', r.error.message)
    }
    setBusy(false)
  }

  return (
    <div className="flex flex-col gap-4 p-4 text-xs">
      <Section title="Appearance">
        <div className="flex gap-1" role="radiogroup" aria-label="Theme">
          {THEMES.map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={preference === t}
              onClick={() => void theme.setPreference(t)}
              className={
                preference === t
                  ? 'flex-1 rounded-md bg-primary px-2 py-1 font-medium capitalize text-white'
                  : 'flex-1 rounded-md border border-border px-2 py-1 capitalize text-text hover:bg-surface'
              }
            >
              {t}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Storage">
        <div className="rounded-md border border-border">
          <div className="flex items-center justify-between border-b border-border px-2 py-1.5 bg-surface/50">
            <span className="font-semibold text-text">Total used</span>
            <span className="font-mono text-muted">{formatBytes(metrics?.totalBytes ?? 0)}</span>
          </div>
          <div className="flex flex-col divide-y divide-border">
            {(metrics?.projects ?? []).map((p) => {
              const displayName = p.name || p.originUrl || p.openApiUrl || p.projectId
              const originHost = p.originUrl
                ? (() => {
                    try {
                      return new URL(p.originUrl).host
                    } catch {
                      return p.originUrl
                    }
                  })()
                : null
              const isCurrent = p.projectId === projectId
              return (
                <div
                  key={p.projectId}
                  className="flex items-center justify-between p-2 hover:bg-surface/30 transition-colors"
                >
                  <div className="flex flex-col min-w-0 flex-1 pr-2">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-medium text-text" title={displayName}>
                        {displayName}
                      </span>
                      {isCurrent && (
                        <span className="rounded bg-primary/10 px-1 py-0.2 text-[9px] font-semibold text-primary">
                          current
                        </span>
                      )}
                      {p.originUrl ? (
                        <button
                          type="button"
                          onClick={() => openUrl(p.originUrl!)}
                          title={`Open ${p.originUrl} in new tab`}
                          aria-label={`Open ${displayName} in new tab`}
                          className="p-0.5 text-muted hover:text-primary transition-colors"
                        >
                          <ExternalLinkIcon className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                    {p.originUrl && (
                      <span
                        className="truncate text-[10px] text-muted font-mono"
                        title={p.originUrl}
                      >
                        {p.originUrl}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-muted text-[11px]">{formatBytes(p.bytes)}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setConfirm({
                          type: 'single',
                          projectId: p.projectId,
                          name: p.name || originHost || p.projectId,
                        })
                      }
                      title={`Clear data for ${displayName}`}
                      aria-label={`Clear data for ${displayName}`}
                      className="p-1 rounded text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                    >
                      <DeleteIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {projectId && (
            <Button
              variant="secondary"
              onClick={() => setConfirm('project')}
              disabled={busy}
              className="text-danger"
            >
              Clear current project
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={() => setConfirm('all')}
            disabled={busy}
            className="text-danger"
          >
            Clear all data
          </Button>
        </div>
      </Section>

      <Section title="Automated Backups">
        <div className="flex flex-col gap-2.5 rounded-md border border-border bg-surface/40 p-3">
          <label className="flex items-center justify-between text-text cursor-pointer">
            <span className="font-medium text-xs">Enable Scheduled Backup</span>
            <input
              type="checkbox"
              aria-label="Enable scheduled backup"
              checked={prefs?.autoBackup ?? false}
              onChange={(e) => void setPref('autoBackup', e.target.checked)}
              className="rounded border-border text-primary focus:ring-primary h-4 w-4"
            />
          </label>

          {prefs?.autoBackup && (
            <div className="flex flex-col gap-2.5 border-t border-border/60 pt-2.5 animate-in fade-in duration-150">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted">Frequency:</span>
                <select
                  value={prefs.autoBackupFrequency ?? '24h'}
                  aria-label="Backup frequency"
                  onChange={(e) =>
                    void setPref('autoBackupFrequency', e.target.value as BackupFrequency)
                  }
                  className="rounded-md border border-border bg-bg px-2 py-1 text-xs text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                >
                  <option value="30m">Every 30 minutes</option>
                  <option value="2h">Every 2 hours</option>
                  <option value="6h">Every 6 hours</option>
                  <option value="12h">Every 12 hours</option>
                  <option value="24h">Daily (24 hours)</option>
                  <option value="custom">Custom interval</option>
                </select>
              </div>

              {prefs.autoBackupFrequency === 'custom' && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted">Interval (minutes):</span>
                  <input
                    type="number"
                    min="1"
                    max="10080"
                    value={prefs.autoBackupCustomMinutes ?? 60}
                    aria-label="Custom backup interval in minutes"
                    onChange={(e) =>
                      void setPref('autoBackupCustomMinutes', Math.max(1, Number(e.target.value)))
                    }
                    className="w-24 rounded-md border border-border bg-bg px-2 py-1 text-xs text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-primary text-right"
                  />
                </div>
              )}

              <label className="flex items-center gap-2 text-[11px] text-text cursor-pointer">
                <input
                  type="checkbox"
                  checked={prefs.autoBackupSkipUnchanged ?? true}
                  onChange={(e) => void setPref('autoBackupSkipUnchanged', e.target.checked)}
                  className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5"
                />
                <span>Skip backup if no data changed since last backup</span>
              </label>

              {projectId && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted">Backup Scope:</span>
                  <select
                    value={prefs.autoBackupScope ?? 'all'}
                    aria-label="Backup scope"
                    onChange={(e) => void setPref('autoBackupScope', e.target.value as BackupScope)}
                    className="rounded-md border border-border bg-bg px-2 py-1 text-xs text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                  >
                    <option value="all">Full Workspace (All Projects)</option>
                    <option value="current">Current Project Only</option>
                  </select>
                </div>
              )}

              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted">Backup Subfolder:</span>
                  <input
                    type="text"
                    value={prefs.backupFolder ?? DEFAULT_BACKUP_FOLDER}
                    aria-label="Backup subfolder"
                    placeholder={DEFAULT_BACKUP_FOLDER}
                    onChange={(e) => void setPref('backupFolder', e.target.value)}
                    className="w-48 rounded-md border border-border bg-bg px-2 py-1 text-xs text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-primary font-mono text-right"
                  />
                </div>
                <span className="text-[10px] text-muted truncate">
                  📁 Saved to: Downloads/
                  {(prefs.backupFolder || DEFAULT_BACKUP_FOLDER).replace(/^\/+|\/+$/g, '')}/
                </span>
              </div>

              {prefs.lastBackupStatus && (
                <div className="rounded bg-surface px-2 py-1 text-[10px] text-muted font-mono truncate">
                  Status: {prefs.lastBackupStatus}
                </div>
              )}
            </div>
          )}
        </div>
      </Section>

      <Section title="Data">
        {/* Passphrase protection input */}
        <div className="flex flex-col gap-1.5 rounded-md border border-border bg-surface/40 p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-text flex items-center gap-1.5">
              <LockIcon className="h-3.5 w-3.5 text-primary" />
              <span>Passphrase Protection (AES-GCM)</span>
            </span>
            <span className="text-[10px] text-muted">Optional</span>
          </div>
          <p className="text-[10px] text-muted leading-relaxed">
            Protect your backup with a password to export credentials safely. Team members will need
            this password to restore. If empty, passwords are left out.
          </p>
          <div className="relative flex items-center">
            <input
              type={showBackupPassphrase ? 'text' : 'password'}
              value={backupPassphrase}
              onChange={(e) => setBackupPassphrase(e.target.value)}
              placeholder="Enter passphrase for encrypted export..."
              aria-label="Backup passphrase"
              className="w-full rounded-md border border-border bg-bg px-2.5 py-1.5 text-xs text-text pr-8 focus:outline-none focus-visible:ring-1 focus-visible:ring-primary"
            />
            <button
              type="button"
              onClick={() => setShowBackupPassphrase(!showBackupPassphrase)}
              className="absolute right-2 text-muted hover:text-text p-0.5"
              title={showBackupPassphrase ? 'Hide passphrase' : 'Show passphrase'}
              aria-label={showBackupPassphrase ? 'Hide passphrase' : 'Show passphrase'}
            >
              <EyeIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Restore point alert banner */}
        {hasRestorePoint && (
          <div className="flex items-center justify-between gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] animate-in fade-in duration-150">
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="font-semibold text-amber-500">Restore Point Available</span>
              <span className="text-muted text-[10px] truncate">
                Captured prior to last import (
                {new Date(hasRestorePoint.timestamp).toLocaleTimeString()}).
              </span>
            </div>
            <Button
              variant="secondary"
              onClick={() => void handleRollback()}
              disabled={busy}
              className="shrink-0 text-amber-500 hover:text-amber-400"
            >
              Undo Import
            </Button>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void backup('all')} disabled={busy}>
            {backupPassphrase.trim() ? 'Download encrypted backup' : 'Download backup'}
          </Button>
          {projectId && (
            <Button variant="secondary" onClick={() => void backup('current')} disabled={busy}>
              Download project backup
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={() => restoreFileRef.current?.click()}
            disabled={busy}
          >
            Restore from backup…
          </Button>
        </div>
        <input
          ref={restoreFileRef}
          type="file"
          accept=".json,application/json"
          aria-label="Restore backup file"
          className="hidden"
          onChange={(e) => {
            void onRestoreFile(e.target.files?.[0])
            e.target.value = '' // allow re-picking the same file
          }}
        />

        <textarea
          value={importText}
          onChange={(e) => {
            const val = e.target.value
            setImportText(val)
            setImportPreview(null)
            setDecryptedPayload(null)
            setDecryptError(null)
            if (val.trim() && (io.isEncrypted?.(val.trim()) ?? false)) {
              setIsEncryptedPayload(true)
            } else {
              setIsEncryptedPayload(false)
            }
          }}
          placeholder="…or paste a backup's JSON here to import"
          aria-label="Import JSON"
          rows={3}
          className="rounded-md border border-border bg-surface p-2 font-mono text-[11px] text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />

        {/* Encrypted backup unlock prompt */}
        {isEncryptedPayload && !importPreview && (
          <div className="flex flex-col gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 animate-in fade-in duration-150">
            <div className="flex items-center gap-1.5 font-semibold text-xs text-amber-500">
              <LockIcon className="h-4 w-4" />
              <span>Encrypted Backup Detected</span>
            </div>
            <p className="text-[11px] text-muted leading-relaxed">
              This backup is protected with a passphrase. Enter the passphrase to decrypt
              credentials and preview.
            </p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showDecryptPassphrase ? 'text' : 'password'}
                  value={decryptPassphrase}
                  onChange={(e) => {
                    setDecryptPassphrase(e.target.value)
                    setDecryptError(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleDecrypt()
                  }}
                  placeholder="Enter backup passphrase..."
                  aria-label="Decrypt passphrase"
                  className="w-full rounded-md border border-border bg-bg px-2.5 py-1.5 text-xs text-text pr-8 focus:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                />
                <button
                  type="button"
                  onClick={() => setShowDecryptPassphrase(!showDecryptPassphrase)}
                  className="absolute right-2 top-2 text-muted hover:text-text"
                  title={showDecryptPassphrase ? 'Hide passphrase' : 'Show passphrase'}
                  aria-label={showDecryptPassphrase ? 'Hide passphrase' : 'Show passphrase'}
                >
                  <EyeIcon className="h-3.5 w-3.5" />
                </button>
              </div>
              <Button
                variant="primary"
                onClick={() => void handleDecrypt()}
                disabled={!decryptPassphrase.trim() || busy}
              >
                Decrypt
              </Button>
            </div>
            {decryptError && (
              <span className="text-[11px] text-danger font-medium">{decryptError}</span>
            )}
          </div>
        )}

        {importPreview ? (
          <div className="flex flex-col gap-2.5 rounded-md border border-border bg-surface p-3 animate-in fade-in duration-150">
            <div className="flex flex-wrap items-center gap-2">
              <Badge kind="info">{importPreview.total} entries</Badge>
              <Badge kind="neutral">{importPreview.projectCount} projects</Badge>
              {importPreview.containsSecrets ? (
                <Badge kind="warning">contains secrets</Badge>
              ) : null}
              {importPreview.isEncrypted ? (
                <Badge kind="success">
                  <span className="inline-flex items-center gap-1">
                    <LockIcon className="h-3 w-3" />
                    Decrypted
                  </span>
                </Badge>
              ) : null}
            </div>

            {/* Selective Categories Checklist */}
            {importPreview.categories && importPreview.categories.length > 0 && (
              <div className="flex flex-col gap-1.5 rounded border border-border/60 bg-bg/50 p-2 text-[11px]">
                <div className="flex items-center justify-between font-medium text-text border-b border-border/40 pb-1">
                  <span>Categories to restore:</span>
                  <div className="flex gap-2 text-[10px] text-primary">
                    <button
                      type="button"
                      onClick={() => {
                        const all: Record<string, boolean> = {}
                        importPreview.categories?.forEach((c) => (all[c.id] = true))
                        setSelectedCategories((prev) => ({ ...prev, ...all }))
                      }}
                      className="hover:underline"
                    >
                      All
                    </button>
                    <span>|</span>
                    <button
                      type="button"
                      onClick={() => {
                        const none: Record<string, boolean> = {}
                        importPreview.categories?.forEach((c) => (none[c.id] = false))
                        setSelectedCategories((prev) => ({ ...prev, ...none }))
                      }}
                      className="hover:underline"
                    >
                      None
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-1.5 pt-1">
                  {importPreview.categories.map((cat) => (
                    <label
                      key={cat.id}
                      className="flex items-center justify-between text-muted hover:text-text cursor-pointer"
                    >
                      <span className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={selectedCategories[cat.id] ?? false}
                          onChange={(e) =>
                            setSelectedCategories((prev) => ({
                              ...prev,
                              [cat.id]: e.target.checked,
                            }))
                          }
                          className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5"
                        />
                        <span>{cat.label}</span>
                      </span>
                      <span className="font-mono text-[10px] opacity-70">({cat.count})</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Conflict resolution modes */}
            <div className="flex flex-col gap-1 border-t border-border/50 pt-2 text-[11px]">
              <span className="font-medium text-text">Conflict resolution:</span>
              <div className="flex flex-col gap-1.5 text-text">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="import-mode"
                    checked={importMode === 'merge'}
                    onChange={() => setImportMode('merge')}
                  />
                  <span>
                    <strong className="text-primary font-medium">Merge & Rename</strong>{' '}
                    (Recommended — keeps existing data, appends (Imported))
                  </span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="import-mode"
                    checked={importMode === 'skip'}
                    onChange={() => setImportMode('skip')}
                  />
                  <span>Keep existing (Skip conflicts)</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="import-mode"
                    checked={importMode === 'replace'}
                    onChange={() => setImportMode('replace')}
                  />
                  <span>Replace existing (Overwrite)</span>
                </label>
              </div>
            </div>

            <Button variant="primary" onClick={() => void applyImport()} disabled={busy}>
              Import
            </Button>
          </div>
        ) : !isEncryptedPayload ? (
          <Button
            variant="secondary"
            onClick={() => void preview()}
            disabled={!importText.trim()}
            className="self-start"
          >
            Preview import
          </Button>
        ) : null}
      </Section>

      <Section title="General">
        <div className="flex items-center justify-between">
          <span className="text-muted">{APP_NAME}</span>
          <span className="font-mono text-text">v{APP_VERSION}</span>
        </div>
        {/* Which build is actually loaded. Reloading the extension doesn't refresh
            an open panel or already-injected content scripts, so "the new thing
            isn't there" is usually a stale load — this makes that checkable. */}
        <div className="flex items-center justify-between">
          <span className="text-muted">Build</span>
          <span className="font-mono text-text">{__BUILD_ID__}</span>
        </div>
      </Section>

      {confirm ? (
        <Dialog title="Please confirm" onClose={() => setConfirm(null)}>
          <div className="flex flex-col gap-3 text-xs">
            <p className="text-text">
              {confirm === 'all'
                ? 'This permanently deletes ALL OpenAPI Companion data (settings, every project, history, auth). This cannot be undone.'
                : typeof confirm === 'object' && confirm.type === 'single'
                  ? `This permanently deletes all saved data for ${confirm.name || confirm.projectId}. This cannot be undone.`
                  : 'This permanently deletes all saved data for the current project. This cannot be undone.'}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirm(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => void runClear()}>
                Delete
              </Button>
            </div>
          </div>
        </Dialog>
      ) : null}
    </div>
  )
}

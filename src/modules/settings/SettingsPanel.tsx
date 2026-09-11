import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Result } from '@/types'
import type { EventBus, ImportSummary } from '@/core/events'
import { useTheme } from '@/hooks'
import type { ThemeManager, ThemePreference } from '@/services'
import { APP_NAME, APP_VERSION } from '@/constants'
import { Badge, Button, Dialog, DeleteIcon, ExternalLinkIcon, EyeIcon, LockIcon } from '@/components'
import type { SettingsApi } from './settings-service'
import type { ImportExportApi } from './import-export-service'
import type { ImportMode, ImportPreview, Preferences, StorageMetrics } from './types'

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
  }, [settings, loadMetrics])

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
      if (typeof chrome !== 'undefined' && chrome.tabs && typeof chrome.tabs.create === 'function') {
        void chrome.tabs.create({ url })
      } else {
        window.open(url, '_blank', 'noopener,noreferrer')
      }
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  const backup = async () => {
    setBusy(true)
    const pass = backupPassphrase.trim() || undefined
    const r = await io.backup(false, pass)
    notify(
      r.ok ? 'success' : 'error',
      r.ok
        ? `Backup saved: ${r.value}${pass ? ' (encrypted with passphrase)' : ''}`
        : r.error.message,
    )
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
    if (r.ok) setImportPreview(r.value)
    else {
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
    const r: Result<ImportSummary> = pass ? await io.applyImport(payloadToImport, importMode, pass) : await io.applyImport(payloadToImport, importMode)
    if (r.ok) {
      notify('success', `Imported ${r.value.imported}, skipped ${r.value.skipped}.`)
      setImportText('')
      setImportPreview(null)
      setDecryptedPayload(null)
      setDecryptPassphrase('')
      setIsEncryptedPayload(false)
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
            <span className="text-muted font-medium">Total used</span>
            <span className="font-mono text-text font-semibold">
              {metrics ? formatBytes(metrics.totalBytes) : '…'}
            </span>
          </div>
          <div className="max-h-36 overflow-y-auto divide-y divide-border/50">
            {metrics?.projects.map((p) => {
              const displayName = p.name || p.originUrl || p.projectId
              const targetUrl = p.originUrl || p.openApiUrl
              return (
                <div
                  key={p.projectId}
                  className="flex items-center justify-between gap-2 px-2 py-1.5 hover:bg-surface/30 transition-colors"
                >
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-medium text-text text-[11px]" title={displayName}>
                        {displayName}
                      </span>
                      {targetUrl ? (
                        <button
                          type="button"
                          onClick={() => openUrl(targetUrl)}
                          title={`Open ${targetUrl} in a new tab`}
                          aria-label={`Open ${displayName} in new tab`}
                          className="inline-flex items-center text-muted hover:text-primary transition-colors p-0.5 rounded"
                        >
                          <ExternalLinkIcon className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                    {p.originUrl ? (
                      <span className="truncate font-mono text-[10px] text-muted" title={p.originUrl}>
                        {p.originUrl}
                      </span>
                    ) : (
                      <span className="truncate font-mono text-[10px] text-muted/70">
                        {p.projectId}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono text-[11px] text-text">{formatBytes(p.bytes)}</span>
                    <button
                      type="button"
                      onClick={() => setConfirm({ type: 'single', projectId: p.projectId, name: p.name })}
                      title={`Clear data for ${displayName}`}
                      aria-label={`Clear data for ${displayName}`}
                      className="p-1 text-muted hover:text-danger rounded hover:bg-surface transition-colors"
                    >
                      <DeleteIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {projectId ? (
            <Button variant="secondary" onClick={() => setConfirm('project')}>
              Clear this project
            </Button>
          ) : null}
          <Button variant="danger" onClick={() => setConfirm('all')}>
            Clear all data
          </Button>
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
            Protect your backup with a password to export credentials safely. Team members will need this password to restore. If empty, passwords are left out.
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

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void backup()} disabled={busy}>
            {backupPassphrase.trim() ? 'Download encrypted backup' : 'Download backup'}
          </Button>
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

        <label className="mt-1 flex items-center gap-2 text-text">
          <input
            type="checkbox"
            checked={prefs?.autoBackup ?? false}
            onChange={(e) => void setPref('autoBackup', e.target.checked)}
          />
          Auto-backup after changes
        </label>

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
              This backup is protected with a passphrase. Enter the passphrase to decrypt credentials and preview.
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
          <div className="flex flex-col gap-1 rounded-md border border-border bg-surface p-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge kind="info">{importPreview.total} entries</Badge>
              <Badge kind="neutral">{importPreview.projectCount} projects</Badge>
              {importPreview.containsSecrets ? (
                <Badge kind="warning">contains secrets</Badge>
              ) : null}
              {importPreview.isEncrypted ? (
                <Badge kind="success">🔒 Decrypted</Badge>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-text">
                <input
                  type="radio"
                  name="import-mode"
                  checked={importMode === 'skip'}
                  onChange={() => setImportMode('skip')}
                />
                Keep existing
              </label>
              <label className="flex items-center gap-1 text-text">
                <input
                  type="radio"
                  name="import-mode"
                  checked={importMode === 'replace'}
                  onChange={() => setImportMode('replace')}
                />
                Replace existing
              </label>
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

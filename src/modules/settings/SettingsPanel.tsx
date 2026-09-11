import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Result } from '@/types'
import type { EventBus, ImportSummary } from '@/core/events'
import { useTheme } from '@/hooks'
import type { ThemeManager, ThemePreference } from '@/services'
import { APP_NAME, APP_VERSION } from '@/constants'
import { Badge, Button, Dialog, DeleteIcon, ExternalLinkIcon } from '@/components'
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
    const r = await io.backup()
    notify(r.ok ? 'success' : 'error', r.ok ? `Backup saved: ${r.value}` : r.error.message)
    setBusy(false)
  }

  const preview = (text = importText) => {
    const r = io.previewImport(text)
    if (r.ok) setImportPreview(r.value)
    else {
      setImportPreview(null)
      notify('error', r.error.message)
    }
  }

  /** Restore = pick the downloaded backup file → same preview → import flow. */
  const onRestoreFile = async (file: File | undefined) => {
    if (!file) return
    try {
      const text = await readFileText(file)
      setImportText(text)
      preview(text)
    } catch {
      notify('error', 'Could not read the selected file.')
    }
  }

  const applyImport = async () => {
    setBusy(true)
    const r: Result<ImportSummary> = await io.applyImport(importText, importMode)
    if (r.ok) {
      notify('success', `Imported ${r.value.imported}, skipped ${r.value.skipped}.`)
      setImportText('')
      setImportPreview(null)
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
        <p className="text-[11px] text-warning">
          Backups include stored credentials — keep the file private.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void backup()} disabled={busy}>
            Download backup
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
            setImportText(e.target.value)
            setImportPreview(null)
          }}
          placeholder="…or paste a backup's JSON here to import"
          aria-label="Import JSON"
          rows={3}
          className="rounded-md border border-border bg-surface p-2 font-mono text-[11px] text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
        {importPreview ? (
          <div className="flex flex-col gap-1 rounded-md border border-border bg-surface p-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge kind="info">{importPreview.total} entries</Badge>
              <Badge kind="neutral">{importPreview.projectCount} projects</Badge>
              {importPreview.containsSecrets ? (
                <Badge kind="warning">contains secrets</Badge>
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
        ) : (
          <Button
            variant="secondary"
            onClick={() => preview()}
            disabled={!importText.trim()}
            className="self-start"
          >
            Preview import
          </Button>
        )}
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

import { useCallback, useEffect, useState } from 'react'
import {
  Badge,
  Button,
  EmptyState,
  AuthIcon,
  ClockIcon,
  DataIcon,
  DownloadIcon,
  RequestsIcon,
  SearchIcon,
} from '@/components'
import { useEventBus } from '@/hooks'
import type { EventBus } from '@/core/events'
import type { ProjectMeta } from '@/core/project'
import { authStatusOf, type AuthPanelService, type AuthRecord } from '@/modules/authentication'
import type { EnvironmentPanelService } from '@/modules/environment'
import type { HistoryEntry, HistoryPanelService } from '@/modules/history'
import { methodKind, statusKind } from '@/modules/history/status'
import type { RequestPanelService } from '@/modules/request'
import type { ImportExportApi } from '@/modules/settings'

/** The adapter reads the dashboard needs — a subset, so tests can stub it cheaply. */
export interface DocStats {
  version(): string | null
  specUrl(): string | null
  listEndpoints(): unknown[]
}

export interface DashboardProps {
  project: ProjectMeta | null
  bus: EventBus
  environmentId: string
  authService: AuthPanelService
  environmentService: EnvironmentPanelService
  historyService: HistoryPanelService
  requestService: RequestPanelService
  importExportService: ImportExportApi
  /** Opens the in-page command palette (⌘K). */
  onOpenPalette: () => void
  /** Jump to another tab (used by "view all" / quick actions that need a panel). */
  onNavigate: (tabId: string) => void
  swagger?: DocStats
}

const RECENT_COUNT = 5

/** "42m" / "3h 12m" / "5s" — compact, for a token countdown. */
function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`
  if (m > 0) return `${m}m`
  return `${total}s`
}

/** "just now" / "4m ago" / "2h ago" / "3d ago". */
function formatAgo(timestamp: number, now: number): string {
  const diff = Math.max(0, now - timestamp)
  if (diff < 60_000) return 'just now'
  const days = Math.floor(diff / 86_400_000)
  if (days >= 1) return `${days}d ago`
  return `${formatDuration(diff)} ago`
}

const AUTH_LABEL = {
  authorized: 'Active',
  expired: 'Expired',
  none: 'Not signed in',
} as const

/** Section wrapper: a titled card with an optional right-hand action. */
function Card({
  title,
  icon,
  action,
  children,
}: {
  title: string
  icon?: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg border border-border">
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
          {icon}
          {title}
        </span>
        {action}
      </header>
      <div className="p-3">{children}</div>
    </section>
  )
}

/**
 * Home tab: the project's live state at a glance (spec, auth, environment,
 * recent calls, totals) plus the actions worth one click. Reads through the same
 * panel services as the other tabs, so it can't drift from them.
 */
export function Dashboard({
  project,
  bus,
  environmentId,
  authService,
  environmentService: _envService,
  historyService,
  requestService,
  importExportService,
  onOpenPalette,
  onNavigate,
  swagger,
}: DashboardProps) {
  const [auth, setAuth] = useState<AuthRecord | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [templateCount, setTemplateCount] = useState(0)
  const [busy, setBusy] = useState(false)
  const now = Date.now()

  const load = useCallback(async () => {
    const [current, refreshOn, entries, templates] = await Promise.all([
      authService.current(environmentId),
      authService.isAutoRefreshEnabled(),
      historyService.list({}),
      requestService.listTemplates(),
    ])
    setAuth(current.ok ? current.value : null)
    setAutoRefresh(refreshOn)
    if (entries.ok) setHistory(entries.value)
    setTemplateCount(templates.ok ? templates.value.length : 0)
  }, [authService, historyService, requestService, environmentId])

  useEffect(() => {
    void load()
  }, [load])

  // Keep the summary honest as things happen elsewhere (page or other tabs).
  useEventBus(bus, 'HISTORY_RECORDED', () => void load())
  useEventBus(bus, 'AUTH_UPDATED', () => void load())
  useEventBus(bus, 'AUTH_CLEARED', () => void load())
  useEventBus(bus, 'TEMPLATE_SAVED', () => void load())
  useEventBus(bus, 'ENVIRONMENT_CHANGED', () => void load())

  if (!project) {
    return (
      <EmptyState
        icon={<SearchIcon className="h-8 w-8 text-muted" />}
        title="No project detected"
        message="Open an OpenAPI (Swagger UI) page to begin."
      />
    )
  }

  const status = authStatusOf(auth, now)
  const endpointCount = swagger?.listEndpoints().length ?? 0
  const version = swagger?.version() ?? null
  const failed = history.filter((h) => h.status >= 400).length
  const recent = history.slice(0, RECENT_COUNT)

  const backup = () => {
    setBusy(true)
    void importExportService.backup().finally(() => setBusy(false))
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* Project + spec */}
      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-semibold text-text">{project.name}</span>
          {version ? <Badge kind="neutral">v{version}</Badge> : null}
        </div>
        <div className="truncate font-mono text-[11px] text-muted">
          {project.originUrl}
          {endpointCount > 0 ? ` · ${endpointCount} endpoints` : ''}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge kind="info">{project.docType}</Badge>
        </div>
      </div>

      {/* Auth */}
      <Card
        title="Auth"
        icon={<AuthIcon className="h-3.5 w-3.5" />}
        action={
          <Badge
            kind={status === 'authorized' ? 'success' : status === 'expired' ? 'error' : 'neutral'}
          >
            {AUTH_LABEL[status]}
          </Badge>
        }
      >
        {auth ? (
          <div className="flex flex-col gap-1 text-[11px] text-muted">
            <span>
              {auth.type}
              {auth.expiresAt != null
                ? status === 'expired'
                  ? ' · expired'
                  : ` · expires in ${formatDuration(auth.expiresAt - now)}`
                : ''}
            </span>
            <span>Auto-refresh {autoRefresh ? 'on' : 'off'}</span>
          </div>
        ) : (
          <p className="text-[11px] text-muted">
            Authorize in Swagger — the token is saved and restored automatically.
          </p>
        )}
      </Card>

      {/* Recent activity */}
      <Card
        title="Recent"
        icon={<ClockIcon className="h-3.5 w-3.5" />}
        action={
          recent.length > 0 ? (
            <button
              type="button"
              onClick={() => onNavigate('history')}
              className="text-[11px] text-primary hover:underline"
            >
              View all
            </button>
          ) : null
        }
      >
        {recent.length === 0 ? (
          <p className="text-[11px] text-muted">
            No calls yet. Execute a request in Swagger and it lands here.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {recent.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => void historyService.locate(entry.endpointId)}
                  aria-label={`Locate ${entry.method} ${entry.endpoint}`}
                  className="flex w-full items-baseline gap-2 text-left"
                >
                  <Badge kind={methodKind(entry.method)}>{entry.method.toUpperCase()}</Badge>
                  <span className="min-w-0 flex-1 break-all font-mono text-[11px] text-text">
                    {entry.endpoint}
                  </span>
                  <Badge kind={statusKind(entry.status)}>{entry.status}</Badge>
                </button>
                <span className="pl-1 text-[10px] text-muted">
                  {formatAgo(entry.timestamp, now)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Totals */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 px-1 text-[11px] text-muted">
        <span>{history.length} calls</span>
        <span aria-label={`${failed} failed`}>· {failed} failed</span>
        <span>· {templateCount} templates</span>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onOpenPalette}>
          <span className="flex items-center justify-center gap-1.5">
            <SearchIcon className="h-3.5 w-3.5" />
            Search ⌘K
          </span>
        </Button>
        <Button variant="secondary" onClick={() => onNavigate('requests')}>
          <span className="flex items-center justify-center gap-1.5">
            <RequestsIcon className="h-3.5 w-3.5" />
            Templates
          </span>
        </Button>
        <Button variant="secondary" onClick={() => onNavigate('fake-data')}>
          <span className="flex items-center justify-center gap-1.5">
            <DataIcon className="h-3.5 w-3.5" />
            Fake data
          </span>
        </Button>
        <Button variant="secondary" onClick={backup} disabled={busy}>
          <span className="flex items-center justify-center gap-1.5">
            <DownloadIcon className="h-3.5 w-3.5" />
            {busy ? 'Backing up…' : 'Backup'}
          </span>
        </Button>
      </div>
    </div>
  )
}

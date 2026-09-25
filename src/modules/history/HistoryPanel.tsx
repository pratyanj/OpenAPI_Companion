import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Result } from '@/types'
import type { EventBus } from '@/core/events'
import { useEventBus } from '@/hooks'
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  Menu,
  Spinner,
  HistoryIcon,
  DeleteIcon,
  ReplayIcon,
  LocateIcon,
  CompareIcon,
} from '@/components'
import type { EnvironmentPanelService } from '@/modules/environment'
import type { HistoryEntry, HistoryQuery, HistoryRecord } from './types'
import { statusKind, methodKind } from './status'
import { HistoryDetail } from './HistoryDetail'
import { ResponseDiffModal } from './ResponseDiffModal'

/**
 * Render a path so it wraps at "/" segment boundaries (via <wbr>) instead of
 * breaking mid-word — e.g. `/site-surveys/{id}/technician-sheet-url` wraps as
 * whole segments, not `technician-shee|t-url`.
 */
function PathText({ path }: { path: string }) {
  const chunks = path.match(/\/[^/]*/g)
  return (
    <span className="min-w-0 break-words font-mono text-[11px] leading-snug text-text">
      {/* Segments are direct text nodes with <wbr> break points before each "/". */}
      {chunks && chunks.length > 1
        ? chunks.flatMap((chunk, i) => (i === 0 ? [chunk] : [<wbr key={i} />, chunk]))
        : path}
    </span>
  )
}

/** Surface HistoryPanel needs from HistoryService (eases testing). */
export interface HistoryPanelService {
  list(query?: HistoryQuery): Promise<Result<HistoryEntry[]>>
  get(id: string): Promise<Result<HistoryRecord | null>>
  replay(id: string): Promise<Result<HistoryRecord>>
  locate(endpointId: string): Result<void>
  deleteEntry(id: string): Promise<Result<void>>
  clearProject(): Promise<Result<void>>
}

interface HistoryPanelProps {
  service: HistoryPanelService
  bus: EventBus
  /** Origin for building full URLs in the detail view's copy menu. */
  baseUrl?: string
  /** Optional Environment service for saving response values to project variables. */
  environmentService?: EnvironmentPanelService
  /** Opens the in-page request detail overlay on the Swagger webpage. */
  onOpenHistoryDetail?: (historyId: string) => void
}

const METHODS = ['', 'get', 'post', 'put', 'patch', 'delete']

/** One row per operation: its latest call, plus every call behind it. */
interface CallGroup {
  latest: HistoryEntry
  calls: HistoryEntry[]
}

/**
 * Collapse repeats: hammering one endpoint shouldn't bury the rest of the list.
 * `entries` arrive newest-first, so each group's first call is its latest and the
 * groups stay in most-recent-first order.
 */
function groupByEndpoint(entries: HistoryEntry[]): CallGroup[] {
  const byEndpoint = new Map<string, HistoryEntry[]>()
  for (const entry of entries) {
    const calls = byEndpoint.get(entry.endpointId)
    if (calls) calls.push(entry)
    else byEndpoint.set(entry.endpointId, [entry])
  }
  return [...byEndpoint.values()].map((calls) => ({ latest: calls[0]!, calls }))
}

/** "just now" / "5m ago" / "2h ago" / "3d ago" — when it was last called. */
function lastCalled(timestamp: number): string {
  const diff = Math.max(0, Date.now() - timestamp)
  if (diff < 60_000) return 'just now'
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function HistoryPanel({
  service,
  bus,
  baseUrl,
  environmentService,
  onOpenHistoryDetail,
}: HistoryPanelProps) {
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [method, setMethod] = useState('')
  const [detail, setDetail] = useState<HistoryRecord | null>(null)

  // Diff comparison state
  const [diffOpen, setDiffOpen] = useState(false)
  const [diffRecordA, setDiffRecordA] = useState<HistoryRecord | null>(null)
  const [diffIdA, setDiffIdA] = useState<string | undefined>()
  const [diffIdB, setDiffIdB] = useState<string | undefined>()
  const [compareMode, setCompareMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const load = useCallback(async () => {
    const result = await service.list({ text: text || undefined, method: method || undefined })
    setEntries(result.ok ? result.value : [])
    setLoading(false)
  }, [service, text, method])

  useEffect(() => {
    void load()
  }, [load])

  const groups = useMemo(() => groupByEndpoint(entries), [entries])

  useEventBus(bus, 'HISTORY_RECORDED', () => void load())
  useEventBus(bus, 'HISTORY_CLEARED', () => void load())

  const openDetail = async (id: string) => {
    if (onOpenHistoryDetail) {
      onOpenHistoryDetail(id)
      return
    }
    const result = await service.get(id)
    if (result.ok && result.value) setDetail(result.value)
  }

  const toastErr = (r: Result<unknown>) => {
    if (!r.ok) bus.publish('NOTIFY', { kind: 'error', message: r.error.message })
  }

  // Replay re-executes the whole request; Locate just jumps to it (EC-013 errors → toast).
  const replay = async (id: string) => toastErr(await service.replay(id))
  const locate = (endpointId: string) => toastErr(service.locate(endpointId))
  const removeAll = async (calls: HistoryEntry[]) => {
    for (const call of calls) toastErr(await service.deleteEntry(call.id))
    await load()
  }

  const openDiff = (idA: string, idB?: string) => {
    setDiffIdA(idA)
    setDiffIdB(idB)
    setDiffRecordA(null)
    setDiffOpen(true)
  }

  const toggleSelectForCompare = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((i) => i !== id)
      if (prev.length >= 2) return [prev[1]!, id] // cycle selection
      return [...prev, id]
    })
  }

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex gap-1">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search history…"
          aria-label="Search history"
          className="flex-1 rounded-md border border-border bg-surface px-2 py-1 text-xs text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          aria-label="Filter by method"
          className="rounded-md border border-border bg-surface px-1 text-xs text-text"
        >
          {METHODS.map((m) => (
            <option key={m || 'all'} value={m}>
              {m ? m.toUpperCase() : 'All'}
            </option>
          ))}
        </select>
        <Button
          variant={compareMode ? 'secondary' : 'ghost'}
          onClick={() => {
            setCompareMode(!compareMode)
            setSelectedIds([])
          }}
          className={`h-7 px-2 text-xs flex items-center gap-1 shrink-0 ${
            compareMode ? 'border-primary text-primary' : 'text-muted hover:text-text'
          }`}
          title="Toggle Compare mode to pick two executions"
        >
          <CompareIcon className="h-3.5 w-3.5" />
          <span>Compare</span>
        </Button>
      </div>

      {compareMode ? (
        <div className="flex items-center justify-between rounded-md border border-primary/40 bg-primary/5 px-2 py-1.5 text-xs text-text">
          <span>Select 2 calls ({selectedIds.length}/2 selected)</span>
          <div className="flex items-center gap-1.5">
            <Button
              variant="primary"
              disabled={selectedIds.length !== 2}
              onClick={() => openDiff(selectedIds[0]!, selectedIds[1]!)}
              className="h-6 px-2 text-[11px] flex items-center gap-1"
            >
              <CompareIcon className="h-3 w-3" />
              <span>Compare</span>
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setCompareMode(false)
                setSelectedIds([])
              }}
              className="h-6 px-1.5 text-[11px] text-muted hover:text-text"
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          icon={<HistoryIcon className="h-8 w-8 text-muted" />}
          title="No requests yet"
          message="Execute a request in Swagger and it appears here."
        />
      ) : (
        <>
          <ul className="flex flex-col gap-1">
            {groups.map(({ latest: e, calls }) => {
              const isSelected = selectedIds.includes(e.id)
              return (
                <li
                  key={e.endpointId}
                  className={`flex items-start gap-2 rounded-md border px-2 py-2 transition-colors ${
                    isSelected
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-border/80'
                  }`}
                >
                  {compareMode ? (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelectForCompare(e.id)}
                      className="mt-1 h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary cursor-pointer"
                      aria-label={`Select ${e.method} ${e.endpoint} for comparison`}
                    />
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      if (compareMode) toggleSelectForCompare(e.id)
                      else void openDetail(e.id)
                    }}
                    className="flex min-w-0 flex-1 flex-col gap-1 text-left"
                    aria-label={`View ${e.method} ${e.endpoint} details`}
                    title={compareMode ? 'Select for comparison' : 'View details'}
                  >
                    <span className="flex min-w-0 items-start gap-2">
                      <Badge kind={statusKind(e.status)}>{e.status}</Badge>
                      <Badge kind={methodKind(e.method)}>{e.method.toUpperCase()}</Badge>
                      <PathText path={e.endpoint} />
                    </span>
                    <span className="flex items-center gap-2 text-[10px] text-muted">
                      {calls.length > 1 ? (
                        <span className="rounded-full bg-surface px-1.5 py-0.5 font-semibold">
                          {calls.length} calls
                        </span>
                      ) : null}
                      <span>{lastCalled(e.timestamp)}</span>
                    </span>
                  </button>
                  <Menu
                    label={`Actions for ${e.method} ${e.endpoint}`}
                    items={[
                      {
                        label: calls.length > 1 ? 'Compare latest 2 calls' : 'Compare...',
                        icon: <CompareIcon className="h-4 w-4" />,
                        onSelect: () => {
                          if (calls.length >= 2) {
                            openDiff(calls[0]!.id, calls[1]!.id)
                          } else {
                            openDiff(calls[0]!.id)
                          }
                        },
                      },
                      {
                        label: 'Replay',
                        icon: <ReplayIcon className="h-4 w-4" />,
                        onSelect: () => void replay(e.id),
                      },
                      {
                        label: 'Locate in Swagger',
                        icon: <LocateIcon className="h-4 w-4" />,
                        onSelect: () => locate(e.endpointId),
                      },
                      {
                        label: calls.length > 1 ? `Delete ${calls.length} calls` : 'Delete',
                        icon: <DeleteIcon className="h-4 w-4" />,
                        danger: true,
                        onSelect: () => void removeAll(calls),
                      },
                    ]}
                  />
                </li>
              )
            })}
          </ul>
          <Button variant="danger" onClick={() => void service.clearProject()} className="self-end">
            Clear history
          </Button>
        </>
      )}

      {detail ? (
        <Dialog
          title="Request detail"
          onClose={() => setDetail(null)}
          size="full"
          actions={
            <>
              <button
                type="button"
                onClick={() => {
                  const sibling = entries.find(
                    (e) => e.endpointId === detail.endpointId && e.id !== detail.id,
                  )
                  setDiffRecordA(detail)
                  setDiffIdA(detail.id)
                  setDiffIdB(sibling?.id)
                  setDiffOpen(true)
                }}
                className="flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[11px] text-text hover:bg-surface hover:text-primary hover:border-primary"
                title="Compare with another execution"
              >
                <CompareIcon className="h-3.5 w-3.5" />
                Compare
              </button>
              <button
                type="button"
                onClick={() => void replay(detail.id)}
                className="flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[11px] text-text hover:bg-surface"
              >
                <ReplayIcon className="h-3.5 w-3.5" />
                Replay
              </button>
              <button
                type="button"
                onClick={() => locate(detail.endpointId)}
                className="flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[11px] text-text hover:bg-surface"
              >
                <LocateIcon className="h-3.5 w-3.5" />
                Locate
              </button>
            </>
          }
        >
          <HistoryDetail
            record={detail}
            baseUrl={baseUrl}
            environmentService={environmentService}
            bus={bus}
            calls={entries.filter((e) => e.endpointId === detail.endpointId)}
            onSelectCall={(id) => void openDetail(id)}
            onCompare={(targetId) => {
              setDiffRecordA(detail)
              setDiffIdA(detail.id)
              setDiffIdB(targetId)
              setDiffOpen(true)
            }}
          />
        </Dialog>
      ) : null}

      <ResponseDiffModal
        isOpen={diffOpen}
        onClose={() => {
          setDiffOpen(false)
          setDiffRecordA(null)
          setDiffIdA(undefined)
          setDiffIdB(undefined)
        }}
        initialRecordA={diffRecordA}
        initialIdA={diffIdA}
        initialIdB={diffIdB}
        service={service}
        allCalls={entries}
      />
    </div>
  )
}

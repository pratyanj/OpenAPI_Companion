import { useCallback, useEffect, useState } from 'react'
import type { Result } from '@/types'
import type { EventBus } from '@/core/events'
import { useEventBus } from '@/hooks'
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  IconButton,
  Spinner,
  HistoryIcon,
  DeleteIcon,
} from '@/components'
import type { HistoryEntry, HistoryQuery, HistoryRecord } from './types'
import { statusKind } from './status'
import { HistoryDetail } from './HistoryDetail'

/** Surface HistoryPanel needs from HistoryService (eases testing). */
export interface HistoryPanelService {
  list(query?: HistoryQuery): Promise<Result<HistoryEntry[]>>
  get(id: string): Promise<Result<HistoryRecord | null>>
  replay(id: string): Promise<Result<HistoryRecord>>
  deleteEntry(id: string): Promise<Result<void>>
  clearProject(): Promise<Result<void>>
}

interface HistoryPanelProps {
  service: HistoryPanelService
  bus: EventBus
}

const METHODS = ['', 'get', 'post', 'put', 'patch', 'delete']

export function HistoryPanel({ service, bus }: HistoryPanelProps) {
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [method, setMethod] = useState('')
  const [detail, setDetail] = useState<HistoryRecord | null>(null)

  const load = useCallback(async () => {
    const result = await service.list({ text: text || undefined, method: method || undefined })
    setEntries(result.ok ? result.value : [])
    setLoading(false)
  }, [service, text, method])

  useEffect(() => {
    void load()
  }, [load])

  useEventBus(bus, 'HISTORY_RECORDED', () => void load())
  useEventBus(bus, 'HISTORY_CLEARED', () => void load())

  const openDetail = async (id: string) => {
    const result = await service.get(id)
    if (result.ok && result.value) setDetail(result.value)
  }

  // Surface failures (e.g. endpoint no longer on the page, EC-013) as toasts.
  const replay = async (id: string) => {
    const result = await service.replay(id)
    if (!result.ok) bus.publish('NOTIFY', { kind: 'error', message: result.error.message })
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
      </div>

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
            {entries.map((e) => (
              <li
                key={e.id}
                className="flex items-center gap-2 rounded-md border border-border px-2 py-1"
              >
                <button
                  type="button"
                  onClick={() => void openDetail(e.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  aria-label={`View ${e.method} ${e.endpoint} details`}
                  title="View details"
                >
                  <Badge kind={statusKind(e.status)}>{e.status}</Badge>
                  <span className="font-mono text-[11px] font-semibold uppercase text-muted">
                    {e.method}
                  </span>
                  <span className="truncate font-mono text-[11px] text-text">{e.endpoint}</span>
                </button>
                <Button variant="secondary" onClick={() => void replay(e.id)}>
                  Replay
                </Button>
                <IconButton
                  label={`Delete ${e.method} ${e.endpoint}`}
                  onClick={() => void service.deleteEntry(e.id).then(load)}
                >
                  <DeleteIcon />
                </IconButton>
              </li>
            ))}
          </ul>
          <Button variant="danger" onClick={() => void service.clearProject()} className="self-end">
            Clear history
          </Button>
        </>
      )}

      {detail ? (
        <Dialog title="Request detail" onClose={() => setDetail(null)}>
          <HistoryDetail record={detail} />
        </Dialog>
      ) : null}
    </div>
  )
}

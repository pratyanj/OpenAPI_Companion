import { useState } from 'react'
import {
  Badge,
  CopyButton,
  Tabs,
  type TabDef,
  ClockIcon,
  RequestIcon,
  ResponseIcon,
} from '@/components'
import type { HistoryRecord } from './types'
import { statusKind } from './status'

const TABS: TabDef[] = [
  { id: 'request', label: 'Request', icon: <RequestIcon className="h-3.5 w-3.5" /> },
  { id: 'response', label: 'Response', icon: <ResponseIcon className="h-3.5 w-3.5" /> },
]

/** Pretty-print JSON bodies for readability; fall back to the raw string. */
function prettify(body?: string): string {
  if (!body) return ''
  try {
    return JSON.stringify(JSON.parse(body), null, 2)
  } catch {
    return body
  }
}

function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleString()
  } catch {
    return String(ts)
  }
}

function Panel({ body }: { body: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted">
          {body ? `${body.length} characters` : 'Empty'}
        </span>
        {body ? <CopyButton text={body} /> : null}
      </div>
      <pre className="max-h-[48vh] overflow-auto rounded-md border border-border bg-surface p-3 font-mono text-[11px] leading-relaxed text-text">
        {body || '(empty)'}
      </pre>
    </div>
  )
}

/**
 * Tabbed inspector for a history entry: a fixed summary header (status / method
 * / path + metadata) with Request / Response tabs, each showing the (pretty-
 * printed) body and a copy button.
 */
export function HistoryDetail({ record }: { record: HistoryRecord }) {
  const [tab, setTab] = useState('request')
  const request = prettify(record.requestBody)
  const response = prettify(record.responseBody)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 rounded-md border border-border bg-surface px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge kind={statusKind(record.status)}>{record.status}</Badge>
          <span className="font-mono text-xs font-semibold uppercase text-muted">
            {record.method}
          </span>
          <span className="break-all font-mono text-xs text-text">{record.endpoint}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
          <span className="inline-flex items-center gap-1">
            <ClockIcon className="h-3 w-3" />
            {formatTime(record.timestamp)}
          </span>
          {record.durationMs != null ? <span>{record.durationMs} ms</span> : null}
          <span>env: {record.environmentId}</span>
        </div>
      </div>

      <Tabs tabs={TABS} activeId={tab} onChange={setTab} />

      {tab === 'request' ? <Panel body={request} /> : <Panel body={response} />}
    </div>
  )
}

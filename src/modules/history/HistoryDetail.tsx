import { useState } from 'react'
import {
  Badge,
  Button,
  CopyButton,
  IconButton,
  KeyIcon,
  Menu,
  Tabs,
  type TabDef,
  ClockIcon,
  CopyIcon,
  CompareIcon,
  RequestIcon,
  ResponseIcon,
} from '@/components'
import type { EventBus } from '@/core/events'
import { copyText } from '@/utils'
import { generateCode, type CodeLang, type CodeGenRequest } from '@/modules/productivity'
import { SaveToVariableDialog, type EnvironmentPanelService } from '@/modules/environment'
import type { HistoryEntry, HistoryRecord } from './types'
import { statusKind } from './status'

/** Copy-as targets offered in the detail view (all derivable from stored data). */
const CODE_LANGS: { lang: CodeLang; label: string }[] = [
  { lang: 'curl', label: 'Copy as cURL' },
  { lang: 'powershell', label: 'Copy as PowerShell' },
  { lang: 'fetch', label: 'Copy as Fetch' },
  { lang: 'axios', label: 'Copy as Axios' },
]

/** Full request URL from the origin + recorded path/query (path already absolute or relative). */
function fullUrl(
  baseUrl: string | undefined,
  endpoint: string,
  queryParams?: Record<string, string>,
  requestUrl?: string,
): string {
  if (requestUrl && requestUrl.startsWith('http')) {
    return requestUrl
  }
  const base = (baseUrl ?? '').replace(/\/+$/, '')
  let full = endpoint.startsWith('http') ? endpoint : `${base}${endpoint}`
  if (queryParams && Object.keys(queryParams).length > 0 && !full.includes('?')) {
    const qs = Object.entries(queryParams)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&')
    if (qs) {
      full += `?${qs}`
    }
  }
  return full
}

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

function Panel({
  body,
  wrap,
  onToggleWrap,
  onSaveVariable,
}: {
  body: string
  wrap: boolean
  onToggleWrap: () => void
  onSaveVariable?: () => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted">
          {body ? `${body.length} characters` : 'Empty'}
        </span>
        {body ? (
          <div className="flex items-center gap-1.5">
            {onSaveVariable ? (
              <Button
                variant="secondary"
                className="h-6 text-[10px] px-2 flex items-center gap-1 text-primary border-primary/30 hover:border-primary"
                onClick={onSaveVariable}
                title="Save a field from this response to Project Variables"
              >
                <KeyIcon className="h-3 w-3" />
                <span>Save to variable</span>
              </Button>
            ) : null}
            <button
              type="button"
              aria-pressed={wrap}
              onClick={onToggleWrap}
              title="Wrap long lines instead of scrolling sideways"
              className={
                wrap
                  ? 'rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase text-white'
                  : 'rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase text-muted hover:bg-surface hover:text-text'
              }
            >
              wrap
            </button>
            <CopyButton text={body} />
          </div>
        ) : null}
      </div>
      {/* Grows with the payload (up to most of the panel) rather than sitting in
          a short fixed box, so big JSON gets room while a 2-line body stays small. */}
      <pre
        className={`max-h-[62vh] min-h-[14vh] overflow-auto rounded-md border border-border bg-surface p-3 font-mono text-[11px] leading-relaxed text-text ${
          wrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'
        }`}
      >
        {body || '(empty)'}
      </pre>
    </div>
  )
}

export interface HistoryDetailProps {
  record: HistoryRecord
  /** Every recorded call to this same operation, newest first (for the timeline). */
  calls?: HistoryEntry[]
  /** Load another call of this operation into the inspector. */
  onSelectCall?: (id: string) => void
  /** Launch side-by-side diff against another call. */
  onCompare?: (targetCallId: string) => void
  /** Origin for building full URLs / code snippets in the copy menu. */
  baseUrl?: string
  /** Environment service for saving response values to project variables. */
  environmentService?: EnvironmentPanelService
  bus?: EventBus
}

/**
 * Tabbed inspector for a history entry: a fixed summary header (status / method
 * / path + metadata) with Request / Response tabs, each showing the (pretty-
 * printed) body and a copy button — plus a timeline of the other
 * times this same operation was called, so repeats are comparable without
 * closing the dialog. Replay / Locate live in the dialog header.
 */
export function HistoryDetail({
  record,
  calls = [],
  onSelectCall,
  onCompare,
  baseUrl,
  environmentService,
  bus,
}: HistoryDetailProps) {
  const [tab, setTab] = useState('request')
  const [saveVarOpen, setSaveVarOpen] = useState(false)
  // Wrap by default: the panel is narrow, and long tokens/URLs would otherwise
  // need sideways scrolling. Kept at this level so it survives a tab switch.
  const [wrap, setWrap] = useState(true)
  const request = prettify(record.requestBody)
  const response = prettify(record.responseBody)
  const toggleWrap = () => setWrap((v) => !v)

  const url = fullUrl(baseUrl, record.endpoint, record.queryParams, record.requestUrl)
  const reqHeaders: Record<string, string> = {
    ...(record.headers ?? {}),
    ...(record.requestBody ? { 'Content-Type': 'application/json' } : {}),
  }
  const codeReq: CodeGenRequest = {
    method: record.method,
    url,
    headers: reqHeaders,
    body: record.requestBody,
  }
  const copyItems = [
    { label: 'Copy URL', onSelect: () => void copyText(url) },
    ...CODE_LANGS.map(({ lang, label }) => ({
      label,
      onSelect: () => void copyText(generateCode(lang, codeReq)),
    })),
    ...(record.queryParams && Object.keys(record.queryParams).length > 0
      ? [
          {
            label: 'Copy Query Parameters (JSON)',
            onSelect: () => void copyText(JSON.stringify(record.queryParams, null, 2)),
          },
        ]
      : []),
    ...(record.requestBody
      ? [{ label: 'Copy Request body', onSelect: () => void copyText(record.requestBody ?? '') }]
      : []),
    ...(record.responseBody
      ? [{ label: 'Copy Response body', onSelect: () => void copyText(record.responseBody ?? '') }]
      : []),
  ]

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 rounded-md border border-border bg-surface px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge kind={statusKind(record.status)}>{record.status}</Badge>
          <span className="font-mono text-xs font-semibold uppercase text-muted">
            {record.method}
          </span>
          <span className="min-w-0 flex-1 break-all font-mono text-xs text-text">
            {record.requestUrl
              ? record.requestUrl.replace(/^https?:\/\/[^/]+/i, '') || record.endpoint
              : record.queryParams && Object.keys(record.queryParams).length > 0
                ? `${record.endpoint}${record.endpoint.includes('?') ? '&' : '?'}${new URLSearchParams(record.queryParams).toString()}`
                : record.endpoint}
          </span>
          {/* Copy menu — URL, code snippets, and the stored bodies. */}
          <Menu
            label="Copy from this request"
            trigger={<CopyIcon className="h-4 w-4" />}
            items={copyItems}
          />
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

      {calls.length > 1 ? (
        <div className="flex flex-col gap-1">
          <span className="px-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
            {calls.length} calls to this endpoint
          </span>
          <ul
            aria-label="Calls to this endpoint"
            className="flex max-h-[18vh] flex-col gap-1 overflow-auto"
          >
            {calls.map((call) => {
              const active = call.id === record.id
              return (
                <li key={call.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-current={active}
                    onClick={() => onSelectCall?.(call.id)}
                    className={`flex flex-1 items-center gap-2 rounded-md border px-2 py-1 text-left text-[11px] ${
                      active
                        ? 'border-primary bg-surface text-text'
                        : 'border-border text-muted hover:bg-surface hover:text-text'
                    }`}
                  >
                    <Badge kind={statusKind(call.status)}>{call.status}</Badge>
                    <span className="flex-1 truncate">{formatTime(call.timestamp)}</span>
                    {call.durationMs != null ? <span>{call.durationMs} ms</span> : null}
                  </button>
                  {!active && onCompare ? (
                    <IconButton
                      label={`Compare with call from ${formatTime(call.timestamp)}`}
                      title="Compare with this call"
                      onClick={() => onCompare(call.id)}
                      className="h-7 w-7 rounded-md border border-border text-muted hover:text-primary hover:border-primary shrink-0"
                    >
                      <CompareIcon className="h-3.5 w-3.5" />
                    </IconButton>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      <Tabs tabs={TABS} activeId={tab} onChange={setTab} />

      {tab === 'request' ? (
        <div className="flex flex-col gap-3">
          {/* Query Parameters Section */}
          {record.queryParams && Object.keys(record.queryParams).length > 0 ? (
            <div className="flex flex-col gap-1.5 rounded-md border border-border bg-surface p-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-text">Query Parameters</span>
                <span className="text-[10px] text-muted">
                  {Object.keys(record.queryParams).length} params
                </span>
              </div>
              <div className="flex flex-col divide-y divide-border/40">
                {Object.entries(record.queryParams).map(([key, val]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between py-1 font-mono text-[11px]"
                  >
                    <span className="text-primary font-medium">{key}</span>
                    <span className="text-text max-w-[65%] truncate text-right">{val}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Path Parameters Section */}
          {record.pathParams && Object.keys(record.pathParams).length > 0 ? (
            <div className="flex flex-col gap-1.5 rounded-md border border-border bg-surface p-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-text">Path Parameters</span>
                <span className="text-[10px] text-muted">
                  {Object.keys(record.pathParams).length} params
                </span>
              </div>
              <div className="flex flex-col divide-y divide-border/40">
                {Object.entries(record.pathParams).map(([key, val]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between py-1 font-mono text-[11px]"
                  >
                    <span className="text-primary font-medium">{key}</span>
                    <span className="text-text max-w-[65%] truncate text-right">{val}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Request Headers Section */}
          {record.headers && Object.keys(record.headers).length > 0 ? (
            <div className="flex flex-col gap-1.5 rounded-md border border-border bg-surface p-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-text">Request Headers</span>
                <span className="text-[10px] text-muted">
                  {Object.keys(record.headers).length} headers
                </span>
              </div>
              <div className="flex flex-col divide-y divide-border/40">
                {Object.entries(record.headers).map(([key, val]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between py-1 font-mono text-[11px]"
                  >
                    <span className="text-muted font-medium">{key}</span>
                    <span className="text-text max-w-[65%] truncate text-right">{val}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Request Body Section */}
          <div className="flex flex-col gap-1">
            {(record.queryParams && Object.keys(record.queryParams).length > 0) ||
            (record.pathParams && Object.keys(record.pathParams).length > 0) ||
            (record.headers && Object.keys(record.headers).length > 0) ? (
              <span className="text-[11px] font-semibold text-text">Request Body</span>
            ) : null}
            <Panel body={request} wrap={wrap} onToggleWrap={toggleWrap} />
          </div>
        </div>
      ) : (
        <Panel
          body={response}
          wrap={wrap}
          onToggleWrap={toggleWrap}
          onSaveVariable={
            environmentService && record.responseBody ? () => setSaveVarOpen(true) : undefined
          }
        />
      )}

      {saveVarOpen && environmentService && record.responseBody ? (
        <SaveToVariableDialog
          responseBody={record.responseBody}
          service={environmentService}
          endpointId={record.endpointId}
          bus={bus}
          onClose={() => setSaveVarOpen(false)}
        />
      ) : null}
    </div>
  )
}

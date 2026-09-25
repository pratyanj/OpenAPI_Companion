import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  Dialog,
  Button,
  IconButton,
  Badge,
  Spinner,
  Tabs,
  type TabDef,
  CompareIcon,
  SwapIcon,
  SplitViewIcon,
  UnifiedViewIcon,
  CopyIcon,
  CopiedIcon,
  RequestIcon,
  ResponseIcon,
  FileTextIcon,
} from '@/components'
import { copyText } from '@/utils'
import {
  computeLineDiff,
  compareHeaders,
  compareMetrics,
  formatPayload,
  type HeaderDiffItem,
  type MetricsDiff,
} from '@/utils/diff'
import type { HistoryEntry, HistoryRecord } from './types'
import type { HistoryPanelService } from './HistoryPanel'
import { statusKind } from './status'

export interface ResponseDiffModalProps {
  isOpen: boolean
  onClose: () => void
  initialRecordA?: HistoryRecord | null
  initialRecordB?: HistoryRecord | null
  initialIdA?: string
  initialIdB?: string
  service: HistoryPanelService
  allCalls?: HistoryEntry[]
}

export type DiffTab = 'response' | 'request' | 'headers' | 'params'
type ViewMode = 'split' | 'unified'

const DIFF_TABS: TabDef[] = [
  { id: 'response', label: 'Response Body', icon: <ResponseIcon className="h-3.5 w-3.5" /> },
  { id: 'request', label: 'Request Body', icon: <RequestIcon className="h-3.5 w-3.5" /> },
  { id: 'headers', label: 'Headers', icon: <FileTextIcon className="h-3.5 w-3.5" /> },
  { id: 'params', label: 'Parameters', icon: <CompareIcon className="h-3.5 w-3.5" /> },
]

function formatBytes(bytes: number): string {
  const sign = bytes < 0 ? '-' : ''
  const abs = Math.abs(bytes)
  if (abs < 1024) return `${sign}${abs} B`
  return `${sign}${(abs / 1024).toFixed(1)} KB`
}

function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return String(ts)
  }
}

export function ResponseDiffModal({
  isOpen,
  onClose,
  initialRecordA,
  initialRecordB,
  initialIdA,
  initialIdB,
  service,
  allCalls = [],
}: ResponseDiffModalProps) {
  const [recordA, setRecordA] = useState<HistoryRecord | null>(initialRecordA ?? null)
  const [recordB, setRecordB] = useState<HistoryRecord | null>(initialRecordB ?? null)
  const [availableCalls, setAvailableCalls] = useState<HistoryEntry[]>(allCalls)
  const [loading, setLoading] = useState(false)

  // Sync state if props change while modal is mounted
  useEffect(() => {
    if (initialRecordA) setRecordA(initialRecordA)
  }, [initialRecordA])

  useEffect(() => {
    if (initialRecordB) setRecordB(initialRecordB)
  }, [initialRecordB])

  const [activeTab, setActiveTab] = useState<string>('response')
  const [viewMode, setViewMode] = useState<ViewMode>('split')
  const [onlyChanges, setOnlyChanges] = useState(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  // Synchronized scroll refs for side-by-side view
  const leftScrollRef = useRef<HTMLDivElement>(null)
  const rightScrollRef = useRef<HTMLDivElement>(null)
  const isScrollingRef = useRef<'left' | 'right' | null>(null)

  const handleLeftScroll = () => {
    if (isScrollingRef.current === 'right') return
    isScrollingRef.current = 'left'
    if (leftScrollRef.current && rightScrollRef.current) {
      rightScrollRef.current.scrollTop = leftScrollRef.current.scrollTop
      rightScrollRef.current.scrollLeft = leftScrollRef.current.scrollLeft
    }
    requestAnimationFrame(() => {
      isScrollingRef.current = null
    })
  }

  const handleRightScroll = () => {
    if (isScrollingRef.current === 'left') return
    isScrollingRef.current = 'right'
    if (leftScrollRef.current && rightScrollRef.current) {
      leftScrollRef.current.scrollTop = rightScrollRef.current.scrollTop
      leftScrollRef.current.scrollLeft = rightScrollRef.current.scrollLeft
    }
    requestAnimationFrame(() => {
      isScrollingRef.current = null
    })
  }

  // Load available calls and initial records if not fully provided
  useEffect(() => {
    if (!isOpen) return

    let cancelled = false
    async function init() {
      const needFetch = !initialRecordA || !initialRecordB
      if (needFetch) {
        setLoading(true)
      }

      // Always query the service to obtain the complete project execution history
      const listRes = await service.list()
      const fetchedList: HistoryEntry[] = listRes.ok ? listRes.value : []

      // Merge prop allCalls with fetchedList
      const callMap = new Map<string, HistoryEntry>()
      for (const item of allCalls) {
        callMap.set(item.id, item)
      }
      for (const item of fetchedList) {
        callMap.set(item.id, item)
      }

      // Resolve Record A
      let recA = initialRecordA ?? null
      if (!recA && initialIdA) {
        const aRes = await service.get(initialIdA)
        if (aRes.ok && aRes.value) recA = aRes.value
      } else if (!recA && callMap.size > 0) {
        const firstId = Array.from(callMap.keys())[0]!
        const aRes = await service.get(firstId)
        if (aRes.ok && aRes.value) recA = aRes.value
      }

      // Resolve Record B
      let recB = initialRecordB ?? null
      if (!recB && initialIdB) {
        const bRes = await service.get(initialIdB)
        if (bRes.ok && bRes.value) recB = bRes.value
      } else if (!recB && callMap.size > 1) {
        // Pick sibling call or second most recent call
        const entries = Array.from(callMap.values())
        const sibling = recA
          ? entries.find((c) => c.endpointId === recA!.endpointId && c.id !== recA!.id)
          : null
        const targetId = sibling?.id ?? entries.find((c) => c.id !== recA?.id)?.id ?? entries[1]!.id
        const bRes = await service.get(targetId)
        if (bRes.ok && bRes.value) recB = bRes.value
      }

      // Ensure recA and recB are included in the available calls map
      if (recA && !callMap.has(recA.id)) {
        callMap.set(recA.id, {
          id: recA.id,
          endpointId: recA.endpointId,
          method: recA.method,
          endpoint: recA.endpoint,
          status: recA.status,
          timestamp: recA.timestamp,
          environmentId: recA.environmentId,
          durationMs: recA.durationMs,
        })
      }
      if (recB && !callMap.has(recB.id)) {
        callMap.set(recB.id, {
          id: recB.id,
          endpointId: recB.endpointId,
          method: recB.method,
          endpoint: recB.endpoint,
          status: recB.status,
          timestamp: recB.timestamp,
          environmentId: recB.environmentId,
          durationMs: recB.durationMs,
        })
      }

      const mergedList = Array.from(callMap.values()).sort((a, b) => b.timestamp - a.timestamp)

      if (!cancelled) {
        setAvailableCalls(mergedList)
        setRecordA(recA)
        setRecordB(recB)
        setLoading(false)
      }
    }

    void init()
    return () => {
      cancelled = true
    }
  }, [isOpen, initialRecordA, initialRecordB, initialIdA, initialIdB, allCalls, service])

  const handleSelectA = async (id: string) => {
    if (!id) return
    setLoading(true)
    const res = await service.get(id)
    if (res.ok && res.value) {
      setRecordA(res.value)
    }
    setLoading(false)
  }

  const handleSelectB = async (id: string) => {
    if (!id) return
    setLoading(true)
    const res = await service.get(id)
    if (res.ok && res.value) {
      setRecordB(res.value)
    }
    setLoading(false)
  }

  const handleSwap = () => {
    const temp = recordA
    setRecordA(recordB)
    setRecordB(temp)
  }

  // Display calls: ensure recordA and recordB are always present in the select options
  const displayCalls = useMemo(() => {
    const map = new Map<string, HistoryEntry>()
    for (const c of availableCalls) {
      map.set(c.id, c)
    }
    for (const c of allCalls) {
      if (!map.has(c.id)) map.set(c.id, c)
    }
    if (recordA && !map.has(recordA.id)) {
      map.set(recordA.id, {
        id: recordA.id,
        endpointId: recordA.endpointId,
        method: recordA.method,
        endpoint: recordA.endpoint,
        status: recordA.status,
        timestamp: recordA.timestamp,
        environmentId: recordA.environmentId,
        durationMs: recordA.durationMs,
      })
    }
    if (recordB && !map.has(recordB.id)) {
      map.set(recordB.id, {
        id: recordB.id,
        endpointId: recordB.endpointId,
        method: recordB.method,
        endpoint: recordB.endpoint,
        status: recordB.status,
        timestamp: recordB.timestamp,
        environmentId: recordB.environmentId,
        durationMs: recordB.durationMs,
      })
    }
    return Array.from(map.values()).sort((a, b) => b.timestamp - a.timestamp)
  }, [availableCalls, allCalls, recordA, recordB])

  // Prettified payloads & diff computations
  const formattedResponseA = useMemo(
    () => formatPayload(recordA?.responseBody),
    [recordA?.responseBody],
  )
  const formattedResponseB = useMemo(
    () => formatPayload(recordB?.responseBody),
    [recordB?.responseBody],
  )
  const responseDiff = useMemo(
    () => computeLineDiff(formattedResponseA, formattedResponseB),
    [formattedResponseA, formattedResponseB],
  )

  const formattedRequestA = useMemo(
    () => formatPayload(recordA?.requestBody),
    [recordA?.requestBody],
  )
  const formattedRequestB = useMemo(
    () => formatPayload(recordB?.requestBody),
    [recordB?.requestBody],
  )
  const requestDiff = useMemo(
    () => computeLineDiff(formattedRequestA, formattedRequestB),
    [formattedRequestA, formattedRequestB],
  )

  const headersDiff = useMemo<HeaderDiffItem[]>(
    () => compareHeaders(recordA?.headers, recordB?.headers),
    [recordA?.headers, recordB?.headers],
  )

  const metrics = useMemo<MetricsDiff | null>(() => {
    if (!recordA || !recordB) return null
    return compareMetrics(recordA, recordB)
  }, [recordA, recordB])

  const handleCopy = useCallback((text: string, key: string) => {
    void copyText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 1500)
  }, [])

  // Active line diff based on selected tab
  const activeLineDiff = activeTab === 'request' ? requestDiff : responseDiff

  // Filter for changes only
  const filteredSideBySide = useMemo(() => {
    if (!onlyChanges) return activeLineDiff.sideBySide
    return activeLineDiff.sideBySide.filter(
      (r) => r.left.type !== 'same' || r.right.type !== 'same',
    )
  }, [activeLineDiff.sideBySide, onlyChanges])

  const filteredUnified = useMemo(() => {
    if (!onlyChanges) return activeLineDiff.unified
    return activeLineDiff.unified.filter((l) => l.type !== 'same')
  }, [activeLineDiff.unified, onlyChanges])

  if (!isOpen) return null

  return (
    <Dialog title="Side-by-Side Response Diff" onClose={onClose} size="full" align="top">
      <div className="flex flex-col gap-3 p-3 text-xs text-text max-h-[85vh] overflow-hidden">
        {/* Selector & Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface p-2.5">
          {/* Call Selectors */}
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
            {/* Record A Selector */}
            <div className="flex items-center gap-1.5 flex-1 min-w-[200px]">
              <span className="font-semibold text-[11px] text-muted shrink-0">Baseline (A):</span>
              <select
                aria-label="Baseline execution (A)"
                value={recordA?.id ?? ''}
                onChange={(e) => void handleSelectA(e.target.value)}
                className="h-7 w-full rounded border border-border bg-surface px-1.5 text-xs text-text font-mono truncate focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
              >
                {!recordA?.id ? (
                  <option value="" disabled className="bg-surface text-muted">
                    Select baseline call…
                  </option>
                ) : null}
                {displayCalls.length === 0 ? (
                  <option value="" disabled className="bg-surface text-muted">
                    No calls recorded
                  </option>
                ) : (
                  displayCalls.map((c) => (
                    <option key={c.id} value={c.id} className="bg-surface text-text py-1">
                      {c.method.toUpperCase()} {c.endpoint} [{c.status}] ({formatTime(c.timestamp)})
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Swap Button */}
            <IconButton
              label="Swap Baseline (A) and Comparison (B)"
              onClick={handleSwap}
              className="h-7 w-7 rounded-md border border-border hover:bg-surface-hover text-muted hover:text-primary shrink-0"
            >
              <SwapIcon className="h-3.5 w-3.5" />
            </IconButton>

            {/* Record B Selector */}
            <div className="flex items-center gap-1.5 flex-1 min-w-[200px]">
              <span className="font-semibold text-[11px] text-muted shrink-0">Compare (B):</span>
              <select
                aria-label="Comparison execution (B)"
                value={recordB?.id ?? ''}
                onChange={(e) => void handleSelectB(e.target.value)}
                className="h-7 w-full rounded border border-border bg-surface px-1.5 text-xs text-text font-mono truncate focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
              >
                {!recordB?.id ? (
                  <option value="" disabled className="bg-surface text-muted">
                    Select comparison call…
                  </option>
                ) : null}
                {displayCalls.length === 0 ? (
                  <option value="" disabled className="bg-surface text-muted">
                    No calls recorded
                  </option>
                ) : (
                  displayCalls.map((c) => (
                    <option key={c.id} value={c.id} className="bg-surface text-text py-1">
                      {c.method.toUpperCase()} {c.endpoint} [{c.status}] ({formatTime(c.timestamp)})
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          {/* View Mode & Filter Controls */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Split / Unified toggle */}
            <div className="flex items-center rounded-md border border-border bg-bg p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('split')}
                className={`flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  viewMode === 'split'
                    ? 'bg-primary text-primary-fg shadow-sm'
                    : 'text-muted hover:text-text'
                }`}
                title="Split Side-by-Side View"
              >
                <SplitViewIcon className="h-3.5 w-3.5" />
                <span>Split</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('unified')}
                className={`flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  viewMode === 'unified'
                    ? 'bg-primary text-primary-fg shadow-sm'
                    : 'text-muted hover:text-text'
                }`}
                title="Unified Combined View"
              >
                <UnifiedViewIcon className="h-3.5 w-3.5" />
                <span>Unified</span>
              </button>
            </div>

            {/* Only Changes Filter */}
            <Button
              variant={onlyChanges ? 'secondary' : 'ghost'}
              onClick={() => setOnlyChanges(!onlyChanges)}
              className={`h-7 px-2 text-[11px] font-medium ${
                onlyChanges ? 'border-primary text-primary' : 'text-muted'
              }`}
            >
              {onlyChanges ? 'Showing Changes Only' : 'All Lines'}
            </Button>
          </div>
        </div>

        {/* Summary Metrics Banner */}
        {metrics ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2 text-[11px]">
            {/* Status & Latency Diff */}
            <div className="flex items-center gap-3">
              {/* Status Comparison */}
              <div className="flex items-center gap-1.5 font-mono">
                <span className="text-muted font-sans text-[10px]">Status:</span>
                <Badge kind={statusKind(metrics.statusA)}>{metrics.statusA}</Badge>
                <span className="text-muted">→</span>
                <Badge kind={statusKind(metrics.statusB)}>{metrics.statusB}</Badge>
                {metrics.statusChanged ? (
                  <span className="text-[10px] text-warning font-sans font-semibold ml-1">
                    (Changed)
                  </span>
                ) : null}
              </div>

              {/* Latency Comparison */}
              {metrics.durationA != null && metrics.durationB != null ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-muted text-[10px]">Latency:</span>
                  <span className="font-mono">{metrics.durationA}ms</span>
                  <span className="text-muted">→</span>
                  <span className="font-mono">{metrics.durationB}ms</span>
                  {metrics.durationDelta !== undefined && metrics.durationDelta !== 0 ? (
                    <span
                      className={`font-mono font-medium text-[10px] ${
                        metrics.durationDelta > 0 ? 'text-danger' : 'text-success'
                      }`}
                    >
                      ({metrics.durationDelta > 0 ? '+' : ''}
                      {metrics.durationDelta}ms
                      {metrics.durationPercentDelta !== undefined
                        ? ` / ${metrics.durationPercentDelta > 0 ? '+' : ''}${metrics.durationPercentDelta}%`
                        : ''}
                      )
                    </span>
                  ) : null}
                </div>
              ) : null}

              {/* Payload Size Comparison */}
              <div className="flex items-center gap-1.5">
                <span className="text-muted text-[10px]">Size:</span>
                <span className="font-mono">{formatBytes(metrics.sizeA)}</span>
                <span className="text-muted">→</span>
                <span className="font-mono">{formatBytes(metrics.sizeB)}</span>
                {metrics.sizeDelta !== 0 ? (
                  <span
                    className={`font-mono text-[10px] ${
                      metrics.sizeDelta > 0 ? 'text-primary' : 'text-muted'
                    }`}
                  >
                    ({formatBytes(metrics.sizeDelta)})
                  </span>
                ) : null}
              </div>
            </div>

            {/* Quick Stats Badges */}
            <div className="flex items-center gap-2">
              <span className="rounded bg-success/15 px-1.5 py-0.5 font-mono text-[10px] text-success font-medium">
                +{activeLineDiff.additions} added
              </span>
              <span className="rounded bg-danger/15 px-1.5 py-0.5 font-mono text-[10px] text-danger font-medium">
                -{activeLineDiff.deletions} removed
              </span>
            </div>
          </div>
        ) : null}

        {/* Navigation Tabs */}
        <div className="flex items-center justify-between border-b border-border">
          <Tabs tabs={DIFF_TABS} activeId={activeTab} onChange={(id) => setActiveTab(id)} />

          <div className="flex items-center gap-1.5 pb-1">
            <Button
              variant="ghost"
              onClick={() =>
                handleCopy(
                  activeTab === 'request' ? formattedRequestA : formattedResponseA,
                  'copy-a',
                )
              }
              className="h-6 px-2 text-[10px] text-muted hover:text-text flex items-center gap-1"
            >
              {copiedKey === 'copy-a' ? (
                <CopiedIcon className="h-3 w-3 text-success" />
              ) : (
                <CopyIcon className="h-3 w-3" />
              )}
              <span>Copy A</span>
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                handleCopy(
                  activeTab === 'request' ? formattedRequestB : formattedResponseB,
                  'copy-b',
                )
              }
              className="h-6 px-2 text-[10px] text-muted hover:text-text flex items-center gap-1"
            >
              {copiedKey === 'copy-b' ? (
                <CopiedIcon className="h-3 w-3 text-success" />
              ) : (
                <CopyIcon className="h-3 w-3" />
              )}
              <span>Copy B</span>
            </Button>
          </div>
        </div>

        {/* Content Area */}
        {loading && (!recordA || !recordB) ? (
          <div className="flex items-center justify-center py-16 text-muted">
            <Spinner className="h-6 w-6" />
          </div>
        ) : activeTab === 'headers' ? (
          /* Headers Diff View */
          <div className="flex flex-col gap-1 overflow-y-auto max-h-[55vh] rounded-md border border-border p-2">
            {headersDiff.length === 0 ? (
              <div className="py-8 text-center text-muted">No headers recorded on either call.</div>
            ) : (
              <div className="flex flex-col divide-y divide-border font-mono text-[11px]">
                {headersDiff.map((h) => {
                  let badge = <Badge kind="neutral">Unchanged</Badge>
                  let rowBg = ''
                  if (h.type === 'added') {
                    badge = <Badge kind="success">+ Added</Badge>
                    rowBg = 'bg-success/5'
                  } else if (h.type === 'removed') {
                    badge = <Badge kind="error">- Removed</Badge>
                    rowBg = 'bg-danger/5'
                  } else if (h.type === 'modified') {
                    badge = <Badge kind="warning">~ Modified</Badge>
                    rowBg = 'bg-warning/5'
                  }

                  return (
                    <div
                      key={h.key}
                      className={`flex items-start justify-between gap-3 py-1.5 px-2 rounded ${rowBg}`}
                    >
                      <div className="flex items-center gap-2 min-w-[140px]">
                        <span className="font-semibold text-text">{h.key}</span>
                        {badge}
                      </div>

                      <div className="flex flex-1 items-center justify-end gap-2 text-right truncate">
                        {h.type === 'modified' ? (
                          <>
                            <span className="text-danger line-through truncate max-w-[45%]">
                              {h.valueA}
                            </span>
                            <span className="text-muted">→</span>
                            <span className="text-success font-medium truncate max-w-[45%]">
                              {h.valueB}
                            </span>
                          </>
                        ) : h.type === 'removed' ? (
                          <span className="text-danger line-through truncate">{h.valueA}</span>
                        ) : (
                          <span
                            className={
                              h.type === 'added' ? 'text-success font-medium' : 'text-text'
                            }
                          >
                            {h.valueB ?? h.valueA}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ) : activeTab === 'params' ? (
          /* Parameters Diff View */
          <div className="flex flex-col gap-3 overflow-y-auto max-h-[55vh] rounded-md border border-border p-3">
            <div>
              <h4 className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-1.5">
                Query Parameters
              </h4>
              <div className="rounded border border-border bg-surface p-2 font-mono text-[11px]">
                {recordA?.queryParams || recordB?.queryParams ? (
                  <div className="flex flex-col divide-y divide-border">
                    {Array.from(
                      new Set([
                        ...Object.keys(recordA?.queryParams ?? {}),
                        ...Object.keys(recordB?.queryParams ?? {}),
                      ]),
                    ).map((k) => {
                      const vA = recordA?.queryParams?.[k]
                      const vB = recordB?.queryParams?.[k]
                      const isSame = vA === vB
                      return (
                        <div key={k} className="flex items-center justify-between py-1">
                          <span className="text-primary font-semibold">{k}</span>
                          <div className="flex items-center gap-2">
                            {isSame ? (
                              <span className="text-text">{vA}</span>
                            ) : (
                              <>
                                <span className="text-danger line-through">{vA ?? '(none)'}</span>
                                <span className="text-muted">→</span>
                                <span className="text-success font-medium">{vB ?? '(none)'}</span>
                              </>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-muted">No query parameters recorded.</div>
                )}
              </div>
            </div>

            <div>
              <h4 className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-1.5">
                Path Parameters
              </h4>
              <div className="rounded border border-border bg-surface p-2 font-mono text-[11px]">
                {recordA?.pathParams || recordB?.pathParams ? (
                  <div className="flex flex-col divide-y divide-border">
                    {Array.from(
                      new Set([
                        ...Object.keys(recordA?.pathParams ?? {}),
                        ...Object.keys(recordB?.pathParams ?? {}),
                      ]),
                    ).map((k) => {
                      const vA = recordA?.pathParams?.[k]
                      const vB = recordB?.pathParams?.[k]
                      const isSame = vA === vB
                      return (
                        <div key={k} className="flex items-center justify-between py-1">
                          <span className="text-primary font-semibold">{k}</span>
                          <div className="flex items-center gap-2">
                            {isSame ? (
                              <span className="text-text">{vA}</span>
                            ) : (
                              <>
                                <span className="text-danger line-through">{vA ?? '(none)'}</span>
                                <span className="text-muted">→</span>
                                <span className="text-success font-medium">{vB ?? '(none)'}</span>
                              </>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-muted">No path parameters recorded.</div>
                )}
              </div>
            </div>
          </div>
        ) : viewMode === 'split' ? (
          /* Side-by-Side Dual Pane Split View */
          <div className="flex flex-col rounded-md border border-border overflow-hidden bg-bg">
            {/* Column Headers */}
            <div className="grid grid-cols-2 border-b border-border bg-surface text-[11px] font-semibold">
              <div className="flex items-center justify-between px-3 py-1.5 border-r border-border">
                <span className="text-muted">
                  Baseline (A):{' '}
                  {recordA ? `${recordA.method.toUpperCase()} ${recordA.status}` : 'None'}
                </span>
                <span className="font-mono text-[10px] text-muted">
                  {recordA ? formatTime(recordA.timestamp) : ''}
                </span>
              </div>
              <div className="flex items-center justify-between px-3 py-1.5">
                <span className="text-muted">
                  Comparison (B):{' '}
                  {recordB ? `${recordB.method.toUpperCase()} ${recordB.status}` : 'None'}
                </span>
                <span className="font-mono text-[10px] text-muted">
                  {recordB ? formatTime(recordB.timestamp) : ''}
                </span>
              </div>
            </div>

            {/* Split Content Area */}
            <div className="grid grid-cols-2 divide-x divide-border max-h-[55vh]">
              {/* Left Pane (Record A) */}
              <div
                ref={leftScrollRef}
                onScroll={handleLeftScroll}
                className="overflow-auto font-mono text-[11px] leading-5 overscroll-contain select-text"
              >
                {filteredSideBySide.length === 0 ? (
                  <div className="py-12 text-center text-muted">
                    {onlyChanges ? 'No differences found.' : 'Empty payload.'}
                  </div>
                ) : (
                  <table className="w-full border-collapse">
                    <tbody>
                      {filteredSideBySide.map((row, idx) => {
                        const line = row.left
                        const isRemoved = line.type === 'removed'
                        const isEmpty = line.type === 'empty'

                        let bgClass = ''
                        if (isRemoved) bgClass = 'bg-danger/15 text-danger font-medium'
                        else if (isEmpty) bgClass = 'bg-surface opacity-50'

                        return (
                          <tr key={`left-${idx}`} className={`hover:bg-surface ${bgClass}`}>
                            <td className="w-8 select-none border-r border-border px-1 text-right text-[10px] text-muted opacity-60">
                              {line.lineNumber ?? ''}
                            </td>
                            <td className="w-4 select-none px-1 text-center font-bold">
                              {isRemoved ? '-' : ''}
                            </td>
                            <td className="px-2 whitespace-pre font-mono">{line.text || ' '}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Right Pane (Record B) */}
              <div
                ref={rightScrollRef}
                onScroll={handleRightScroll}
                className="overflow-auto font-mono text-[11px] leading-5 overscroll-contain select-text"
              >
                {filteredSideBySide.length === 0 ? (
                  <div className="py-12 text-center text-muted">
                    {onlyChanges ? 'No differences found.' : 'Empty payload.'}
                  </div>
                ) : (
                  <table className="w-full border-collapse">
                    <tbody>
                      {filteredSideBySide.map((row, idx) => {
                        const line = row.right
                        const isAdded = line.type === 'added'
                        const isEmpty = line.type === 'empty'

                        let bgClass = ''
                        if (isAdded) bgClass = 'bg-success/15 text-success font-medium'
                        else if (isEmpty) bgClass = 'bg-surface opacity-50'

                        return (
                          <tr key={`right-${idx}`} className={`hover:bg-surface ${bgClass}`}>
                            <td className="w-8 select-none border-r border-border px-1 text-right text-[10px] text-muted opacity-60">
                              {line.lineNumber ?? ''}
                            </td>
                            <td className="w-4 select-none px-1 text-center font-bold">
                              {isAdded ? '+' : ''}
                            </td>
                            <td className="px-2 whitespace-pre font-mono">{line.text || ' '}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Unified Inline Diff View */
          <div className="flex flex-col rounded-md border border-border overflow-hidden bg-bg max-h-[55vh] overflow-y-auto">
            {filteredUnified.length === 0 ? (
              <div className="py-12 text-center text-muted">
                {onlyChanges ? 'No differences found.' : 'Empty payload.'}
              </div>
            ) : (
              <table className="w-full border-collapse font-mono text-[11px] leading-5 select-text">
                <tbody>
                  {filteredUnified.map((line, idx) => {
                    const isAdded = line.type === 'added'
                    const isRemoved = line.type === 'removed'

                    let bgClass = ''
                    let sign = ' '
                    if (isAdded) {
                      bgClass = 'bg-success/15 text-success font-medium'
                      sign = '+'
                    } else if (isRemoved) {
                      bgClass = 'bg-danger/15 text-danger font-medium'
                      sign = '-'
                    }

                    return (
                      <tr key={`unified-${idx}`} className={`hover:bg-surface ${bgClass}`}>
                        <td className="w-10 select-none border-r border-border px-1 text-right text-[10px] text-muted opacity-60">
                          {line.lineNumber ?? ''}
                        </td>
                        <td className="w-4 select-none px-1 text-center font-bold">{sign}</td>
                        <td className="px-2 whitespace-pre font-mono">{line.text || ' '}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </Dialog>
  )
}

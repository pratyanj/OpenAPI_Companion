import { useState, useRef } from 'react'
import { Dialog } from './Dialog'
import { Button } from './Button'
import { Input } from './Input'
import {
  PlayIcon,
  ToastSuccessIcon,
  ToastWarningIcon,
  ToastErrorIcon,
  ClockIcon,
  CopyIcon,
  WorkflowIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  SparklesIcon,
} from './icons'
import type {
  PaginationConfig,
  PaginationReport,
  PaginationStrategy,
  DetectedPagination,
} from '@/modules/pagination/types'
import { PaginationRunner, type PaginationRequestExecutor } from '@/modules/pagination/runner'
import type { WorkflowInput } from '@/modules/workflows/types'
import { cn } from '@/utils'

export interface PaginationTesterModalProps {
  isOpen: boolean
  endpointId: string
  initialConfig?: Partial<PaginationConfig>
  detected?: DetectedPagination | null
  executor?: PaginationRequestExecutor
  onClose: () => void
  onSaveToWorkflow?: (workflowInput: WorkflowInput) => Promise<void> | void
  onToast?: (message: string, kind?: 'success' | 'warning' | 'error') => void
}

function methodBadgeColor(method: string): string {
  switch (method.toUpperCase()) {
    case 'GET':
      return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
    case 'POST':
      return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
    default:
      return 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20'
  }
}

export function PaginationTesterModal({
  isOpen,
  endpointId,
  initialConfig,
  detected,
  executor,
  onClose,
  onSaveToWorkflow,
  onToast,
}: PaginationTesterModalProps) {
  const method = endpointId.split(' ')[0]?.toUpperCase() || 'GET'
  const path = endpointId.split(' ')[1] || endpointId

  // Strategy & Parameters
  const [strategy, setStrategy] = useState<PaginationStrategy>(
    initialConfig?.strategy ?? detected?.strategy ?? 'page',
  )
  const [pageParam, setPageParam] = useState(
    initialConfig?.pageParam ?? detected?.pageParam ?? 'page',
  )
  const [pageSizeParam, setPageSizeParam] = useState(
    initialConfig?.pageSizeParam ?? detected?.pageSizeParam ?? 'limit',
  )
  const [offsetParam, setOffsetParam] = useState(
    initialConfig?.offsetParam ?? detected?.offsetParam ?? 'offset',
  )
  const [cursorParam, setCursorParam] = useState(
    initialConfig?.cursorParam ?? detected?.cursorParam ?? 'cursor',
  )
  const [cursorPath, setCursorPath] = useState(
    initialConfig?.cursorPath ?? detected?.cursorPath ?? '$.next_cursor',
  )
  const [initialPage, setInitialPage] = useState(
    initialConfig?.initialPage ?? detected?.suggestedInitialPage ?? 1,
  )
  const [initialOffset, setInitialOffset] = useState(
    initialConfig?.initialOffset ?? detected?.suggestedInitialOffset ?? 0,
  )
  const [pageSize, setPageSize] = useState(
    initialConfig?.pageSize ?? detected?.suggestedPageSize ?? 20,
  )
  const [maxPages, setMaxPages] = useState(initialConfig?.maxPages ?? 10)
  const [delayMs, setDelayMs] = useState(initialConfig?.delayMs ?? 200)

  // Execution state
  const [isRunning, setIsRunning] = useState(false)
  const [progress, setProgress] = useState<{
    pageNumber: number
    maxPages: number
    recordsCollected: number
  } | null>(null)
  const [report, setReport] = useState<PaginationReport | null>(null)
  const [activeTab, setActiveTab] = useState<'config' | 'results' | 'records'>('config')
  const [expandedPageIndex, setExpandedPageIndex] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)

  const abortControllerRef = useRef<AbortController | null>(null)

  const handleRun = async () => {
    if (!executor) {
      onToast?.('No execution engine available to run pagination test', 'error')
      return
    }

    const config: PaginationConfig = {
      endpointId,
      strategy,
      pageParam: pageParam.trim() || undefined,
      pageSizeParam: pageSizeParam.trim() || undefined,
      offsetParam: offsetParam.trim() || undefined,
      cursorParam: cursorParam.trim() || undefined,
      cursorPath: cursorPath.trim() || undefined,
      initialPage: Number(initialPage) || 1,
      initialOffset: Number(initialOffset) || 0,
      pageSize: Number(pageSize) || 20,
      maxPages: Number(maxPages) || 10,
      delayMs: Number(delayMs) || 0,
    }

    const controller = new AbortController()
    abortControllerRef.current = controller

    setIsRunning(true)
    setProgress({ pageNumber: 0, maxPages: config.maxPages, recordsCollected: 0 })
    setReport(null)

    const runner = new PaginationRunner(executor)
    try {
      const rep = await runner.run(config, {
        signal: controller.signal,
        onProgress: (p) => {
          setProgress({
            pageNumber: p.pageNumber,
            maxPages: p.maxPages,
            recordsCollected: p.recordsCollected,
          })
        },
      })
      setReport(rep)
      setActiveTab('results')
      onToast?.(
        `Pagination test finished: ${rep.totalPages} pages tested, ${rep.totalRecords} records collected.`,
        rep.checks.duplicatesClean && rep.checks.pageSizesValid ? 'success' : 'warning',
      )
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Pagination test execution failed'
      onToast?.(msg, 'error')
    } finally {
      setIsRunning(false)
      abortControllerRef.current = null
    }
  }

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setIsRunning(false)
  }

  const handleCopyReport = async () => {
    if (!report) return
    try {
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      onToast?.('Pagination report copied to clipboard', 'success')
    } catch {
      onToast?.('Failed to copy report to clipboard', 'error')
    }
  }

  const handleExportWorkflow = async () => {
    if (!report || !onSaveToWorkflow) return
    const workflowSteps = report.steps.map((st, idx) => ({
      id: `step_${idx + 1}`,
      endpointId,
      name: `Page ${st.pageNumber} (${endpointId})`,
      queryParams: st.queryParams,
      assertions: [
        {
          id: `assert_status_${idx + 1}`,
          type: 'status' as const,
          operator: 'is2xx' as const,
        },
      ],
    }))

    const workflowInput: WorkflowInput = {
      name: `Pagination: ${endpointId} (${report.totalPages} pages)`,
      description: `Automated pagination scenario for ${endpointId} validating ${report.totalRecords} records across ${report.totalPages} pages.`,
      mode: 'continue-on-failure',
      steps: workflowSteps,
    }

    try {
      await onSaveToWorkflow(workflowInput)
      onToast?.('Saved pagination scenario to Workflows!', 'success')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save workflow'
      onToast?.(msg, 'error')
    }
  }

  if (!isOpen) return null

  return (
    <Dialog
      onClose={isRunning ? handleStop : onClose}
      title={
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <WorkflowIcon className="w-4 h-4" />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-text">Pagination Tester</span>
            <span
              className={cn(
                'px-1.5 py-0.5 rounded text-[10px] font-semibold border',
                methodBadgeColor(method),
              )}
            >
              {method}
            </span>
            <span className="font-mono text-xs text-text-muted">{path}</span>
          </div>
        </div>
      }
      actions={
        <div className="flex items-center gap-1 mr-2 p-1 bg-surface-hover rounded-lg border border-border">
          <button
            type="button"
            onClick={() => setActiveTab('config')}
            className={cn(
              'px-2.5 py-1 rounded text-xs font-medium transition-colors',
              activeTab === 'config'
                ? 'bg-surface text-text shadow-sm'
                : 'text-text-muted hover:text-text',
            )}
          >
            Config
          </button>
          <button
            type="button"
            disabled={!report}
            onClick={() => setActiveTab('results')}
            className={cn(
              'px-2.5 py-1 rounded text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
              activeTab === 'results'
                ? 'bg-surface text-text shadow-sm'
                : 'text-text-muted hover:text-text',
            )}
          >
            Report
          </button>
          <button
            type="button"
            disabled={!report}
            onClick={() => setActiveTab('records')}
            className={cn(
              'px-2.5 py-1 rounded text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
              activeTab === 'records'
                ? 'bg-surface text-text shadow-sm'
                : 'text-text-muted hover:text-text',
            )}
          >
            Pages ({report?.steps.length ?? 0})
          </button>
        </div>
      }
      size="xl"
    >
      <div className="flex flex-col gap-3 font-sans text-xs">
        <p className="text-[11px] text-text-muted -mt-1">
          Execute automated multi-page requests, validate page sizes, and detect duplicate records.
        </p>

        {/* Live Running Progress Banner */}
        {isRunning && progress && (
          <div className="flex flex-col gap-2 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg animate-pulse">
            <div className="flex items-center justify-between text-xs font-semibold text-blue-600 dark:text-blue-400">
              <div className="flex items-center gap-2">
                <ClockIcon className="w-4 h-4 animate-spin" />
                <span>
                  Testing page {progress.pageNumber} of {progress.maxPages}...
                </span>
              </div>
              <span>{progress.recordsCollected} records collected</span>
            </div>
            <div className="w-full bg-blue-200 dark:bg-blue-950 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-blue-600 dark:bg-blue-400 h-1.5 rounded-full transition-all duration-300"
                style={{
                  width: `${Math.min(100, (progress.pageNumber / progress.maxPages) * 100)}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Tab 1: Config */}
        {activeTab === 'config' && (
          <div className="flex flex-col gap-4">
            {/* Auto-detection Notice */}
            {detected && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                <SparklesIcon className="w-4 h-4 flex-shrink-0 text-emerald-500" />
                <span className="text-[11px]">
                  <strong>Auto-detected pattern:</strong> {detected.detectedFrom} (confidence:{' '}
                  {detected.confidence})
                </span>
              </div>
            )}

            {/* Strategy Selectors */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-text-muted">
                Pagination Strategy
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { id: 'page', label: 'Page-based (?page=1&limit=20)' },
                  { id: 'offset', label: 'Limit/Offset (?offset=0&limit=20)' },
                  { id: 'cursor', label: 'Cursor-based (?cursor=abc123)' },
                  { id: 'custom', label: 'Custom parameters' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setStrategy(item.id as PaginationStrategy)}
                    className={cn(
                      'p-2 text-left rounded-lg border transition-all text-xs flex flex-col gap-0.5',
                      strategy === item.id
                        ? 'border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold shadow-sm'
                        : 'border-border bg-surface hover:bg-surface-hover text-text',
                    )}
                  >
                    <span>{item.label.split(' ')[0]}</span>
                    <span className="text-[10px] text-text-muted font-normal">
                      {item.label.split(' ')[1]}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Strategy Parameter Settings */}
            <div className="grid grid-cols-2 gap-3 p-3 rounded-lg border border-border bg-surface/40">
              {strategy === 'page' && (
                <>
                  <div>
                    <label className="block text-[11px] font-medium text-text-muted mb-1">
                      Page Parameter Name
                    </label>
                    <Input
                      value={pageParam}
                      onChange={(e) => setPageParam(e.target.value)}
                      placeholder="e.g. page, page_number"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-text-muted mb-1">
                      Page Size Parameter Name
                    </label>
                    <Input
                      value={pageSizeParam}
                      onChange={(e) => setPageSizeParam(e.target.value)}
                      placeholder="e.g. limit, page_size, per_page"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-text-muted mb-1">
                      Initial Page Number
                    </label>
                    <Input
                      type="number"
                      value={String(initialPage)}
                      onChange={(e) => setInitialPage(parseInt(e.target.value, 10) || 0)}
                    />
                  </div>
                </>
              )}

              {strategy === 'offset' && (
                <>
                  <div>
                    <label className="block text-[11px] font-medium text-text-muted mb-1">
                      Offset Parameter Name
                    </label>
                    <Input
                      value={offsetParam}
                      onChange={(e) => setOffsetParam(e.target.value)}
                      placeholder="e.g. offset, skip"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-text-muted mb-1">
                      Limit Parameter Name
                    </label>
                    <Input
                      value={pageSizeParam}
                      onChange={(e) => setPageSizeParam(e.target.value)}
                      placeholder="e.g. limit, take"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-text-muted mb-1">
                      Initial Offset Value
                    </label>
                    <Input
                      type="number"
                      value={String(initialOffset)}
                      onChange={(e) => setInitialOffset(parseInt(e.target.value, 10) || 0)}
                    />
                  </div>
                </>
              )}

              {strategy === 'cursor' && (
                <>
                  <div>
                    <label className="block text-[11px] font-medium text-text-muted mb-1">
                      Cursor Query Parameter
                    </label>
                    <Input
                      value={cursorParam}
                      onChange={(e) => setCursorParam(e.target.value)}
                      placeholder="e.g. cursor, starting_after"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-text-muted mb-1">
                      Next-Cursor JSONPath in Response
                    </label>
                    <Input
                      value={cursorPath}
                      onChange={(e) => setCursorPath(e.target.value)}
                      placeholder="e.g. $.next_cursor, $.meta.cursor"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-text-muted mb-1">
                      Limit Parameter Name (optional)
                    </label>
                    <Input
                      value={pageSizeParam}
                      onChange={(e) => setPageSizeParam(e.target.value)}
                      placeholder="e.g. limit"
                    />
                  </div>
                </>
              )}

              {strategy === 'custom' && (
                <>
                  <div>
                    <label className="block text-[11px] font-medium text-text-muted mb-1">
                      Pagination Parameter Name
                    </label>
                    <Input
                      value={pageParam}
                      onChange={(e) => setPageParam(e.target.value)}
                      placeholder="e.g. page"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-text-muted mb-1">
                      Page Size Parameter Name
                    </label>
                    <Input
                      value={pageSizeParam}
                      onChange={(e) => setPageSizeParam(e.target.value)}
                      placeholder="e.g. limit"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-[11px] font-medium text-text-muted mb-1">
                  Page Size / Limit
                </label>
                <Input
                  type="number"
                  value={String(pageSize)}
                  onChange={(e) => setPageSize(parseInt(e.target.value, 10) || 1)}
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-text-muted mb-1">
                  Maximum Pages Limit
                </label>
                <Input
                  type="number"
                  value={String(maxPages)}
                  onChange={(e) => setMaxPages(parseInt(e.target.value, 10) || 1)}
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-text-muted mb-1">
                  Delay Between Requests (ms)
                </label>
                <Input
                  type="number"
                  value={String(delayMs)}
                  onChange={(e) => setDelayMs(parseInt(e.target.value, 10) || 0)}
                />
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Results & Verification Report */}
        {activeTab === 'results' && report && (
          <div className="flex flex-col gap-4">
            {/* Top Metric Cards */}
            <div className="grid grid-cols-4 gap-2.5">
              <div className="p-3 rounded-lg border border-border bg-surface flex flex-col gap-0.5">
                <span className="text-[10px] text-text-muted uppercase font-semibold">
                  Pages Tested
                </span>
                <span className="text-xl font-bold text-text">{report.totalPages}</span>
                <span className="text-[10px] text-text-muted">
                  Stop reason: {report.stoppedReason.replace(/_/g, ' ')}
                </span>
              </div>

              <div className="p-3 rounded-lg border border-border bg-surface flex flex-col gap-0.5">
                <span className="text-[10px] text-text-muted uppercase font-semibold">
                  Total Records
                </span>
                <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                  {report.totalRecords}
                </span>
                <span className="text-[10px] text-text-muted">
                  {report.uniqueRecords} unique records
                </span>
              </div>

              <div className="p-3 rounded-lg border border-border bg-surface flex flex-col gap-0.5">
                <span className="text-[10px] text-text-muted uppercase font-semibold">
                  Duplicates Detected
                </span>
                <span
                  className={cn(
                    'text-xl font-bold',
                    report.checks.duplicatesClean
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400',
                  )}
                >
                  {report.totalRecords - report.uniqueRecords}
                </span>
                <span className="text-[10px] text-text-muted">
                  {report.checks.duplicatesClean ? 'No duplicate IDs' : 'Requires inspection'}
                </span>
              </div>

              <div className="p-3 rounded-lg border border-border bg-surface flex flex-col gap-0.5">
                <span className="text-[10px] text-text-muted uppercase font-semibold">
                  Total Duration
                </span>
                <span className="text-xl font-bold text-text">{report.durationMs}ms</span>
                <span className="text-[10px] text-text-muted">
                  Avg {Math.round(report.durationMs / Math.max(1, report.totalPages))}ms / page
                </span>
              </div>
            </div>

            {/* Integrity Checklist */}
            <div className="flex flex-col gap-1.5 p-3 rounded-lg border border-border bg-surface/40">
              <h3 className="text-xs font-semibold text-text mb-1">
                Data Integrity & Progression Checks
              </h3>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-2">
                  {report.checks.duplicatesClean ? (
                    <ToastSuccessIcon className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <ToastErrorIcon className="w-4 h-4 text-rose-500" />
                  )}
                  <span>
                    {report.checks.duplicatesClean
                      ? 'No duplicate records detected across pages'
                      : 'Duplicate records detected across pages'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {report.checks.pageSizesValid ? (
                    <ToastSuccessIcon className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <ToastWarningIcon className="w-4 h-4 text-amber-500" />
                  )}
                  <span>
                    {report.checks.pageSizesValid
                      ? 'Page sizes match requested limit'
                      : 'Page size discrepancies observed'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {report.checks.cursorProgressionValid ? (
                    <ToastSuccessIcon className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <ToastErrorIcon className="w-4 h-4 text-rose-500" />
                  )}
                  <span>
                    {report.checks.cursorProgressionValid
                      ? 'Cursor progression valid'
                      : 'Cursor repetition / cycle detected'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {report.checks.finalPageDetected ? (
                    <ToastSuccessIcon className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <ToastWarningIcon className="w-4 h-4 text-amber-500" />
                  )}
                  <span>
                    {report.checks.finalPageDetected
                      ? 'Final page clean termination reached'
                      : 'Stopped at max pages limit'}
                  </span>
                </div>
              </div>
            </div>

            {/* Anomalies List */}
            {report.anomalies.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <h3 className="text-xs font-semibold text-text">Anomalies & Warnings</h3>
                <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1">
                  {report.anomalies.map((anom, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        'flex items-center gap-2 p-2 rounded border text-xs',
                        anom.severity === 'error'
                          ? 'bg-rose-500/10 border-rose-500/20 text-rose-700 dark:text-rose-300'
                          : anom.severity === 'warning'
                            ? 'bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-300'
                            : 'bg-blue-500/10 border-blue-500/20 text-blue-700 dark:text-blue-300',
                      )}
                    >
                      {anom.severity === 'error' ? (
                        <ToastErrorIcon className="w-3.5 h-3.5 flex-shrink-0" />
                      ) : anom.severity === 'warning' ? (
                        <ToastWarningIcon className="w-3.5 h-3.5 flex-shrink-0" />
                      ) : (
                        <SparklesIcon className="w-3.5 h-3.5 flex-shrink-0" />
                      )}
                      <span>{anom.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Pages & Records Inspector */}
        {activeTab === 'records' && report && (
          <div className="flex flex-col gap-2 max-h-80 overflow-y-auto pr-1">
            {report.steps.map((st, idx) => {
              const isExpanded = expandedPageIndex === idx
              return (
                <div
                  key={idx}
                  className="flex flex-col rounded-lg border border-border bg-surface overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => setExpandedPageIndex(isExpanded ? null : idx)}
                    className="flex items-center justify-between p-2.5 text-xs hover:bg-surface-hover transition-colors text-left"
                  >
                    <div className="flex items-center gap-2">
                      {isExpanded ? (
                        <ChevronDownIcon className="w-4 h-4 text-text-muted" />
                      ) : (
                        <ChevronRightIcon className="w-4 h-4 text-text-muted" />
                      )}
                      <span className="font-semibold text-text">Page {st.pageNumber}</span>
                      <span className="font-mono text-[11px] text-text-muted">
                        {Object.entries(st.queryParams)
                          .map(([k, v]) => `${k}=${v}`)
                          .join('&')}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          'px-1.5 py-0.5 rounded text-[10px] font-semibold font-mono',
                          st.status >= 200 && st.status < 300
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
                        )}
                      >
                        {st.status || 'ERR'}
                      </span>
                      <span className="text-[11px] font-medium text-text">
                        {st.recordsCount} items
                      </span>
                      <span className="text-[11px] text-text-muted">{st.durationMs}ms</span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="p-3 bg-surface-hover/40 border-t border-border flex flex-col gap-2">
                      {st.cursorValue && (
                        <div className="text-[11px] text-text-muted">
                          <strong>Extracted Next-Cursor:</strong>{' '}
                          <code className="px-1 py-0.5 rounded bg-surface border border-border">
                            {st.cursorValue}
                          </code>
                        </div>
                      )}
                      <div>
                        <div className="text-[11px] font-semibold text-text mb-1">
                          Extracted Records ({st.records.length})
                        </div>
                        <pre className="p-2 rounded bg-surface border border-border font-mono text-[10px] max-h-40 overflow-y-auto text-text">
                          {JSON.stringify(st.records, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Modal Footer Controls */}
        <div className="flex items-center justify-between pt-3 border-t border-border mt-1">
          <div className="flex items-center gap-2">
            {report && (
              <>
                <Button
                  variant="secondary"
                  onClick={handleCopyReport}
                  className="flex items-center gap-1.5"
                >
                  <CopyIcon className="w-3.5 h-3.5" />
                  <span>{copied ? 'Copied!' : 'Copy Report'}</span>
                </Button>

                {onSaveToWorkflow && (
                  <Button
                    variant="secondary"
                    onClick={handleExportWorkflow}
                    className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 border-blue-500/30 hover:bg-blue-500/10"
                  >
                    <WorkflowIcon className="w-3.5 h-3.5" />
                    <span>Save to Workflow</span>
                  </Button>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isRunning ? (
              <Button variant="danger" onClick={handleStop}>
                Stop Execution
              </Button>
            ) : (
              <Button variant="primary" onClick={handleRun} className="flex items-center gap-1.5">
                <PlayIcon className="w-3.5 h-3.5" />
                <span>{report ? 'Re-run Test' : 'Run Test'}</span>
              </Button>
            )}

            <Button variant="secondary" onClick={onClose} disabled={isRunning}>
              Close
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  )
}

import { useState, useEffect, useRef } from 'react'
import {
  Dialog,
  Button,
  Badge,
  Spinner,
  ToastSuccessIcon,
  ToastErrorIcon,
  ClockIcon,
  RunIcon,
} from '@/components'
import { MethodTag } from '@/modules/request/EndpointPicker'
import type { Result } from '@/types'
import type { Workflow, WorkflowRunSummary, StepRunResult, WorkflowExecutionOptions } from './types'

export interface WorkflowRunnerModalProps {
  isOpen: boolean
  onClose: () => void
  workflow: Workflow | null
  onRun: (
    workflowId: string,
    options?: WorkflowExecutionOptions,
  ) => Promise<Result<WorkflowRunSummary>>
  environmentId?: string
}

export function WorkflowRunnerModal({
  isOpen,
  onClose,
  workflow,
  onRun,
  environmentId,
}: WorkflowRunnerModalProps) {
  const [isRunning, setIsRunning] = useState(false)
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(-1)
  const [stepResults, setStepResults] = useState<StepRunResult[]>([])
  const [summary, setSummary] = useState<WorkflowRunSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const startExecution = async () => {
    if (!workflow || isRunning) return

    setIsRunning(true)
    setCurrentStepIndex(0)
    setStepResults([])
    setSummary(null)
    setError(null)

    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const res = await onRun(workflow.id, {
        environmentId,
        signal: controller.signal,
        onStepStart: (idx) => {
          setCurrentStepIndex(idx)
        },
        onStepProgress: (_idx, _total, result) => {
          setStepResults((prev) => [...prev, result])
        },
      })

      if (res.ok) {
        setSummary(res.value)
      } else {
        setError(res.error.message)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Execution failed')
    } finally {
      setIsRunning(false)
      setCurrentStepIndex(-1)
      abortControllerRef.current = null
    }
  }

  // Auto-start execution when modal opens
  useEffect(() => {
    if (isOpen && workflow && !isRunning && !summary) {
      void startExecution()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, workflow?.id])

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
  }

  if (!isOpen || !workflow) return null

  const totalSteps = workflow.steps.length
  const completedCount = stepResults.length
  const progressPercent = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0

  return (
    <Dialog
      title={`Workflow Runner: ${workflow.name}`}
      onClose={() => {
        if (!isRunning) onClose()
      }}
      size="xl"
    >
      <div className="flex flex-col flex-1 overflow-hidden space-y-4 text-sm">
        {/* Progress header */}
        <div className="rounded-lg border border-border bg-surface p-3.5 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-text">
              {isRunning
                ? `Running Step ${(currentStepIndex >= 0 ? currentStepIndex : completedCount) + 1} of ${totalSteps}...`
                : summary
                  ? `Completed (${summary.status})`
                  : 'Ready to run'}
            </span>
            <span className="text-muted font-mono">{progressPercent}%</span>
          </div>

          <div className="w-full bg-border rounded-full h-2 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                summary?.status === 'failed'
                  ? 'bg-danger'
                  : summary?.status === 'cancelled'
                    ? 'bg-warning'
                    : 'bg-primary'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-muted pt-1">
            <span>
              Mode:{' '}
              {workflow.mode === 'stop-on-failure' ? 'Stop on failure' : 'Continue on failure'}
            </span>
            {summary && <span>Total Duration: {summary.durationMs}ms</span>}
          </div>
        </div>

        {/* Global Error Banner */}
        {error && (
          <div className="rounded border border-danger/40 bg-danger/10 p-3 text-xs text-danger">
            {error}
          </div>
        )}

        {/* Summary Banner */}
        {summary && (
          <div
            className={`rounded-lg border p-3 text-xs flex items-center gap-2.5 ${
              summary.status === 'success'
                ? 'border-success/40 bg-success/10 text-success'
                : summary.status === 'failed'
                  ? 'border-danger/40 bg-danger/10 text-danger'
                  : 'border-warning/40 bg-warning/10 text-warning'
            }`}
          >
            {summary.status === 'success' ? (
              <ToastSuccessIcon className="h-4 w-4 shrink-0" />
            ) : summary.status === 'failed' ? (
              <ToastErrorIcon className="h-4 w-4 shrink-0" />
            ) : (
              <ClockIcon className="h-4 w-4 shrink-0" />
            )}
            <div>
              <span className="font-semibold">
                {summary.status === 'success'
                  ? 'Workflow completed successfully!'
                  : summary.status === 'failed'
                    ? 'Workflow execution encountered failures.'
                    : 'Workflow execution was cancelled.'}
              </span>
              <span className="block text-[11px] opacity-90 mt-0.5">
                {summary.completedSteps} of {summary.totalSteps} steps completed in{' '}
                {summary.durationMs}ms.
              </span>
            </div>
          </div>
        )}

        {/* Steps Timeline */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-2">
          {workflow.steps.map((step, idx) => {
            const result = stepResults.find((r) => r.stepId === step.id)
            const isCurrent = isRunning && currentStepIndex === idx
            const isPending = !result && !isCurrent
            const [method] = step.endpointId.split(' ')

            return (
              <div
                key={step.id}
                className={`rounded-lg border p-3 transition-colors ${
                  isCurrent
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : result?.success
                      ? 'border-success/30 bg-surface'
                      : result && !result.success
                        ? 'border-danger/30 bg-danger/5'
                        : 'border-border/70 bg-surface/50 opacity-70'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span className="font-mono text-xs font-bold text-muted w-5">#{idx + 1}</span>

                    <MethodTag method={method || 'GET'} />

                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-text truncate">
                        {step.name || step.endpointId}
                      </div>
                      {step.name && (
                        <div className="text-[11px] text-muted font-mono truncate">
                          {step.endpointId}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {isCurrent && (
                      <Badge kind="info">
                        <span className="flex items-center gap-1">
                          <Spinner className="h-3 w-3" />
                          Running
                        </span>
                      </Badge>
                    )}

                    {isPending && (
                      <Badge kind="neutral">
                        <span className="flex items-center gap-1 text-[11px]">
                          <ClockIcon className="h-3 w-3" />
                          Pending
                        </span>
                      </Badge>
                    )}

                    {result && result.success && (
                      <div className="flex items-center gap-1.5">
                        {result.status && (
                          <span className="font-mono text-xs text-success font-semibold">
                            {result.status}
                          </span>
                        )}
                        <span className="text-[11px] text-muted font-mono">
                          {result.durationMs}ms
                        </span>
                        <Badge kind="success">Passed</Badge>
                      </div>
                    )}

                    {result && !result.success && (
                      <div className="flex items-center gap-1.5">
                        {result.status && (
                          <span className="font-mono text-xs text-danger font-semibold">
                            {result.status}
                          </span>
                        )}
                        <span className="text-[11px] text-muted font-mono">
                          {result.durationMs}ms
                        </span>
                        <Badge kind="error">Failed</Badge>
                      </div>
                    )}
                  </div>
                </div>

                {result?.error && (
                  <div className="mt-2 text-[11px] text-danger bg-danger/10 rounded px-2.5 py-1 font-mono">
                    {result.error}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer controls */}
        <div className="flex items-center justify-between border-t border-border pt-3">
          <div>
            {isRunning && (
              <Button type="button" variant="danger" onClick={handleCancel}>
                Cancel Run
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!isRunning && (
              <Button
                type="button"
                variant="secondary"
                onClick={startExecution}
                className="flex items-center gap-1"
              >
                <RunIcon className="h-3.5 w-3.5 text-primary" />
                Re-run
              </Button>
            )}
            <Button type="button" variant="primary" onClick={onClose} disabled={isRunning}>
              Close
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  )
}

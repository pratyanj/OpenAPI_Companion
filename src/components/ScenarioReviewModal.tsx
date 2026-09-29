import { useState, useMemo, useCallback } from 'react'
import { Dialog } from './Dialog'
import { Button } from './Button'
import { IconButton } from './IconButton'
import { Input } from './Input'
import {
  WorkflowIcon,
  ZapIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  DeleteIcon,
  ClockIcon,
} from './icons'
import type { Scenario, RecordedStep, SuggestedVariableBinding } from '@/modules/workflows/recorder/types'
import { ScenarioRecorderService } from '@/modules/workflows/recorder/recorder-service'
import { analyzeScenarioVariables } from '@/modules/workflows/recorder/heuristics'
import type { WorkflowInput } from '@/modules/workflows/types'
import { cn } from '@/utils'

export interface ScenarioReviewModalProps {
  isOpen: boolean
  scenario: Scenario
  onClose: () => void
  onConvertToWorkflow: (
    workflowInput: WorkflowInput,
    updatedScenario: Scenario,
  ) => Promise<void> | void
  onSaveScenario?: (scenario: Scenario) => Promise<void> | void
  onToast?: (message: string, kind?: 'success' | 'warning' | 'error') => void
}

function methodBadgeColor(method: string): string {
  switch (method.toUpperCase()) {
    case 'GET':
      return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
    case 'POST':
      return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
    case 'PUT':
      return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
    case 'PATCH':
      return 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20'
    case 'DELETE':
      return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
    default:
      return 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20'
  }
}

function statusBadgeColor(status?: number): string {
  if (!status) return 'text-slate-400'
  if (status >= 200 && status < 300) return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
  if (status >= 300 && status < 400) return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
  if (status >= 400 && status < 500) return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
  return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
}

export function ScenarioReviewModal({
  isOpen,
  scenario,
  onClose,
  onConvertToWorkflow,
  onToast,
}: ScenarioReviewModalProps) {
  const [name, setName] = useState(scenario.name || 'Recorded Scenario')
  const [steps, setSteps] = useState<RecordedStep[]>(scenario.steps || [])
  const [bindings, setBindings] = useState<SuggestedVariableBinding[]>(
    scenario.suggestedVariables || [],
  )
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null)
  const [isConverting, setIsConverting] = useState(false)

  // Re-run heuristics if steps are reordered or removed
  const recomputeBindings = useCallback((currentSteps: RecordedStep[]) => {
    const updated = analyzeScenarioVariables(currentSteps)
    setBindings(updated)
  }, [])

  const handleMoveUp = (index: number) => {
    if (index <= 0) return
    const next = [...steps]
    const temp = next[index - 1]!
    next[index - 1] = next[index]!
    next[index] = temp
    // Re-index order
    const ordered = next.map((s, idx) => ({ ...s, order: idx + 1 }))
    setSteps(ordered)
    recomputeBindings(ordered)
  }

  const handleMoveDown = (index: number) => {
    if (index >= steps.length - 1) return
    const next = [...steps]
    const temp = next[index + 1]!
    next[index + 1] = next[index]!
    next[index] = temp
    const ordered = next.map((s, idx) => ({ ...s, order: idx + 1 }))
    setSteps(ordered)
    recomputeBindings(ordered)
  }

  const handleDeleteStep = (index: number) => {
    const next = steps.filter((_, idx) => idx !== index)
    const ordered = next.map((s, idx) => ({ ...s, order: idx + 1 }))
    setSteps(ordered)
    recomputeBindings(ordered)
  }

  const handleToggleBinding = (id: string) => {
    setBindings((prev) =>
      prev.map((b) => (b.id === id ? { ...b, enabled: !b.enabled } : b)),
    )
  }

  const handleConvert = async () => {
    if (steps.length === 0) {
      onToast?.('Cannot create workflow with 0 steps', 'warning')
      return
    }

    setIsConverting(true)
    try {
      const recorder = new ScenarioRecorderService({ projectId: scenario.projectId })
      const updatedScenario: Scenario = {
        ...scenario,
        name: name.trim() || 'Recorded Workflow',
        steps,
        suggestedVariables: bindings,
        updatedAt: Date.now(),
      }

      const workflowInput = recorder.convertToWorkflow(updatedScenario, bindings)
      await onConvertToWorkflow(workflowInput, updatedScenario)
      onToast?.(`Converted "${updatedScenario.name}" into a workflow!`, 'success')
      onClose()
    } catch (err: unknown) {
      onToast?.(
        `Failed to convert workflow: ${err instanceof Error ? err.message : String(err)}`,
        'error',
      )
    } finally {
      setIsConverting(false)
    }
  }

  const enabledBindingsCount = useMemo(
    () => bindings.filter((b) => b.enabled).length,
    [bindings],
  )

  if (!isOpen) return null

  return (
    <Dialog
      size="xl"
      title={
        <div className="flex items-center gap-2">
          <WorkflowIcon className="h-5 w-5 text-indigo-500" />
          <span>Review Recorded Scenario</span>
        </div>
      }
      onClose={onClose}
    >
      <div className="space-y-4 text-sm text-slate-700 dark:text-slate-300">
        {/* Scenario metadata */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 bg-slate-50 dark:bg-slate-900/60 rounded-lg border border-slate-200 dark:border-slate-800">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
              Scenario Name
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. User Signup & Order Flow"
              className="w-full text-sm font-medium"
            />
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto text-xs text-slate-500 dark:text-slate-400 pt-2 sm:pt-0">
            <span className="px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-semibold border border-indigo-200 dark:border-indigo-800">
              {steps.length} {steps.length === 1 ? 'step' : 'steps'} captured
            </span>
          </div>
        </div>

        {/* Dynamic Variable Detection Callout Banner */}
        {bindings.length > 0 && (
          <div className="p-3 bg-indigo-50/70 dark:bg-indigo-950/40 rounded-lg border border-indigo-200 dark:border-indigo-800/60 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-semibold text-indigo-900 dark:text-indigo-200 text-xs">
                <ZapIcon className="h-4 w-4 text-indigo-500" />
                <span>
                  Dynamic Value Detection ({enabledBindingsCount} of {bindings.length} active)
                </span>
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Check to auto-replace literals with variables
              </div>
            </div>

            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
              {bindings.map((b) => (
                <label
                  key={b.id}
                  className="flex items-center gap-2 p-1.5 rounded bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-900/40 text-xs cursor-pointer hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={b.enabled}
                    onChange={() => handleToggleBinding(b.id)}
                    className="rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div className="flex-1 flex items-center justify-between gap-2 overflow-hidden">
                    <div className="truncate">
                      <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                        {`{{${b.variableName}}}`}
                      </span>{' '}
                      <span className="text-slate-400">←</span>{' '}
                      <span className="text-slate-500 dark:text-slate-400">
                        Step {b.extractedFromStepIndex + 1} ({b.sourceJsonPath})
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 whitespace-nowrap">
                      Replaces in Step {b.targetStepIndex + 1} ({b.targetLocation}
                      {b.targetKey ? ` "${b.targetKey}"` : ''})
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Chronological steps list */}
        <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
          {steps.map((step, idx) => {
            const isExpanded = expandedStepId === step.id
            const status = step.response?.status
            const duration = step.response?.durationMs

            return (
              <div
                key={step.id}
                className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden bg-white dark:bg-slate-900 shadow-sm"
              >
                <div className="flex items-center justify-between p-2.5 gap-2 bg-slate-50/50 dark:bg-slate-900/80">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-xs font-mono font-bold text-slate-400 w-5">
                      #{idx + 1}
                    </span>
                    <span
                      className={cn(
                        'px-2 py-0.5 text-[11px] font-bold rounded border uppercase font-mono tracking-wider',
                        methodBadgeColor(step.method),
                      )}
                    >
                      {step.method}
                    </span>
                    <span className="font-mono text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                      {step.endpoint}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {status && (
                      <span
                        className={cn(
                          'px-2 py-0.5 text-[11px] font-bold rounded border font-mono',
                          statusBadgeColor(status),
                        )}
                      >
                        {status}
                      </span>
                    )}

                    {duration != null && (
                      <span className="text-[11px] text-slate-400 flex items-center gap-0.5">
                        <ClockIcon className="h-3 w-3" />
                        {duration}ms
                      </span>
                    )}

                    <div className="flex items-center gap-0.5 pl-1 border-l border-slate-200 dark:border-slate-800">
                      <IconButton
                        label="Move step up"
                        disabled={idx === 0}
                        onClick={() => handleMoveUp(idx)}
                        className="h-6 w-6"
                      >
                        <ArrowUpIcon className="h-3.5 w-3.5" />
                      </IconButton>
                      <IconButton
                        label="Move step down"
                        disabled={idx === steps.length - 1}
                        onClick={() => handleMoveDown(idx)}
                        className="h-6 w-6"
                      >
                        <ArrowDownIcon className="h-3.5 w-3.5" />
                      </IconButton>
                      <IconButton
                        label="Remove step"
                        onClick={() => handleDeleteStep(idx)}
                        className="h-6 w-6"
                      >
                        <DeleteIcon className="h-3.5 w-3.5 text-rose-500" />
                      </IconButton>
                      <IconButton
                        label="Toggle step details"
                        onClick={() =>
                          setExpandedStepId(isExpanded ? null : step.id)
                        }
                        className="h-6 w-6 ml-1"
                      >
                        {isExpanded ? (
                          <ChevronDownIcon className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRightIcon className="h-3.5 w-3.5" />
                        )}
                      </IconButton>
                    </div>
                  </div>
                </div>

                {/* Collapsible detail drawer */}
                {isExpanded && (
                  <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-950/40 text-xs space-y-2">
                    {step.pathParams && Object.keys(step.pathParams).length > 0 && (
                      <div>
                        <span className="font-semibold text-slate-500">Path Parameters:</span>
                        <pre className="font-mono text-[11px] mt-0.5 p-1.5 rounded bg-slate-100 dark:bg-slate-800/80 overflow-x-auto">
                          {JSON.stringify(step.pathParams, null, 2)}
                        </pre>
                      </div>
                    )}

                    {step.queryParams && Object.keys(step.queryParams).length > 0 && (
                      <div>
                        <span className="font-semibold text-slate-500">Query Parameters:</span>
                        <pre className="font-mono text-[11px] mt-0.5 p-1.5 rounded bg-slate-100 dark:bg-slate-800/80 overflow-x-auto">
                          {JSON.stringify(step.queryParams, null, 2)}
                        </pre>
                      </div>
                    )}

                    {step.body && (
                      <div>
                        <span className="font-semibold text-slate-500">Request Body:</span>
                        <pre className="font-mono text-[11px] mt-0.5 p-1.5 rounded bg-slate-100 dark:bg-slate-800/80 max-h-28 overflow-y-auto">
                          {step.body}
                        </pre>
                      </div>
                    )}

                    {step.response?.body && (
                      <div>
                        <span className="font-semibold text-slate-500">Response Body (sample):</span>
                        <pre className="font-mono text-[11px] mt-0.5 p-1.5 rounded bg-slate-100 dark:bg-slate-800/80 max-h-28 overflow-y-auto text-slate-600 dark:text-slate-400">
                          {step.response.body.slice(0, 1000)}
                          {step.response.body.length > 1000 ? '… [truncated]' : ''}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {steps.length === 0 && (
            <div className="text-center py-8 text-slate-400 text-xs">
              No steps remaining in this scenario.
            </div>
          )}
        </div>

        {/* Modal actions footer */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800">
          <Button variant="ghost" onClick={onClose} disabled={isConverting}>
            Discard
          </Button>

          <Button
            variant="primary"
            onClick={handleConvert}
            disabled={steps.length === 0 || isConverting}
            className="flex items-center gap-1.5"
          >
            <WorkflowIcon className="h-4 w-4" />
            <span>{isConverting ? 'Converting...' : 'Convert to Workflow'}</span>
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

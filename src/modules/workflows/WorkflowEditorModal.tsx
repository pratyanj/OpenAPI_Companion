import { useState, useEffect } from 'react'
import {
  Dialog,
  Button,
  Input,
  VariableTextarea,
  ArrowUpIcon,
  ArrowDownIcon,
  DeleteIcon,
  PlusIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from '@/components'
import { EndpointPicker, MethodTag } from '@/modules/request/EndpointPicker'
import type { EndpointInfo } from '@/adapters'
import type { Workflow, WorkflowInput, WorkflowStep, WorkflowFailureMode } from './types'

export interface WorkflowEditorModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (input: WorkflowInput) => Promise<void>
  workflow?: Workflow | null
  endpoints: EndpointInfo[]
  variables?: Record<string, string>
}

export function WorkflowEditorModal({
  isOpen,
  onClose,
  onSave,
  workflow,
  endpoints,
  variables = {},
}: WorkflowEditorModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [mode, setMode] = useState<WorkflowFailureMode>('stop-on-failure')
  const [steps, setSteps] = useState<WorkflowStep[]>([])
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (workflow) {
      setName(workflow.name)
      setDescription(workflow.description ?? '')
      setMode(workflow.mode ?? 'stop-on-failure')
      setSteps(
        workflow.steps.map((s) => ({
          ...s,
          pathParams: s.pathParams ? { ...s.pathParams } : {},
          queryParams: s.queryParams ? { ...s.queryParams } : {},
          headerParams: s.headerParams ? { ...s.headerParams } : {},
        })),
      )
    } else {
      setName('')
      setDescription('')
      setMode('stop-on-failure')
      setSteps([])
    }
    setExpandedSteps({})
    setError(null)
  }, [workflow, isOpen])

  const handleAddStep = () => {
    const defaultEndpoint = endpoints[0]?.endpointId || 'get /'
    const newStep: WorkflowStep = {
      id: `step_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      endpointId: defaultEndpoint,
      name: '',
      body: '',
      delayMs: 0,
      pathParams: {},
      queryParams: {},
      headerParams: {},
    }
    setSteps((prev) => [...prev, newStep])
    setExpandedSteps((prev) => ({ ...prev, [newStep.id]: true }))
  }

  const handleRemoveStep = (id: string) => {
    setSteps((prev) => prev.filter((s) => s.id !== id))
  }

  const handleMoveUp = (index: number) => {
    if (index <= 0) return
    setSteps((prev) => {
      const next = [...prev]
      const temp = next[index - 1]!
      next[index - 1] = next[index]!
      next[index] = temp
      return next
    })
  }

  const handleMoveDown = (index: number) => {
    if (index >= steps.length - 1) return
    setSteps((prev) => {
      const next = [...prev]
      const temp = next[index + 1]!
      next[index + 1] = next[index]!
      next[index] = temp
      return next
    })
  }

  const handleStepChange = (id: string, patch: Partial<WorkflowStep>) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  const toggleExpand = (id: string) => {
    setExpandedSteps((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('Workflow name is required')
      return
    }

    if (steps.length === 0) {
      setError('Add at least one step to the workflow')
      return
    }

    setError(null)
    setSaving(true)
    try {
      await onSave({
        name: trimmedName,
        description: description.trim() || undefined,
        mode,
        steps,
      })
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save workflow')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <Dialog title={workflow ? 'Edit Workflow' : 'Create New Workflow'} onClose={onClose} size="xl">
      <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto pr-1 space-y-4 text-sm">
          {error && (
            <div className="rounded border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-text mb-1">
                Workflow Name <span className="text-danger">*</span>
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Smoke Test User Flow"
                className="w-full"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text mb-1">
                Description (optional)
              </label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief summary of what this scenario tests..."
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text mb-1.5">Failure Mode</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMode('stop-on-failure')}
                  className={`flex flex-col text-left p-2.5 rounded border transition-colors ${
                    mode === 'stop-on-failure'
                      ? 'border-primary bg-primary/10 text-text'
                      : 'border-border bg-surface text-muted hover:border-border-strong hover:text-text'
                  }`}
                >
                  <span className="font-semibold text-xs">Stop on failure</span>
                  <span className="text-[11px] text-muted mt-0.5">
                    Halt scenario immediately if any step returns an error (4xx/5xx).
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setMode('continue-on-failure')}
                  className={`flex flex-col text-left p-2.5 rounded border transition-colors ${
                    mode === 'continue-on-failure'
                      ? 'border-primary bg-primary/10 text-text'
                      : 'border-border bg-surface text-muted hover:border-border-strong hover:text-text'
                  }`}
                >
                  <span className="font-semibold text-xs">Continue on failure</span>
                  <span className="text-[11px] text-muted mt-0.5">
                    Execute all steps regardless of intermediate errors.
                  </span>
                </button>
              </div>
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-text uppercase tracking-wider">
                Steps ({steps.length})
              </span>
              <Button
                type="button"
                variant="secondary"
                onClick={handleAddStep}
                className="text-xs flex items-center gap-1 py-1"
              >
                <PlusIcon className="h-3 w-3" />
                Add Step
              </Button>
            </div>

            {steps.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-6 text-center text-muted text-xs">
                No steps added yet. Click &quot;Add Step&quot; to build your sequence.
              </div>
            ) : (
              <div className="space-y-2.5">
                {steps.map((step, idx) => {
                  const isExpanded = expandedSteps[step.id] ?? false
                  const [method] = step.endpointId.split(' ')

                  return (
                    <div
                      key={step.id}
                      className="rounded-lg border border-border bg-surface/70 hover:border-border-strong transition-colors p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => toggleExpand(step.id)}
                            className="p-1 hover:bg-surface-hover rounded text-muted hover:text-text"
                            aria-label={isExpanded ? 'Collapse step' : 'Expand step'}
                          >
                            {isExpanded ? (
                              <ChevronDownIcon className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronRightIcon className="h-3.5 w-3.5" />
                            )}
                          </button>

                          <span className="font-mono text-xs font-bold text-muted w-5">
                            #{idx + 1}
                          </span>

                          <MethodTag method={method || 'GET'} />

                          <span className="text-xs font-medium text-text truncate">
                            {step.name || step.endpointId}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => handleMoveUp(idx)}
                            className="p-1 text-muted hover:text-text disabled:opacity-30 disabled:pointer-events-none rounded hover:bg-surface-hover"
                            title="Move up"
                          >
                            <ArrowUpIcon className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === steps.length - 1}
                            onClick={() => handleMoveDown(idx)}
                            className="p-1 text-muted hover:text-text disabled:opacity-30 disabled:pointer-events-none rounded hover:bg-surface-hover"
                            title="Move down"
                          >
                            <ArrowDownIcon className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveStep(step.id)}
                            className="p-1 text-danger/80 hover:text-danger rounded hover:bg-danger/10 ml-1"
                            title="Remove step"
                          >
                            <DeleteIcon className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t border-border/60 space-y-3 pl-6">
                          <div>
                            <label className="block text-[11px] font-medium text-muted mb-1">
                              Step Label (optional)
                            </label>
                            <Input
                              value={step.name ?? ''}
                              onChange={(e) => handleStepChange(step.id, { name: e.target.value })}
                              placeholder="e.g. Login with Admin Account"
                              className="w-full text-xs"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-medium text-muted mb-1">
                              Target Endpoint
                            </label>
                            <EndpointPicker
                              endpoints={endpoints}
                              selectedEndpointId={step.endpointId}
                              onSelect={(ep) => handleStepChange(step.id, { endpointId: ep })}
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[11px] font-medium text-muted mb-1">
                                Pre-Execution Delay (ms)
                              </label>
                              <Input
                                type="number"
                                min="0"
                                step="100"
                                value={String(step.delayMs ?? 0)}
                                onChange={(e) =>
                                  handleStepChange(step.id, {
                                    delayMs: Math.max(0, parseInt(e.target.value, 10) || 0),
                                  })
                                }
                                className="w-full text-xs"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-[11px] font-medium text-muted mb-1">
                              Request Body Payload (JSON or text, supports
                              &#123;&#123;VARIABLE&#125;&#125;)
                            </label>
                            <VariableTextarea
                              value={step.body ?? ''}
                              onChange={(e) => handleStepChange(step.id, { body: e.target.value })}
                              projectVariables={variables}
                              placeholder='{"query": "value", "token": "{{TOKEN}}"}'
                              rows={3}
                              className="font-mono text-xs w-full"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border pt-3 mt-4">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Saving...' : workflow ? 'Update Workflow' : 'Create Workflow'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

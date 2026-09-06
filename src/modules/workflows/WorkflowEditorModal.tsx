import { useState, useEffect, useMemo } from 'react'
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
  ZapIcon,
} from '@/components'
import { EndpointPicker, MethodTag } from '@/modules/request/EndpointPicker'
import { extractPathParams, formatJsonSafe } from '@/modules/request/json-utils'
import type { EndpointInfo } from '@/adapters'
import type { RequestTemplate } from '@/modules/request/types'
import type { Workflow, WorkflowInput, WorkflowStep, WorkflowFailureMode } from './types'

export interface WorkflowEditorModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (input: WorkflowInput) => Promise<void>
  workflow?: Workflow | null
  endpoints: EndpointInfo[]
  variables?: Record<string, string>
  templates?: RequestTemplate[]
}

type StepTab = 'body' | 'query' | 'path' | 'headers'

interface StepParametersEditorProps {
  step: WorkflowStep
  onChange: (patch: Partial<WorkflowStep>) => void
  endpoints: EndpointInfo[]
  variables?: Record<string, string>
  templates?: RequestTemplate[]
}

function StepParametersEditor({
  step,
  onChange,
  variables = {},
  templates = [],
}: StepParametersEditorProps) {
  const [method] = (step.endpointId || '').split(' ')
  const isBodyMethod = ['post', 'put', 'patch', 'delete'].includes((method || '').toLowerCase())

  const [activeTab, setActiveTab] = useState<StepTab>(isBodyMethod ? 'body' : 'query')

  // Available matching templates for this step's endpoint
  const matchingPresets = useMemo(() => {
    return templates.filter((t) => t.endpointId.toLowerCase() === step.endpointId.toLowerCase())
  }, [templates, step.endpointId])

  // Extract detected path tokens (e.g. /users/{userId} -> ["userId"])
  const detectedTokens = useMemo(() => extractPathParams(step.endpointId), [step.endpointId])

  // Query parameters array
  const queryEntries = Object.entries(step.queryParams ?? {})
  const headerEntries = Object.entries(step.headerParams ?? {})

  // Merged path parameters: detected tokens + any custom keys
  const pathParamsMap = step.pathParams ?? {}
  const allPathKeys = Array.from(new Set([...detectedTokens, ...Object.keys(pathParamsMap)]))

  const handleSelectPreset = (templateId: string) => {
    const found = matchingPresets.find((t) => t.templateId === templateId)
    if (!found) return
    onChange({
      templateId: found.templateId,
      name: step.name || found.name,
      body: found.body ? formatJsonSafe(found.body).formatted : '',
      queryParams: found.query ? { ...found.query } : {},
      pathParams: found.path ? { ...found.path } : {},
      headerParams: found.headers ? { ...found.headers } : {},
    })
  }

  const handleAddQueryParam = () => {
    const nextKey = `param_${queryEntries.length + 1}`
    onChange({
      queryParams: { ...(step.queryParams ?? {}), [nextKey]: '' },
    })
  }

  const handleUpdateQueryParam = (oldKey: string, newKey: string, val: string) => {
    const current = { ...(step.queryParams ?? {}) }
    if (oldKey !== newKey) {
      delete current[oldKey]
    }
    current[newKey] = val
    onChange({ queryParams: current })
  }

  const handleRemoveQueryParam = (keyToRemove: string) => {
    const current = { ...(step.queryParams ?? {}) }
    delete current[keyToRemove]
    onChange({ queryParams: current })
  }

  const handleAddHeader = () => {
    const nextKey = `Header-${headerEntries.length + 1}`
    onChange({
      headerParams: { ...(step.headerParams ?? {}), [nextKey]: '' },
    })
  }

  const handleUpdateHeader = (oldKey: string, newKey: string, val: string) => {
    const current = { ...(step.headerParams ?? {}) }
    if (oldKey !== newKey) {
      delete current[oldKey]
    }
    current[newKey] = val
    onChange({ headerParams: current })
  }

  const handleRemoveHeader = (keyToRemove: string) => {
    const current = { ...(step.headerParams ?? {}) }
    delete current[keyToRemove]
    onChange({ headerParams: current })
  }

  const handleUpdatePathParam = (key: string, val: string) => {
    onChange({
      pathParams: { ...(step.pathParams ?? {}), [key]: val },
    })
  }

  const handleRemoveCustomPathParam = (keyToRemove: string) => {
    const current = { ...(step.pathParams ?? {}) }
    delete current[keyToRemove]
    onChange({ pathParams: current })
  }

  const handleAddCustomPathParam = () => {
    const nextKey = `param_${allPathKeys.length + 1}`
    onChange({
      pathParams: { ...(step.pathParams ?? {}), [nextKey]: '' },
    })
  }

  return (
    <div className="mt-3 pt-3 border-t border-border/70 space-y-3">
      {/* 1-Click Load from Saved Preset */}
      {matchingPresets.length > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 p-2.5 text-xs">
          <span className="flex items-center gap-1 font-semibold text-primary shrink-0">
            <ZapIcon className="h-3.5 w-3.5 text-primary" />
            Quick Load Saved Preset:
          </span>
          <select
            value={step.templateId ?? ''}
            onChange={(e) => handleSelectPreset(e.target.value)}
            className="flex-1 rounded border border-border bg-surface px-2.5 py-1 text-xs text-text focus:border-primary focus:outline-none"
          >
            <option value="">-- Select a preset to auto-fill body &amp; parameters --</option>
            {matchingPresets.map((t) => (
              <option key={t.templateId} value={t.templateId}>
                {t.name} ({t.method.toUpperCase()} {t.endpointId})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Sub-Tabs: Body, Query Params, Path Params, Headers */}
      <div className="flex items-center border-b border-border text-xs gap-1">
        <button
          type="button"
          onClick={() => setActiveTab('body')}
          className={`px-3 py-1.5 font-medium border-b-2 transition-colors flex items-center gap-1 ${
            activeTab === 'body'
              ? 'border-primary text-primary font-semibold'
              : 'border-transparent text-muted hover:text-text'
          }`}
        >
          <span>Request Body</span>
          {step.body?.trim() && <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('query')}
          className={`px-3 py-1.5 font-medium border-b-2 transition-colors flex items-center gap-1 ${
            activeTab === 'query'
              ? 'border-primary text-primary font-semibold'
              : 'border-transparent text-muted hover:text-text'
          }`}
        >
          <span>Query Params</span>
          {queryEntries.length > 0 && (
            <span className="rounded-full bg-surface px-1.5 py-0.5 text-[10px] text-text font-mono">
              {queryEntries.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('path')}
          className={`px-3 py-1.5 font-medium border-b-2 transition-colors flex items-center gap-1 ${
            activeTab === 'path'
              ? 'border-primary text-primary font-semibold'
              : 'border-transparent text-muted hover:text-text'
          }`}
        >
          <span>Path Params</span>
          {allPathKeys.length > 0 && (
            <span className="rounded-full bg-surface px-1.5 py-0.5 text-[10px] text-text font-mono">
              {allPathKeys.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('headers')}
          className={`px-3 py-1.5 font-medium border-b-2 transition-colors flex items-center gap-1 ${
            activeTab === 'headers'
              ? 'border-primary text-primary font-semibold'
              : 'border-transparent text-muted hover:text-text'
          }`}
        >
          <span>Headers</span>
          {headerEntries.length > 0 && (
            <span className="rounded-full bg-surface px-1.5 py-0.5 text-[10px] text-text font-mono">
              {headerEntries.length}
            </span>
          )}
        </button>
      </div>

      {/* Tab Content: Request Body */}
      {activeTab === 'body' && (
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-semibold text-text flex items-center gap-1.5">
              <span>JSON or Raw Text Payload</span>
              <span className="text-muted font-normal">
                (Type <code className="text-primary font-mono">&#123;&#123;</code> for variable suggestions)
              </span>
            </label>
            {step.body?.trim() && (
              <button
                type="button"
                onClick={() => {
                  const { formatted } = formatJsonSafe(step.body)
                  onChange({ body: formatted })
                }}
                className="text-[11px] text-primary hover:underline"
              >
                Beautify JSON
              </button>
            )}
          </div>

          {/* Authentication & Post Tip */}
          {isBodyMethod && (
            <div className="rounded border border-primary/20 bg-primary/5 p-2 text-[11px] text-muted leading-relaxed">
              <strong className="text-text font-semibold">💡 Authentication Tip:</strong> For login
              endpoints, enter your credentials in JSON format (e.g.{' '}
              <code className="text-primary font-mono">&#123;&quot;username&quot;: &quot;admin&quot;, &quot;password&quot;: &quot;secret&quot;&#125;</code>
              ) or inject variables (e.g.{' '}
              <code className="text-primary font-mono">&#123;&quot;token&quot;: &quot;&#123;&#123;AUTH_TOKEN&#125;&#125;&quot;&#125;</code>
              ).
            </div>
          )}

          <VariableTextarea
            value={step.body ?? ''}
            onChange={(e) => onChange({ body: e.target.value })}
            projectVariables={variables}
            placeholder={'{\n  "email": "user@example.com",\n  "password": "your-password"\n}'}
            rows={5}
            className="font-mono text-xs w-full bg-surface"
          />
        </div>
      )}

      {/* Tab Content: Query Params */}
      {activeTab === 'query' && (
        <div className="space-y-2.5 pt-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-text">
              URL Query Parameters (e.g. ?page=1&amp;limit=10)
            </span>
            <Button
              type="button"
              variant="secondary"
              onClick={handleAddQueryParam}
              className="py-0.5 px-2 text-[11px] flex items-center gap-1"
            >
              <PlusIcon className="h-3 w-3" />
              Add Query Param
            </Button>
          </div>

          {queryEntries.length === 0 ? (
            <div className="rounded border border-dashed border-border p-4 text-center text-muted text-xs">
              No query parameters configured. Click &quot;Add Query Param&quot; if this endpoint
              requires URL query strings.
            </div>
          ) : (
            <div className="space-y-2">
              {queryEntries.map(([key, val], idx) => (
                <div key={`q_${idx}`} className="flex items-center gap-2">
                  <Input
                    value={key}
                    onChange={(e) => handleUpdateQueryParam(key, e.target.value, val)}
                    placeholder="Parameter name"
                    className="w-1/3 text-xs"
                  />
                  <Input
                    value={val}
                    onChange={(e) => handleUpdateQueryParam(key, key, e.target.value)}
                    placeholder="Value (supports {{VAR}})"
                    className="flex-1 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveQueryParam(key)}
                    className="p-1 text-danger/70 hover:text-danger rounded hover:bg-danger/10"
                    title="Remove parameter"
                  >
                    <DeleteIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab Content: Path Params */}
      {activeTab === 'path' && (
        <div className="space-y-2.5 pt-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-text">
              URL Path Parameters (replaces &#123;param&#125; in the URL)
            </span>
            <Button
              type="button"
              variant="secondary"
              onClick={handleAddCustomPathParam}
              className="py-0.5 px-2 text-[11px] flex items-center gap-1"
            >
              <PlusIcon className="h-3 w-3" />
              Add Path Param
            </Button>
          </div>

          {allPathKeys.length === 0 ? (
            <div className="rounded border border-dashed border-border p-4 text-center text-muted text-xs">
              No path parameters detected in this endpoint URL (e.g. /users/&#123;id&#125;).
            </div>
          ) : (
            <div className="space-y-2">
              {allPathKeys.map((key) => {
                const isDetected = detectedTokens.includes(key)
                const val = pathParamsMap[key] ?? ''
                return (
                  <div key={key} className="flex items-center gap-2">
                    <div className="w-1/3 flex items-center gap-1 bg-surface border border-border rounded px-2 py-1 text-xs font-mono text-text">
                      <span className="truncate">{key}</span>
                      {isDetected && (
                        <span className="text-[9px] text-primary px-1 rounded bg-primary/10 ml-auto shrink-0">
                          URL token
                        </span>
                      )}
                    </div>
                    <Input
                      value={val}
                      onChange={(e) => handleUpdatePathParam(key, e.target.value)}
                      placeholder={`Value for {${key}} (e.g. {{USER_ID}})`}
                      className="flex-1 text-xs font-mono"
                    />
                    {!isDetected && (
                      <button
                        type="button"
                        onClick={() => handleRemoveCustomPathParam(key)}
                        className="p-1 text-danger/70 hover:text-danger rounded hover:bg-danger/10"
                        title="Remove custom path parameter"
                      >
                        <DeleteIcon className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab Content: Headers */}
      {activeTab === 'headers' && (
        <div className="space-y-2.5 pt-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-text">
              Custom Step Headers (e.g. Authorization: Bearer &#123;&#123;TOKEN&#125;&#125;)
            </span>
            <Button
              type="button"
              variant="secondary"
              onClick={handleAddHeader}
              className="py-0.5 px-2 text-[11px] flex items-center gap-1"
            >
              <PlusIcon className="h-3 w-3" />
              Add Header
            </Button>
          </div>

          {headerEntries.length === 0 ? (
            <div className="rounded border border-dashed border-border p-4 text-center text-muted text-xs">
              No custom headers added. Standard Swagger UI headers will be sent by default.
            </div>
          ) : (
            <div className="space-y-2">
              {headerEntries.map(([key, val], idx) => (
                <div key={`h_${idx}`} className="flex items-center gap-2">
                  <Input
                    value={key}
                    onChange={(e) => handleUpdateHeader(key, e.target.value, val)}
                    placeholder="Header name (e.g. Authorization)"
                    className="w-1/3 text-xs"
                  />
                  <Input
                    value={val}
                    onChange={(e) => handleUpdateHeader(key, key, e.target.value)}
                    placeholder="Header value (supports {{TOKEN}})"
                    className="flex-1 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveHeader(key)}
                    className="p-1 text-danger/70 hover:text-danger rounded hover:bg-danger/10"
                    title="Remove header"
                  >
                    <DeleteIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function WorkflowEditorModal({
  isOpen,
  onClose,
  onSave,
  workflow,
  endpoints,
  variables = {},
  templates = [],
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
      const initialSteps = workflow.steps.map((s) => ({
        ...s,
        pathParams: s.pathParams ? { ...s.pathParams } : {},
        queryParams: s.queryParams ? { ...s.queryParams } : {},
        headerParams: s.headerParams ? { ...s.headerParams } : {},
      }))
      setSteps(initialSteps)
      // Auto-expand all steps when opened for editing
      const expanded: Record<string, boolean> = {}
      for (const s of initialSteps) {
        expanded[s.id] = true
      }
      setExpandedSteps(expanded)
    } else {
      setName('')
      setDescription('')
      setMode('stop-on-failure')
      setSteps([])
      setExpandedSteps({})
    }
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
        <div className="flex-1 overflow-y-auto pr-1 space-y-4 text-sm max-h-[72vh]">
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
              <div className="space-y-3">
                {steps.map((step, idx) => {
                  const isExpanded = expandedSteps[step.id] ?? true
                  const [method] = step.endpointId.split(' ')

                  return (
                    <div
                      key={step.id}
                      className="rounded-lg border border-border bg-surface/70 hover:border-border-strong transition-colors p-3.5"
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
                        <div className="mt-3 pt-3 border-t border-border/60 space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                              Target Endpoint
                            </label>
                            <EndpointPicker
                              endpoints={endpoints}
                              selectedEndpointId={step.endpointId}
                              onSelect={(ep) => handleStepChange(step.id, { endpointId: ep })}
                            />
                          </div>

                          {/* Full Parameter & Body Tabs Editor */}
                          <StepParametersEditor
                            step={step}
                            onChange={(patch) => handleStepChange(step.id, patch)}
                            endpoints={endpoints}
                            variables={variables}
                            templates={templates}
                          />
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

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Button,
  Badge,
  Input,
  EmptyState,
  WorkflowIcon,
  RunIcon,
  PlayIcon,
  CalendarIcon,
  PinIcon,
  EditIcon,
  DeleteIcon,
  CopyIcon,
  PlusIcon,
  SearchIcon,
  ClockIcon,
  ToastSuccessIcon,
  ToastErrorIcon,
} from '@/components'
import { useEventBus } from '@/hooks'
import type { EventBus } from '@/core/events'
import type { EndpointInfo } from '@/adapters'
import type {
  Workflow,
  WorkflowInput,
  WorkflowsPanelService,
  WorkflowRunSummary,
  WorkflowExecutionOptions,
} from './types'
import { WorkflowEditorModal } from './WorkflowEditorModal'
import { WorkflowRunnerModal } from './WorkflowRunnerModal'
import type { Result } from '@/types'
import type { RequestPanelService, RequestTemplate } from '@/modules/request/types'
import type { EnvironmentPanelService } from '@/modules/environment'

export interface WorkflowsPanelProps {
  service: WorkflowsPanelService
  bus: EventBus
  environmentId?: string
  variables?: Record<string, string>
  endpoints?: EndpointInfo[]
  requestService?: RequestPanelService
  environmentService?: EnvironmentPanelService
  onOpenWorkflowEditor?: (options?: { workflow?: Workflow | null }) => void
  onOpenWorkflowRunner?: (options: { workflow: Workflow; environmentId?: string }) => void
}

function formatTimeAgo(timestamp?: number): string {
  if (!timestamp) return 'Never run'
  const diffMs = Date.now() - timestamp
  if (diffMs < 0) return 'Just now'
  const seconds = Math.floor(diffMs / 1000)
  if (seconds < 60) return 'Just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return '1 day ago'
  if (days < 30) return `${days} days ago`
  const months = Math.floor(days / 30)
  if (months === 1) return '1 month ago'
  if (months < 12) return `${months} months ago`
  const years = Math.floor(days / 365)
  return `${years}y ago`
}

export function WorkflowsPanel({
  service,
  bus,
  environmentId,
  variables = {},
  endpoints: propEndpoints,
  requestService,
  environmentService,
  onOpenWorkflowEditor,
  onOpenWorkflowRunner,
}: WorkflowsPanelProps) {
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Presets and active variables
  const [templates, setTemplates] = useState<RequestTemplate[]>([])
  const [activeVars, setActiveVars] = useState<Record<string, string>>(variables)

  useEffect(() => {
    setActiveVars(variables)
  }, [variables])

  useEffect(() => {
    if (!environmentService) return
    let active = true
    void (async () => {
      try {
        const activeId = environmentId || (await environmentService.getActiveId())
        const envsRes = await environmentService.list()
        if (envsRes.ok && active) {
          const found = envsRes.value.find((e) => e.id === activeId) ?? envsRes.value[0]
          if (found) {
            setActiveVars(found.variables)
          }
        }
      } catch {
        // ignore load errors
      }
    })()
    return () => {
      active = false
    }
  }, [environmentService, environmentId])

  useEffect(() => {
    if (!requestService) return
    let active = true
    void requestService.listTemplates().then((res) => {
      if (res.ok && active) {
        setTemplates(res.value)
      }
    })
    return () => {
      active = false
    }
  }, [requestService])

  // Modals state
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null)
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [runningWorkflow, setRunningWorkflow] = useState<Workflow | null>(null)
  const [isRunnerOpen, setIsRunnerOpen] = useState(false)

  const availableEndpoints = useMemo(() => {
    if (propEndpoints && propEndpoints.length > 0) return propEndpoints
    return service.listEndpoints?.() ?? []
  }, [propEndpoints, service])

  const refreshWorkflows = useCallback(async () => {
    try {
      const res = await service.list()
      if (res.ok) {
        setWorkflows(res.value)
      } else {
        setError(res.error.message)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load workflows')
    } finally {
      setLoading(false)
    }
  }, [service])

  useEffect(() => {
    void refreshWorkflows()
  }, [refreshWorkflows])

  useEventBus(bus, 'WORKFLOW_SAVED', () => void refreshWorkflows())
  useEventBus(bus, 'WORKFLOW_DELETED', () => void refreshWorkflows())
  useEventBus(bus, 'WORKFLOW_COMPLETED', () => void refreshWorkflows())

  const handleCreate = () => {
    if (onOpenWorkflowEditor) {
      onOpenWorkflowEditor({ workflow: null })
      return
    }
    setEditingWorkflow(null)
    setIsEditorOpen(true)
  }

  const handleEdit = (wf: Workflow) => {
    if (onOpenWorkflowEditor) {
      onOpenWorkflowEditor({ workflow: wf })
      return
    }
    setEditingWorkflow(wf)
    setIsEditorOpen(true)
  }

  const handleSaveWorkflow = async (input: WorkflowInput) => {
    if (editingWorkflow) {
      const res = await service.update(editingWorkflow.id, input)
      if (!res.ok) throw new Error(res.error.message)
    } else {
      const res = await service.create(input)
      if (!res.ok) throw new Error(res.error.message)
    }
    await refreshWorkflows()
  }

  const handleDuplicate = async (id: string) => {
    try {
      const res = await service.duplicate(id)
      if (!res.ok) {
        setError(res.error.message)
      } else {
        await refreshWorkflows()
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to duplicate workflow')
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete workflow "${name}"?`)) return
    try {
      const res = await service.delete(id)
      if (!res.ok) {
        setError(res.error.message)
      } else {
        await refreshWorkflows()
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete workflow')
    }
  }

  const handleRun = async (wf: Workflow) => {
    if (onOpenWorkflowRunner) {
      onOpenWorkflowRunner({ workflow: wf, environmentId })
      return
    }
    try {
      const fresh = await service.get(wf.id)
      setRunningWorkflow(fresh.ok && fresh.value ? fresh.value : wf)
    } catch {
      setRunningWorkflow(wf)
    }
    setIsRunnerOpen(true)
  }

  const handleExecuteRunner = async (
    workflowId: string,
    options?: WorkflowExecutionOptions,
  ): Promise<Result<WorkflowRunSummary>> => {
    return service.execute(workflowId, options)
  }

  const filteredWorkflows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return workflows
    return workflows.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        (w.description && w.description.toLowerCase().includes(q)) ||
        w.steps.some(
          (s) =>
            s.endpointId.toLowerCase().includes(q) || (s.name && s.name.toLowerCase().includes(q)),
        ),
    )
  }, [workflows, searchQuery])

  return (
    <div className="relative flex flex-col h-full overflow-hidden text-text">
      {/* Header with Search & Create Button */}
      <div className="p-3 border-b border-border space-y-2.5 shrink-0 bg-surface/50">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-text flex items-center gap-1.5">
              <WorkflowIcon className="h-4 w-4 text-primary" />
              <span>Workflows</span>
            </h2>
            <p className="text-[11px] text-muted">
              Sequential multi-step scenario automation & chaining
            </p>
          </div>

          <Button
            variant="primary"
            onClick={handleCreate}
            className="flex items-center gap-1 shrink-0 px-2.5 py-1 text-xs"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            <span>New Workflow</span>
          </Button>
        </div>

        {workflows.length > 0 && (
          <div className="relative">
            <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search workflows by name or endpoint..."
              className="w-full pl-8 text-xs h-8"
            />
          </div>
        )}
      </div>

      {/* Error Notice */}
      {error && (
        <div className="m-3 p-2.5 rounded border border-danger/30 bg-danger/10 text-danger text-xs flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-danger hover:underline ml-2 text-[11px]"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {loading ? (
          <div className="py-12 text-center text-xs text-muted">Loading workflows...</div>
        ) : workflows.length === 0 ? (
          <EmptyState
            icon={<WorkflowIcon className="h-8 w-8 text-muted" />}
            title="No Workflows Yet"
            message="Group multiple endpoints into automated scenarios (smoke tests, login chains, data setup). Extracted variables chain seamlessly between steps."
            actionLabel="Create First Workflow"
            onAction={handleCreate}
          />
        ) : filteredWorkflows.length === 0 ? (
          <div className="py-12 text-center text-xs text-muted">
            No workflows matched &quot;{searchQuery}&quot;
          </div>
        ) : (
          filteredWorkflows.map((wf) => {
            const hasRun = wf.lastRunAt != null
            const accentColor =
              wf.lastRunStatus === 'failed'
                ? 'bg-danger'
                : wf.lastRunStatus === 'cancelled'
                  ? 'bg-warning'
                  : 'bg-primary'

            return (
              <div
                key={wf.id}
                className="relative overflow-hidden rounded-xl border border-border bg-surface/60 hover:border-primary/50 transition-all pl-5 pr-4 py-3.5 flex flex-col gap-3 group"
              >
                {/* Left vertical accent bar */}
                <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${accentColor}`} />

                {/* Top row: Title + Description & Run Button */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold text-text truncate group-hover:text-primary transition-colors">
                      {wf.name}
                    </h3>
                    {wf.description && (
                      <p className="text-xs text-muted mt-0.5 line-clamp-1">
                        {wf.description}
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRun(wf)}
                    className="bg-primary hover:opacity-90 active:scale-95 text-white font-semibold rounded-lg px-3.5 py-1.5 flex items-center gap-1.5 text-xs shadow-sm transition-all shrink-0 cursor-pointer"
                  >
                    <PlayIcon className="h-3 w-3 fill-current" />
                    <span>Run</span>
                  </button>
                </div>

                {/* Middle row: Metadata tags / info */}
                <div className="flex flex-wrap items-center gap-3.5 text-xs">
                  {/* Relative time */}
                  <div className="flex items-center gap-1.5 text-muted">
                    <ClockIcon className="h-3.5 w-3.5 text-muted" />
                    <span>{formatTimeAgo(wf.lastRunAt || wf.createdAt)}</span>
                  </div>

                  {/* Execution Mode / Scheduled rule */}
                  <div className="flex items-center gap-1.5 text-warning font-medium">
                    <CalendarIcon className="h-3.5 w-3.5 text-warning" />
                    <span>{wf.mode === 'stop-on-failure' ? 'Stop on fail' : 'Continue on fail'}</span>
                  </div>

                  {/* Steps count */}
                  <div className="flex items-center gap-1.5 text-muted font-medium">
                    <PinIcon className="h-3.5 w-3.5 text-primary" />
                    <span>
                      {wf.steps.length} {wf.steps.length === 1 ? 'step' : 'steps'}
                    </span>
                  </div>

                  {/* Status chip if executed */}
                  {hasRun && wf.lastRunStatus === 'success' && (
                    <div className="flex items-center gap-1 text-[11px] text-success bg-success/15 px-2 py-0.5 rounded-full font-medium">
                      <ToastSuccessIcon className="h-3 w-3 text-success" />
                      <span>Passed ({wf.lastRunDurationMs ?? 0}ms)</span>
                    </div>
                  )}

                  {hasRun && wf.lastRunStatus === 'failed' && (
                    <div className="flex items-center gap-1 text-[11px] text-danger bg-danger/15 px-2 py-0.5 rounded-full font-medium">
                      <ToastErrorIcon className="h-3 w-3 text-danger" />
                      <span>Failed ({wf.lastRunDurationMs ?? 0}ms)</span>
                    </div>
                  )}

                  {hasRun && wf.lastRunStatus === 'cancelled' && (
                    <div className="flex items-center gap-1 text-[11px] text-warning bg-warning/15 px-2 py-0.5 rounded-full font-medium">
                      <ClockIcon className="h-3 w-3 text-warning" />
                      <span>Cancelled</span>
                    </div>
                  )}
                </div>

                {/* Bottom row: Action links aligned to the right */}
                <div className="flex items-center justify-end gap-3.5 pt-0.5 text-xs text-muted">
                  <button
                    type="button"
                    onClick={() => handleEdit(wf)}
                    className="flex items-center gap-1.5 hover:text-text transition-colors cursor-pointer"
                    title="Edit workflow"
                  >
                    <EditIcon className="h-3.5 w-3.5" />
                    <span>Edit</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDuplicate(wf.id)}
                    className="flex items-center gap-1.5 hover:text-text transition-colors cursor-pointer"
                    title="Duplicate workflow"
                  >
                    <CopyIcon className="h-3.5 w-3.5" />
                    <span>Duplicate</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDelete(wf.id, wf.name)}
                    className="flex items-center gap-1.5 hover:text-danger transition-colors cursor-pointer"
                    title="Delete workflow"
                  >
                    <DeleteIcon className="h-3.5 w-3.5" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Editor Modal */}
      {isEditorOpen && (
        <WorkflowEditorModal
          isOpen={isEditorOpen}
          onClose={() => {
            setIsEditorOpen(false)
            setEditingWorkflow(null)
          }}
          onSave={handleSaveWorkflow}
          workflow={editingWorkflow}
          endpoints={availableEndpoints}
          variables={activeVars}
          templates={templates}
          requestService={requestService}
          getSwaggerDefaults={(epId) => requestService?.getSwaggerDefaults?.(epId)}
          getSwaggerDefaultsAsync={(epId) => requestService?.getSwaggerDefaultsAsync?.(epId)}
        />
      )}

      {/* Workflow Runner Dialog Modal in Sidebar */}
      {isRunnerOpen && runningWorkflow && (
        <WorkflowRunnerModal
          isOpen={isRunnerOpen}
          onClose={() => {
            setIsRunnerOpen(false)
            setRunningWorkflow(null)
          }}
          workflow={runningWorkflow}
          onRun={handleExecuteRunner}
          onCancel={() => {
            service.cancelActiveExecution?.()
          }}
          environmentId={environmentId}
          bus={bus}
        />
      )}
    </div>
  )
}

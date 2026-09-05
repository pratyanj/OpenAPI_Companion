import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Button,
  Badge,
  Input,
  EmptyState,
  WorkflowIcon,
  RunIcon,
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

export interface WorkflowsPanelProps {
  service: WorkflowsPanelService
  bus: EventBus
  environmentId?: string
  variables?: Record<string, string>
  endpoints?: EndpointInfo[]
}

export function WorkflowsPanel({
  service,
  bus,
  environmentId,
  variables = {},
  endpoints: propEndpoints,
}: WorkflowsPanelProps) {
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
    setEditingWorkflow(null)
    setIsEditorOpen(true)
  }

  const handleEdit = (wf: Workflow) => {
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

  const handleRun = (wf: Workflow) => {
    setRunningWorkflow(wf)
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
    <div className="flex flex-col h-full overflow-hidden text-text">
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
            return (
              <div
                key={wf.id}
                className="rounded-lg border border-border bg-surface hover:border-border-strong transition-colors p-3.5 flex flex-col justify-between gap-3 group"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-xs font-semibold text-text truncate group-hover:text-primary transition-colors">
                        {wf.name}
                      </h3>
                      {wf.description && (
                        <p className="text-[11px] text-muted mt-0.5 line-clamp-2">
                          {wf.description}
                        </p>
                      )}
                    </div>

                    <Button
                      variant="primary"
                      onClick={() => handleRun(wf)}
                      className="flex items-center gap-1 py-1 px-2.5 text-xs shrink-0"
                    >
                      <RunIcon className="h-3.5 w-3.5" />
                      <span>Run</span>
                    </Button>
                  </div>

                  {/* Metadata tags */}
                  <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                    <Badge kind="neutral">
                      {wf.steps.length} {wf.steps.length === 1 ? 'step' : 'steps'}
                    </Badge>

                    <Badge kind={wf.mode === 'stop-on-failure' ? 'warning' : 'info'}>
                      {wf.mode === 'stop-on-failure' ? 'Stop on fail' : 'Continue on fail'}
                    </Badge>

                    {hasRun && wf.lastRunStatus === 'success' && (
                      <Badge kind="success">
                        <span className="flex items-center gap-1">
                          <ToastSuccessIcon className="h-2.5 w-2.5" />
                          <span>Passed ({wf.lastRunDurationMs ?? 0}ms)</span>
                        </span>
                      </Badge>
                    )}

                    {hasRun && wf.lastRunStatus === 'failed' && (
                      <Badge kind="error">
                        <span className="flex items-center gap-1">
                          <ToastErrorIcon className="h-2.5 w-2.5" />
                          <span>Failed ({wf.lastRunDurationMs ?? 0}ms)</span>
                        </span>
                      </Badge>
                    )}

                    {hasRun && wf.lastRunStatus === 'cancelled' && (
                      <Badge kind="warning">
                        <span className="flex items-center gap-1">
                          <ClockIcon className="h-2.5 w-2.5" />
                          <span>Cancelled</span>
                        </span>
                      </Badge>
                    )}

                    {!hasRun && <Badge kind="neutral">Never run</Badge>}
                  </div>
                </div>

                {/* Footer action buttons */}
                <div className="flex items-center justify-end gap-1.5 border-t border-border/60 pt-2">
                  <button
                    type="button"
                    onClick={() => handleEdit(wf)}
                    className="p-1 text-muted hover:text-text rounded hover:bg-surface-hover transition-colors text-xs flex items-center gap-1 px-2"
                    title="Edit workflow"
                  >
                    <EditIcon className="h-3 w-3" />
                    <span>Edit</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDuplicate(wf.id)}
                    className="p-1 text-muted hover:text-text rounded hover:bg-surface-hover transition-colors text-xs flex items-center gap-1 px-2"
                    title="Duplicate workflow"
                  >
                    <CopyIcon className="h-3 w-3" />
                    <span>Duplicate</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDelete(wf.id, wf.name)}
                    className="p-1 text-danger/80 hover:text-danger rounded hover:bg-danger/10 transition-colors text-xs flex items-center gap-1 px-2"
                    title="Delete workflow"
                  >
                    <DeleteIcon className="h-3 w-3" />
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
          variables={variables}
        />
      )}

      {/* Runner Modal */}
      {isRunnerOpen && runningWorkflow && (
        <WorkflowRunnerModal
          isOpen={isRunnerOpen}
          onClose={() => {
            setIsRunnerOpen(false)
            setRunningWorkflow(null)
          }}
          workflow={runningWorkflow}
          onRun={handleExecuteRunner}
          environmentId={environmentId}
        />
      )}
    </div>
  )
}

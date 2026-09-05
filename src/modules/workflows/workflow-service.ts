import { ok, err, type Result, type AppError } from '@/types'
import { projectKey, type StorageService } from '@/core/storage'
import type { EventBus } from '@/core/events'
import type {
  Workflow,
  WorkflowInput,
  WorkflowStep,
  StepRunResult,
  WorkflowRunSummary,
  WorkflowExecutionOptions,
  StepExecutor,
  StepExecutionPayload,
} from './types'

export interface WorkflowEnvironmentService {
  getActiveId(): Promise<string>
  resolve(text: string, id: string): Promise<Result<{ text: string; missing: string[] }>>
  applyExtraction?: (
    endpointId: string,
    responseBody: string,
  ) => Promise<Result<{ extracted: Array<{ variable: string; value: string }> }>>
}

export interface WorkflowServiceOptions {
  storage: StorageService
  projectId: string
  bus?: EventBus
  environmentService?: WorkflowEnvironmentService
  defaultExecutor?: StepExecutor
  now?: () => number
  delayFn?: (ms: number, signal?: AbortSignal) => Promise<void>
}

const errors = {
  duplicateName: (name: string): AppError => ({
    code: 'WORKFLOW_DUPLICATE_NAME',
    message: `A workflow named "${name}" already exists`,
    recoverable: true,
  }),
  notFound: (id: string): AppError => ({
    code: 'WORKFLOW_NOT_FOUND',
    message: `Workflow "${id}" not found`,
    recoverable: true,
  }),
  invalidInput: (message: string): AppError => ({
    code: 'WORKFLOW_INVALID_INPUT',
    message,
    recoverable: true,
  }),
  writeError: (cause?: unknown): AppError => ({
    code: 'WORKFLOW_WRITE_ERROR',
    message: 'Failed to persist workflows',
    recoverable: true,
    cause,
  }),
}

const defaultDelay = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(new DOMException('Aborted', 'AbortError'))
      },
      { once: true },
    )
  })

export class WorkflowService {
  private readonly storage: StorageService
  private readonly projectId: string
  private readonly bus: EventBus | undefined
  private readonly environmentService: WorkflowEnvironmentService | undefined
  private readonly defaultExecutor: StepExecutor | undefined
  private readonly now: () => number
  private readonly delayFn: (ms: number, signal?: AbortSignal) => Promise<void>

  constructor(options: WorkflowServiceOptions) {
    this.storage = options.storage
    this.projectId = options.projectId
    this.bus = options.bus
    this.environmentService = options.environmentService
    this.defaultExecutor = options.defaultExecutor
    this.now = options.now ?? (() => Date.now())
    this.delayFn = options.delayFn ?? defaultDelay
  }

  private workflowsKey(): string {
    return projectKey(this.projectId, 'workflows')
  }

  /** List all workflows for the current project */
  async list(): Promise<Result<Workflow[]>> {
    const got = await this.storage.getData<Workflow[]>(this.workflowsKey())
    if (!got.ok) {
      if (got.error.code === 'STORAGE_CORRUPT') {
        return ok([])
      }
      return got
    }
    const workflows = (got.value ?? []).map((w) => ({
      ...w,
      steps: w.steps ?? [],
    }))
    workflows.sort((a, b) => b.updatedAt - a.updatedAt)
    return ok(workflows)
  }

  /** Get a single workflow by ID */
  async get(id: string): Promise<Result<Workflow | null>> {
    const all = await this.list()
    if (!all.ok) return all
    const found = all.value.find((w) => w.id === id) ?? null
    return ok(found)
  }

  /** Create a new workflow */
  async create(input: WorkflowInput): Promise<Result<Workflow>> {
    const name = input.name.trim()
    if (!name) {
      return err(errors.invalidInput('Workflow name is required'))
    }

    const current = await this.list()
    if (!current.ok) return current

    if (current.value.some((w) => w.name.toLowerCase() === name.toLowerCase())) {
      return err(errors.duplicateName(name))
    }

    const id = `wf_${this.now()}_${Math.random().toString(36).slice(2, 7)}`
    const steps: WorkflowStep[] = (input.steps ?? []).map((s) => ({
      ...s,
      id: s.id || `step_${this.now()}_${Math.random().toString(36).slice(2, 7)}`,
    }))

    const workflow: Workflow = {
      id,
      name,
      description: input.description?.trim(),
      mode: input.mode ?? 'stop-on-failure',
      steps,
      createdAt: this.now(),
      updatedAt: this.now(),
    }

    const updatedList = [workflow, ...current.value]
    const written = await this.storage.set(this.workflowsKey(), updatedList, { immediate: true })
    if (!written.ok) return written

    this.bus?.publish('WORKFLOW_SAVED', { projectId: this.projectId, workflowId: id })
    return ok(workflow)
  }

  /** Update an existing workflow */
  async update(id: string, patch: Partial<WorkflowInput>): Promise<Result<Workflow>> {
    const current = await this.list()
    if (!current.ok) return current

    const idx = current.value.findIndex((w) => w.id === id)
    if (idx < 0) return err(errors.notFound(id))

    const existing = current.value[idx]!

    if (patch.name !== undefined) {
      const trimmed = patch.name.trim()
      if (!trimmed) {
        return err(errors.invalidInput('Workflow name cannot be empty'))
      }
      const duplicate = current.value.some(
        (w) => w.id !== id && w.name.toLowerCase() === trimmed.toLowerCase(),
      )
      if (duplicate) {
        return err(errors.duplicateName(trimmed))
      }
    }

    const updatedSteps = patch.steps
      ? patch.steps.map((s) => ({
          ...s,
          id: s.id || `step_${this.now()}_${Math.random().toString(36).slice(2, 7)}`,
        }))
      : existing.steps

    const updated: Workflow = {
      ...existing,
      name: patch.name !== undefined ? patch.name.trim() : existing.name,
      description:
        patch.description !== undefined ? patch.description.trim() : existing.description,
      mode: patch.mode ?? existing.mode,
      steps: updatedSteps,
      updatedAt: this.now(),
    }

    const nextList = [...current.value]
    nextList[idx] = updated

    const written = await this.storage.set(this.workflowsKey(), nextList, { immediate: true })
    if (!written.ok) return written

    this.bus?.publish('WORKFLOW_SAVED', { projectId: this.projectId, workflowId: id })
    return ok(updated)
  }

  /** Delete a workflow by ID */
  async delete(id: string): Promise<Result<void>> {
    const current = await this.list()
    if (!current.ok) return current

    const filtered = current.value.filter((w) => w.id !== id)
    if (filtered.length === current.value.length) {
      return err(errors.notFound(id))
    }

    const written = await this.storage.set(this.workflowsKey(), filtered, { immediate: true })
    if (!written.ok) return written

    this.bus?.publish('WORKFLOW_DELETED', { projectId: this.projectId, workflowId: id })
    return ok(undefined)
  }

  /** Duplicate a workflow */
  async duplicate(id: string): Promise<Result<Workflow>> {
    const current = await this.get(id)
    if (!current.ok) return current
    if (!current.value) return err(errors.notFound(id))

    const src = current.value
    const duplicateSteps: WorkflowStep[] = src.steps.map((s) => ({
      ...s,
      id: `step_${this.now()}_${Math.random().toString(36).slice(2, 7)}`,
    }))

    return this.create({
      name: `${src.name} (copy)`,
      description: src.description,
      mode: src.mode,
      steps: duplicateSteps,
    })
  }

  /**
   * Resolves a dictionary of key-values with variable substitution
   */
  private async resolveRecord(
    record: Record<string, string> | undefined,
    envId: string,
  ): Promise<Record<string, string> | undefined> {
    if (!record || !this.environmentService) return record
    const resolved: Record<string, string> = {}
    for (const [k, v] of Object.entries(record)) {
      const res = await this.environmentService.resolve(v, envId)
      resolved[k] = res.ok ? res.value.text : v
    }
    return resolved
  }

  /**
   * Execute a workflow sequentially with dynamic variable resolution and auto-extraction chaining.
   */
  async execute(
    workflowId: string,
    options?: WorkflowExecutionOptions,
  ): Promise<Result<WorkflowRunSummary>> {
    const wfRes = await this.get(workflowId)
    if (!wfRes.ok) return wfRes
    if (!wfRes.value) return err(errors.notFound(workflowId))

    const workflow = wfRes.value
    const executor = options?.executor ?? this.defaultExecutor
    if (!executor) {
      return err(errors.invalidInput('No executor provided to run workflow steps'))
    }

    const envId =
      options?.environmentId ??
      (this.environmentService ? await this.environmentService.getActiveId() : '')

    const startedAt = this.now()
    this.bus?.publish('WORKFLOW_STARTED', { projectId: this.projectId, workflowId })

    const totalSteps = workflow.steps.length
    const results: StepRunResult[] = []
    let cancelled = false
    let hasFailure = false

    for (let i = 0; i < totalSteps; i++) {
      if (options?.signal?.aborted) {
        cancelled = true
        break
      }

      const step = workflow.steps[i]!

      // Optional delay before step
      if (step.delayMs && step.delayMs > 0) {
        try {
          await this.delayFn(step.delayMs, options?.signal)
        } catch {
          cancelled = true
          break
        }
      }

      // 1. Variable substitution for step parameters and body
      let resolvedBody = step.body
      if (resolvedBody && this.environmentService && envId) {
        const bodyRes = await this.environmentService.resolve(resolvedBody, envId)
        if (bodyRes.ok) {
          resolvedBody = bodyRes.value.text
        }
      }

      const resolvedPathParams = await this.resolveRecord(step.pathParams, envId)
      const resolvedQueryParams = await this.resolveRecord(step.queryParams, envId)
      const resolvedHeaders = await this.resolveRecord(step.headerParams, envId)

      const payload: StepExecutionPayload = {
        step,
        resolvedBody,
        resolvedPathParams,
        resolvedQueryParams,
        resolvedHeaders,
      }

      options?.onStepStart?.(i, totalSteps, step)

      const stepStartTime = this.now()
      let execResult: {
        status?: number
        error?: string
        success: boolean
        responseBody?: string
      }

      try {
        execResult = await executor(payload)
      } catch (err: unknown) {
        execResult = {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        }
      }

      const durationMs = Math.max(0, this.now() - stepStartTime)

      // Automatically trigger response auto-extraction if response body is returned
      if (execResult.responseBody && this.environmentService?.applyExtraction) {
        try {
          await this.environmentService.applyExtraction(step.endpointId, execResult.responseBody)
        } catch {
          // Extraction failures shouldn't crash the workflow runner
        }
      }

      const stepRunResult: StepRunResult = {
        stepId: step.id,
        endpointId: step.endpointId,
        status: execResult.status,
        durationMs,
        error: execResult.error,
        success: execResult.success,
      }

      results.push(stepRunResult)

      this.bus?.publish('WORKFLOW_STEP_COMPLETED', {
        projectId: this.projectId,
        workflowId,
        stepIndex: i,
        total: totalSteps,
        stepId: step.id,
        endpointId: step.endpointId,
        status: execResult.status,
        durationMs,
        error: execResult.error,
        success: execResult.success,
      })

      options?.onStepProgress?.(i, totalSteps, stepRunResult)

      if (!execResult.success) {
        hasFailure = true
        if (workflow.mode === 'stop-on-failure') {
          break
        }
      }
    }

    const runDurationMs = Math.max(0, this.now() - startedAt)
    const runStatus: 'success' | 'failed' | 'cancelled' = cancelled
      ? 'cancelled'
      : hasFailure
        ? 'failed'
        : 'success'

    const summary: WorkflowRunSummary = {
      workflowId,
      status: runStatus,
      totalSteps,
      completedSteps: results.length,
      results,
      startedAt,
      durationMs: runDurationMs,
    }

    // Persist last run metrics to workflow
    try {
      const allRes = await this.list()
      if (allRes.ok) {
        const wfIdx = allRes.value.findIndex((w) => w.id === workflowId)
        if (wfIdx >= 0) {
          const updatedWf = {
            ...allRes.value[wfIdx]!,
            lastRunAt: startedAt,
            lastRunStatus: runStatus,
            lastRunDurationMs: runDurationMs,
            updatedAt: this.now(),
          }
          const nextList = [...allRes.value]
          nextList[wfIdx] = updatedWf
          await this.storage.set(this.workflowsKey(), nextList, { immediate: true })
        }
      }
    } catch {
      // Metrics update failure is non-fatal to the execution summary
    }

    this.bus?.publish('WORKFLOW_COMPLETED', {
      projectId: this.projectId,
      workflowId,
      status: runStatus,
      totalSteps,
      completedSteps: results.length,
      durationMs: runDurationMs,
    })

    return ok(summary)
  }
}

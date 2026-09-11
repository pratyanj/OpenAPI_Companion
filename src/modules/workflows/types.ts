export type WorkflowFailureMode = 'stop-on-failure' | 'continue-on-failure'

// ---------------------------------------------------------------------------
// Import / Export types — portable, no runtime metadata
// ---------------------------------------------------------------------------

/** A single step as represented in an export bundle (no internal `id` field) */
export interface WorkflowExportStep {
  endpointId: string
  name?: string
  body?: string
  pathParams?: Record<string, string>
  queryParams?: Record<string, string>
  headerParams?: Record<string, string>
  delayMs?: number
}

/** A workflow as represented in an export bundle (no `id`, `createdAt`, `lastRun*`) */
export interface WorkflowExportItem {
  name: string
  description?: string
  mode: WorkflowFailureMode
  steps: WorkflowExportStep[]
}

/** The top-level JSON bundle written to / read from disk */
export interface WorkflowExportBundle {
  version: '1.0'
  exportedAt: string // ISO 8601
  workflows: WorkflowExportItem[]
}

/** Summary returned after a successful import */
export interface WorkflowImportResult {
  imported: number
  skipped: number
  renamed: string[] // names that were renamed to avoid conflicts
}

export interface WorkflowStep {
  id: string
  endpointId: string
  templateId?: string
  name?: string
  body?: string
  pathParams?: Record<string, string>
  queryParams?: Record<string, string>
  headerParams?: Record<string, string>
  delayMs?: number
}

export interface Workflow {
  id: string
  name: string
  description?: string
  mode: WorkflowFailureMode
  steps: WorkflowStep[]
  createdAt: number
  updatedAt: number
  lastRunAt?: number
  lastRunStatus?: 'success' | 'failed' | 'cancelled'
  lastRunDurationMs?: number
}

export interface WorkflowInput {
  name: string
  description?: string
  mode?: WorkflowFailureMode
  steps?: WorkflowStep[]
}

export interface StepRunResult {
  stepId: string
  endpointId: string
  status?: number
  durationMs?: number
  error?: string
  success: boolean
}

export interface WorkflowRunSummary {
  workflowId: string
  status: 'success' | 'failed' | 'cancelled'
  totalSteps: number
  completedSteps: number
  results: StepRunResult[]
  startedAt: number
  durationMs: number
}

export interface StepExecutionPayload {
  step: WorkflowStep
  resolvedBody?: string
  resolvedPathParams?: Record<string, string>
  resolvedQueryParams?: Record<string, string>
  resolvedHeaders?: Record<string, string>
}

export type StepExecutor = (
  payload: StepExecutionPayload,
  signal?: AbortSignal,
) => Promise<{
  status?: number
  error?: string
  success: boolean
  responseBody?: string
}>

import type { Result } from '@/types'
import type { EndpointInfo } from '@/adapters'

export interface WorkflowExecutionOptions {
  environmentId?: string
  signal?: AbortSignal
  executor?: StepExecutor
  onStepStart?: (stepIndex: number, total: number, step: WorkflowStep) => void
  onStepProgress?: (stepIndex: number, total: number, result: StepRunResult) => void
}

export interface WorkflowsPanelService {
  list(): Promise<Result<Workflow[]>>
  get(id: string): Promise<Result<Workflow | null>>
  create(input: WorkflowInput): Promise<Result<Workflow>>
  update(id: string, patch: Partial<WorkflowInput>): Promise<Result<Workflow>>
  delete(id: string): Promise<Result<void>>
  duplicate(id: string): Promise<Result<Workflow>>
  execute(
    workflowId: string,
    options?: WorkflowExecutionOptions,
  ): Promise<Result<WorkflowRunSummary>>
  cancelActiveExecution?(): boolean
  listEndpoints?(): EndpointInfo[]
  openEndpoint?(endpointId: string): void
  /** Export all (or specific) workflows as a portable JSON bundle */
  exportAll?(ids?: string[]): Promise<Result<WorkflowExportBundle>>
  /** Import workflows from a portable JSON bundle */
  importAll?(
    bundle: WorkflowExportBundle,
    options?: { onConflict: 'rename' | 'skip' },
  ): Promise<Result<WorkflowImportResult>>
}


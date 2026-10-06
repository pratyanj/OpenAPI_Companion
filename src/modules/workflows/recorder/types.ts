/**
 * Domain types for Phase 2: API Scenario Recorder.
 */

export type RecordingState = 'idle' | 'recording' | 'paused'

export interface SuggestedVariableBinding {
  id: string
  /** The suggested template variable name, e.g. "user_id" (used as {{user_id}}) */
  variableName: string
  /** Index of the step that produced this value in its response */
  extractedFromStepIndex: number
  /** JSONPath to extract value from source step response body, e.g. "$.data.id" */
  sourceJsonPath: string
  /** The literal value captured in the response */
  originalValue: string
  /** Index of the step where this value was reused in the request */
  targetStepIndex: number
  /** Where the literal value was found in the target request */
  targetLocation: 'path' | 'query' | 'body' | 'header'
  /** Specific param key or property name, if applicable */
  targetKey?: string
  /** Whether this replacement is enabled by the user */
  enabled: boolean
}

export interface RecordedStep {
  id: string
  order: number
  endpointId: string
  method: string
  endpoint: string
  requestUrl?: string
  pathParams?: Record<string, string>
  queryParams?: Record<string, string>
  headers?: Record<string, string>
  body?: string
  response?: {
    status: number
    body?: string
    headers?: Record<string, string>
    durationMs?: number
  }
  timestamp: number
}

export interface Scenario {
  id: string
  name: string
  description?: string
  projectId: string
  steps: RecordedStep[]
  suggestedVariables: SuggestedVariableBinding[]
  createdAt: number
  updatedAt: number
}

export interface ScenarioRecorderState {
  state: RecordingState
  steps: RecordedStep[]
  suggestedVariables: SuggestedVariableBinding[]
  startedAt?: number
}

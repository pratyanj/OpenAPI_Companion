/**
 * Scenario Recorder Service.
 * Coordinates in-page recording of Swagger executions and converts scenarios to Workflows.
 */

import type { EventBus } from '@/core/events'
import type { ExecutedResponse } from '@/adapters/types'
import type { WorkflowInput, WorkflowStep } from '../types'
import type {
  RecordedStep,
  RecordingState,
  Scenario,
  ScenarioRecorderState,
  SuggestedVariableBinding,
} from './types'
import { analyzeScenarioVariables } from './heuristics'

export interface ScenarioRecorderOptions {
  projectId: string
  bus?: EventBus
  now?: () => number
}

export class ScenarioRecorderService {
  private readonly projectId: string
  private readonly bus?: EventBus
  private readonly now: () => number
  private state: RecordingState = 'idle'
  private steps: RecordedStep[] = []
  private startedAt?: number
  private name: string = 'New Scenario'

  constructor(options: ScenarioRecorderOptions) {
    this.projectId = options.projectId
    this.bus = options.bus
    this.now = options.now ?? (() => Date.now())
  }

  getState(): ScenarioRecorderState {
    return {
      state: this.state,
      steps: [...this.steps],
      suggestedVariables: analyzeScenarioVariables(this.steps),
      startedAt: this.startedAt,
    }
  }

  isRecording(): boolean {
    return this.state === 'recording'
  }

  start(name?: string): void {
    this.name = name ?? `Scenario ${new Date(this.now()).toLocaleTimeString()}`
    this.steps = []
    this.state = 'recording'
    this.startedAt = this.now()

    this.bus?.publish('SCENARIO_RECORDING_STARTED', {
      projectId: this.projectId,
      startedAt: this.startedAt,
      name: this.name,
    })
  }

  pause(): void {
    if (this.state !== 'recording') return
    this.state = 'paused'
    this.bus?.publish('SCENARIO_RECORDING_PAUSED', {
      projectId: this.projectId,
      stepCount: this.steps.length,
    })
  }

  resume(): void {
    if (this.state !== 'paused') return
    this.state = 'recording'
    this.bus?.publish('SCENARIO_RECORDING_RESUMED', {
      projectId: this.projectId,
      stepCount: this.steps.length,
    })
  }

  stop(): Scenario {
    this.state = 'idle'
    const suggestedVariables = analyzeScenarioVariables(this.steps)
    const scenario: Scenario = {
      id: `scenario_${this.now()}`,
      name: this.name,
      projectId: this.projectId,
      steps: [...this.steps],
      suggestedVariables,
      createdAt: this.startedAt ?? this.now(),
      updatedAt: this.now(),
    }

    this.bus?.publish('SCENARIO_RECORDING_STOPPED', {
      projectId: this.projectId,
      scenario,
    })

    return scenario
  }

  reset(): void {
    this.state = 'idle'
    this.steps = []
    this.startedAt = undefined
    this.name = 'New Scenario'
  }

  recordExecution(executed: ExecutedResponse): RecordedStep | null {
    if (this.state !== 'recording') return null

    const stepIndex = this.steps.length
    const step: RecordedStep = {
      id: `step_${stepIndex + 1}_${this.now()}`,
      order: stepIndex + 1,
      endpointId: executed.endpointId,
      method: executed.method.toUpperCase(),
      endpoint: executed.endpoint,
      requestUrl: executed.requestUrl,
      pathParams: executed.pathParams ? { ...executed.pathParams } : undefined,
      queryParams: executed.queryParams ? { ...executed.queryParams } : undefined,
      headers: executed.headers ? { ...executed.headers } : undefined,
      body: executed.requestBody,
      response: {
        status: executed.status,
        body: executed.responseBody,
        durationMs: executed.durationMs,
      },
      timestamp: this.now(),
    }

    this.steps.push(step)

    this.bus?.publish('SCENARIO_STEP_CAPTURED', {
      projectId: this.projectId,
      step,
      totalSteps: this.steps.length,
    })

    return step
  }

  /**
   * Converts a recorded scenario into a WorkflowInput, applying enabled variable replacements
   * and auto-generating status assertions.
   */
  convertToWorkflow(
    scenario: Scenario,
    customBindings?: SuggestedVariableBinding[],
  ): WorkflowInput {
    const bindings = (customBindings ?? scenario.suggestedVariables).filter((b) => b.enabled)

    const workflowSteps: WorkflowStep[] = scenario.steps.map((step, idx) => {
      // Clone step parameters and body
      const pathParams = step.pathParams ? { ...step.pathParams } : undefined
      const queryParams = step.queryParams ? { ...step.queryParams } : undefined
      const headerParams = step.headers ? { ...step.headers } : undefined
      let body = step.body

      // Apply bindings that target this step
      const stepBindings = bindings.filter((b) => b.targetStepIndex === idx)

      for (const b of stepBindings) {
        const replacement = `{{${b.variableName}}}`

        if (b.targetLocation === 'path') {
          if (b.targetKey && pathParams && pathParams[b.targetKey] === b.originalValue) {
            pathParams[b.targetKey] = replacement
          }
        } else if (b.targetLocation === 'query') {
          if (b.targetKey && queryParams && queryParams[b.targetKey] === b.originalValue) {
            queryParams[b.targetKey] = replacement
          }
        } else if (b.targetLocation === 'header') {
          if (b.targetKey && headerParams) {
            const currentVal = headerParams[b.targetKey]
            if (currentVal) {
              headerParams[b.targetKey] = currentVal.replace(b.originalValue, replacement)
            }
          }
        } else if (b.targetLocation === 'body') {
          if (body && body.includes(b.originalValue)) {
            body = body.split(b.originalValue).join(replacement)
          }
        }
      }

      // Automatically attach a status assertion if response status is available
      const assertions =
        step.response?.status != null
          ? [
              {
                id: `a_${idx + 1}_status`,
                type: 'status' as const,
                operator: 'equals' as const,
                expected: step.response.status,
              },
            ]
          : undefined

      return {
        id: `step_${idx + 1}`,
        endpointId: step.endpointId,
        name: `${step.method} ${step.endpoint}`,
        body,
        pathParams,
        queryParams,
        headerParams,
        assertions,
      }
    })

    return {
      name: scenario.name || 'Recorded Workflow',
      description: scenario.description || `Generated from Scenario with ${scenario.steps.length} steps`,
      mode: 'stop-on-failure',
      steps: workflowSteps,
    }
  }
}

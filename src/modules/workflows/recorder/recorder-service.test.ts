import { describe, it, expect, vi } from 'vitest'
import { ScenarioRecorderService } from './recorder-service'
import { EventBus } from '@/core/events'
import type { ExecutedResponse } from '@/adapters/types'

describe('ScenarioRecorderService', () => {
  const PROJECT_ID = 'test-proj'

  it('manages recording state transitions and publishes bus events', () => {
    const bus = new EventBus()
    const startSpy = vi.fn()
    const pauseSpy = vi.fn()
    const resumeSpy = vi.fn()
    const stopSpy = vi.fn()

    bus.subscribe('SCENARIO_RECORDING_STARTED', startSpy)
    bus.subscribe('SCENARIO_RECORDING_PAUSED', pauseSpy)
    bus.subscribe('SCENARIO_RECORDING_RESUMED', resumeSpy)
    bus.subscribe('SCENARIO_RECORDING_STOPPED', stopSpy)

    const service = new ScenarioRecorderService({ projectId: PROJECT_ID, bus })

    expect(service.isRecording()).toBe(false)

    service.start('User CRUD Flow')
    expect(service.isRecording()).toBe(true)
    expect(startSpy).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: PROJECT_ID, name: 'User CRUD Flow' }),
    )

    service.pause()
    expect(service.isRecording()).toBe(false)
    expect(service.getState().state).toBe('paused')
    expect(pauseSpy).toHaveBeenCalled()

    service.resume()
    expect(service.isRecording()).toBe(true)
    expect(service.getState().state).toBe('recording')
    expect(resumeSpy).toHaveBeenCalled()

    const scenario = service.stop()
    expect(service.isRecording()).toBe(false)
    expect(scenario.name).toBe('User CRUD Flow')
    expect(stopSpy).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: PROJECT_ID, scenario }),
    )
  })

  it('records executions only when actively recording', () => {
    const service = new ScenarioRecorderService({ projectId: PROJECT_ID })

    const exec1: ExecutedResponse = {
      endpointId: 'post /login',
      method: 'post',
      endpoint: '/login',
      status: 200,
      responseBody: JSON.stringify({ token: 'tok_123' }),
    }

    // While idle: does not record
    expect(service.recordExecution(exec1)).toBeNull()
    expect(service.getState().steps).toHaveLength(0)

    // Start recording
    service.start()
    const step1 = service.recordExecution(exec1)
    expect(step1).not.toBeNull()
    expect(service.getState().steps).toHaveLength(1)
    expect(step1?.endpointId).toBe('post /login')

    // While paused: does not record
    service.pause()
    expect(service.recordExecution(exec1)).toBeNull()
    expect(service.getState().steps).toHaveLength(1)
  })

  it('converts recorded scenario to WorkflowInput with variable substitutions and assertions', () => {
    const service = new ScenarioRecorderService({ projectId: PROJECT_ID })
    service.start('Auth & Profile Flow')

    // Step 1: Login
    service.recordExecution({
      endpointId: 'post /login',
      method: 'post',
      endpoint: '/login',
      status: 200,
      responseBody: JSON.stringify({ token: 'jwt_secret_token_123' }),
    })

    // Step 2: Fetch Profile with Bearer token header
    service.recordExecution({
      endpointId: 'get /profile',
      method: 'get',
      endpoint: '/profile',
      status: 200,
      headers: { Authorization: 'Bearer jwt_secret_token_123' },
      responseBody: JSON.stringify({ id: 9988, name: 'Alice' }),
    })

    // Step 3: Update Profile with pathParam id
    service.recordExecution({
      endpointId: 'patch /users/{id}',
      method: 'patch',
      endpoint: '/users/{id}',
      status: 200,
      pathParams: { id: '9988' },
      requestBody: JSON.stringify({ name: 'Alice Updated' }),
    })

    const scenario = service.stop()
    expect(scenario.steps).toHaveLength(3)
    expect(scenario.suggestedVariables.length).toBeGreaterThanOrEqual(2)

    // Convert to workflow
    const workflow = service.convertToWorkflow(scenario)
    expect(workflow.name).toBe('Auth & Profile Flow')
    expect(workflow.steps).toHaveLength(3)

    // Step 1 should have status assertion
    expect(workflow.steps?.[0]?.assertions).toEqual([
      { id: 'a_1_status', type: 'status', operator: 'equals', expected: 200 },
    ])

    // Step 2 should have token variable replaced in headers
    const step2Headers = workflow.steps?.[1]?.headerParams
    expect(step2Headers?.Authorization).toBe('Bearer {{token}}')

    // Step 3 should have id variable replaced in pathParams
    const step3Path = workflow.steps?.[2]?.pathParams
    expect(step3Path?.id).toBe('{{profile_id}}')
  })
})

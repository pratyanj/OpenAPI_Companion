import { describe, it, expect, vi } from 'vitest'
import { WorkflowService, type WorkflowEnvironmentService } from './workflow-service'
import { StorageService } from '@/core/storage'
import { EventBus } from '@/core/events'
import { ok } from '@/types'
import { createFakeArea } from '@/tests/fake-storage'
import type { WorkflowStep, StepExecutionPayload } from './types'

const NOW = 1_700_000_000_000
const PROJECT = 'project_test'

function setup(options?: {
  envService?: WorkflowEnvironmentService
  defaultExecutor?: (p: StepExecutionPayload) => Promise<{
    status?: number
    error?: string
    success: boolean
    responseBody?: string
  }>
}) {
  const storage = new StorageService({ area: createFakeArea(), now: () => NOW })
  const bus = new EventBus()
  const service = new WorkflowService({
    storage,
    projectId: PROJECT,
    bus,
    environmentService: options?.envService,
    defaultExecutor: options?.defaultExecutor,
    now: () => NOW,
    delayFn: vi.fn().mockResolvedValue(undefined),
  })
  return { storage, bus, service }
}

describe('WorkflowService CRUD', () => {
  it('creates, lists, and gets a workflow', async () => {
    const { service, bus } = setup()
    const savedSpy = vi.fn()
    bus.subscribe('WORKFLOW_SAVED', savedSpy)

    const created = await service.create({
      name: 'Smoke Test Flow',
      description: 'End-to-end smoke tests',
      mode: 'stop-on-failure',
      steps: [
        {
          id: 'step_1',
          endpointId: 'post /api/auth/login',
          name: 'Login',
          body: '{"username": "admin"}',
        },
      ],
    })

    expect(created.ok).toBe(true)
    if (!created.ok) return
    expect(created.value.name).toBe('Smoke Test Flow')
    expect(created.value.steps).toHaveLength(1)
    expect(savedSpy).toHaveBeenCalledWith({
      projectId: PROJECT,
      workflowId: created.value.id,
    })

    const listRes = await service.list()
    expect(listRes.ok).toBe(true)
    if (!listRes.ok) return
    expect(listRes.value).toHaveLength(1)
    expect(listRes.value[0]?.id).toBe(created.value.id)

    const getRes = await service.get(created.value.id)
    expect(getRes.ok).toBe(true)
    if (!getRes.ok) return
    expect(getRes.value?.name).toBe('Smoke Test Flow')
  })

  it('rejects empty name and duplicate names', async () => {
    const { service } = setup()
    const emptyRes = await service.create({ name: '   ' })
    expect(emptyRes.ok).toBe(false)
    if (!emptyRes.ok) {
      expect(emptyRes.error.code).toBe('WORKFLOW_INVALID_INPUT')
    }

    await service.create({ name: 'Onboarding Flow' })
    const dupRes = await service.create({ name: 'onboarding flow' })
    expect(dupRes.ok).toBe(false)
    if (!dupRes.ok) {
      expect(dupRes.error.code).toBe('WORKFLOW_DUPLICATE_NAME')
    }
  })

  it('updates an existing workflow', async () => {
    const { service, bus } = setup()
    const savedSpy = vi.fn()
    bus.subscribe('WORKFLOW_SAVED', savedSpy)

    const created = await service.create({ name: 'User Flow' })
    if (!created.ok) throw new Error('Create failed')

    const updated = await service.update(created.value.id, {
      name: 'User Registration Flow',
      mode: 'continue-on-failure',
      steps: [{ id: 's1', endpointId: 'get /users' }],
    })

    expect(updated.ok).toBe(true)
    if (!updated.ok) return
    expect(updated.value.name).toBe('User Registration Flow')
    expect(updated.value.mode).toBe('continue-on-failure')
    expect(updated.value.steps).toHaveLength(1)
  })

  it('duplicates a workflow', async () => {
    const { service } = setup()
    const created = await service.create({
      name: 'Order Checkout',
      steps: [{ id: 'step_1', endpointId: 'post /orders' }],
    })
    if (!created.ok) throw new Error('Create failed')

    const duplicated = await service.duplicate(created.value.id)
    expect(duplicated.ok).toBe(true)
    if (!duplicated.ok) return
    expect(duplicated.value.name).toBe('Order Checkout (copy)')
    expect(duplicated.value.id).not.toBe(created.value.id)
    expect(duplicated.value.steps[0]?.id).not.toBe('step_1')
  })

  it('deletes a workflow', async () => {
    const { service, bus } = setup()
    const deleteSpy = vi.fn()
    bus.subscribe('WORKFLOW_DELETED', deleteSpy)

    const created = await service.create({ name: 'To Delete' })
    if (!created.ok) throw new Error('Create failed')

    const delRes = await service.delete(created.value.id)
    expect(delRes.ok).toBe(true)
    expect(deleteSpy).toHaveBeenCalledWith({
      projectId: PROJECT,
      workflowId: created.value.id,
    })

    const listRes = await service.list()
    expect(listRes.ok).toBe(true)
    if (listRes.ok) {
      expect(listRes.value).toHaveLength(0)
    }
  })
})

describe('WorkflowService Execution', () => {
  it('executes steps sequentially with variable resolution and auto-extraction', async () => {
    const resolvedMap: Record<string, string> = {
      '{{TOKEN}}': 'jwt_abc_123',
    }

    const mockEnvService: WorkflowEnvironmentService = {
      getActiveId: vi.fn().mockResolvedValue('local_env'),
      resolve: vi.fn().mockImplementation((text: string) => {
        let res = text
        for (const [k, v] of Object.entries(resolvedMap)) {
          res = res.replaceAll(k, v)
        }
        return Promise.resolve(ok({ text: res, missing: [] }))
      }),
      applyExtraction: vi.fn().mockImplementation((_endpointId, bodyStr) => {
        const parsed = JSON.parse(bodyStr)
        if (parsed.token) {
          resolvedMap['{{TOKEN}}'] = parsed.token
        }
        return Promise.resolve(ok({ extracted: [{ variable: 'TOKEN', value: parsed.token }] }))
      }),
    }

    const steps: WorkflowStep[] = [
      {
        id: 'step_login',
        endpointId: 'post /auth/login',
        body: '{"username": "admin"}',
      },
      {
        id: 'step_profile',
        endpointId: 'get /user/profile',
        headerParams: { Authorization: 'Bearer {{TOKEN}}' },
      },
    ]

    const executions: StepExecutionPayload[] = []
    const executor = vi.fn().mockImplementation(async (payload: StepExecutionPayload) => {
      executions.push(payload)
      if (payload.step.id === 'step_login') {
        return {
          status: 200,
          success: true,
          responseBody: JSON.stringify({ token: 'new_token_xyz' }),
        }
      }
      return {
        status: 200,
        success: true,
        responseBody: JSON.stringify({ name: 'Admin' }),
      }
    })

    const { service, bus } = setup({ envService: mockEnvService })
    const startedSpy = vi.fn()
    const stepCompletedSpy = vi.fn()
    const completedSpy = vi.fn()

    bus.subscribe('WORKFLOW_STARTED', startedSpy)
    bus.subscribe('WORKFLOW_STEP_COMPLETED', stepCompletedSpy)
    bus.subscribe('WORKFLOW_COMPLETED', completedSpy)

    const created = await service.create({
      name: 'Auth Chain Flow',
      steps,
    })
    if (!created.ok) throw new Error('Create failed')

    const runRes = await service.execute(created.value.id, { executor })
    expect(runRes.ok).toBe(true)
    if (!runRes.ok) return

    expect(runRes.value.status).toBe('success')
    expect(runRes.value.totalSteps).toBe(2)
    expect(runRes.value.completedSteps).toBe(2)
    expect(runRes.value.results).toHaveLength(2)

    expect(executions).toHaveLength(2)
    // Step 2 should receive the resolved token extracted from Step 1!
    expect(executions[1]?.resolvedHeaders?.Authorization).toBe('Bearer new_token_xyz')

    expect(startedSpy).toHaveBeenCalled()
    expect(stepCompletedSpy).toHaveBeenCalledTimes(2)
    expect(completedSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'success',
        totalSteps: 2,
        completedSteps: 2,
      }),
    )

    // Check that last run metrics were saved on workflow
    const wf = await service.get(created.value.id)
    if (wf.ok && wf.value) {
      expect(wf.value.lastRunStatus).toBe('success')
      expect(wf.value.lastRunAt).toBe(NOW)
    }
  })

  it('stops on failure when mode is stop-on-failure', async () => {
    const steps: WorkflowStep[] = [
      { id: 's1', endpointId: 'get /step1' },
      { id: 's2', endpointId: 'get /step2' },
      { id: 's3', endpointId: 'get /step3' },
    ]

    const executor = vi.fn().mockImplementation(async (payload: StepExecutionPayload) => {
      if (payload.step.id === 's2') {
        return { status: 500, success: false, error: 'Internal Server Error' }
      }
      return { status: 200, success: true }
    })

    const { service } = setup()
    const created = await service.create({
      name: 'Stop on failure test',
      mode: 'stop-on-failure',
      steps,
    })
    if (!created.ok) throw new Error('Create failed')

    const runRes = await service.execute(created.value.id, { executor })
    expect(runRes.ok).toBe(true)
    if (!runRes.ok) return

    expect(runRes.value.status).toBe('failed')
    expect(runRes.value.completedSteps).toBe(2)
    expect(executor).toHaveBeenCalledTimes(2)
  })

  it('continues on failure when mode is continue-on-failure', async () => {
    const steps: WorkflowStep[] = [
      { id: 's1', endpointId: 'get /step1' },
      { id: 's2', endpointId: 'get /step2' },
      { id: 's3', endpointId: 'get /step3' },
    ]

    const executor = vi.fn().mockImplementation(async (payload: StepExecutionPayload) => {
      if (payload.step.id === 's2') {
        return { status: 500, success: false, error: 'Internal Server Error' }
      }
      return { status: 200, success: true }
    })

    const { service } = setup()
    const created = await service.create({
      name: 'Continue on failure test',
      mode: 'continue-on-failure',
      steps,
    })
    if (!created.ok) throw new Error('Create failed')

    const runRes = await service.execute(created.value.id, { executor })
    expect(runRes.ok).toBe(true)
    if (!runRes.ok) return

    expect(runRes.value.status).toBe('failed')
    expect(runRes.value.completedSteps).toBe(3)
    expect(executor).toHaveBeenCalledTimes(3)
  })

  it('handles cancellation via AbortController', async () => {
    const steps: WorkflowStep[] = [
      { id: 's1', endpointId: 'get /step1' },
      { id: 's2', endpointId: 'get /step2' },
    ]

    const controller = new AbortController()

    const executor = vi.fn().mockImplementation(async () => {
      controller.abort()
      return { status: 200, success: true }
    })

    const { service } = setup()
    const created = await service.create({
      name: 'Cancel test',
      steps,
    })
    if (!created.ok) throw new Error('Create failed')

    const runRes = await service.execute(created.value.id, {
      executor,
      signal: controller.signal,
    })

    expect(runRes.ok).toBe(true)
    if (!runRes.ok) return

    expect(runRes.value.status).toBe('cancelled')
    expect(runRes.value.completedSteps).toBe(1)
    expect(executor).toHaveBeenCalledTimes(1)
  })
})

// =============================================================================
// Import / Export
// =============================================================================
describe('WorkflowService import / export', () => {
  const makeStep = (endpointId: string) => ({
    id: 'step_1',
    endpointId,
    name: 'Test step',
    body: '{"key":"value"}',
  })

  it('exports an empty workflow list as a valid bundle', async () => {
    const { service } = setup()
    const res = await service.exportAll()
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.value.version).toBe('1.0')
    expect(res.value.workflows).toHaveLength(0)
    expect(typeof res.value.exportedAt).toBe('string')
  })

  it('exports workflows without runtime metadata (id, createdAt, lastRunAt)', async () => {
    const { service } = setup()
    await service.create({
      name: 'Flow A',
      description: 'desc',
      mode: 'stop-on-failure',
      steps: [makeStep('GET /users')],
    })

    const res = await service.exportAll()
    expect(res.ok).toBe(true)
    if (!res.ok) return

    expect(res.value.workflows).toHaveLength(1)
    const exported = res.value.workflows[0]!
    expect(exported.name).toBe('Flow A')
    expect(exported.description).toBe('desc')
    expect(exported.mode).toBe('stop-on-failure')
    expect(exported.steps).toHaveLength(1)
    expect(exported.steps[0]!.endpointId).toBe('GET /users')

    // Verify runtime fields are NOT present
    expect((exported as unknown as Record<string, unknown>).id).toBeUndefined()
    expect((exported as unknown as Record<string, unknown>).createdAt).toBeUndefined()
    expect((exported as unknown as Record<string, unknown>).lastRunAt).toBeUndefined()

    // Verify step has no internal id
    expect((exported.steps[0] as unknown as Record<string, unknown>).id).toBeUndefined()
  })

  it('exports only specific workflow IDs when ids param is provided', async () => {
    const { service } = setup()
    const r1 = await service.create({ name: 'Flow A', steps: [makeStep('GET /a')] })
    await service.create({ name: 'Flow B', steps: [makeStep('GET /b')] })
    if (!r1.ok) throw new Error('create failed')

    const res = await service.exportAll([r1.value.id])
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.value.workflows).toHaveLength(1)
    expect(res.value.workflows[0]!.name).toBe('Flow A')
  })

  it('imports a valid bundle and creates the workflows', async () => {
    const { service } = setup()
    const bundle = {
      version: '1.0' as const,
      exportedAt: new Date().toISOString(),
      workflows: [
        {
          name: 'Imported Flow',
          description: 'from bundle',
          mode: 'continue-on-failure' as const,
          steps: [{ endpointId: 'POST /login', name: 'Login' }],
        },
      ],
    }

    const res = await service.importAll(bundle)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.value.imported).toBe(1)
    expect(res.value.skipped).toBe(0)
    expect(res.value.renamed).toHaveLength(0)

    const all = await service.list()
    expect(all.ok).toBe(true)
    if (!all.ok) return
    expect(all.value.some((w) => w.name === 'Imported Flow')).toBe(true)
  })

  it('renames imported workflow when name conflicts (default behavior)', async () => {
    const { service } = setup()
    await service.create({ name: 'Duplicate Flow', steps: [makeStep('GET /x')] })

    const bundle = {
      version: '1.0' as const,
      exportedAt: new Date().toISOString(),
      workflows: [{ name: 'Duplicate Flow', mode: 'stop-on-failure' as const, steps: [] }],
    }

    const res = await service.importAll(bundle)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.value.imported).toBe(1)
    expect(res.value.renamed).toHaveLength(1)
    expect(res.value.renamed[0]).toContain('Duplicate Flow')
    expect(res.value.renamed[0]).toContain('(imported)')

    const all = await service.list()
    if (!all.ok) return
    expect(all.value.some((w) => w.name === 'Duplicate Flow (imported)')).toBe(true)
    // Original unchanged
    expect(all.value.some((w) => w.name === 'Duplicate Flow')).toBe(true)
  })

  it('skips conflicting workflows when onConflict is "skip"', async () => {
    const { service } = setup()
    await service.create({ name: 'Existing Flow', steps: [makeStep('GET /x')] })

    const bundle = {
      version: '1.0' as const,
      exportedAt: new Date().toISOString(),
      workflows: [
        { name: 'Existing Flow', mode: 'stop-on-failure' as const, steps: [] },
        { name: 'New Flow', mode: 'stop-on-failure' as const, steps: [] },
      ],
    }

    const res = await service.importAll(bundle, { onConflict: 'skip' })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.value.imported).toBe(1)
    expect(res.value.skipped).toBe(1)
    expect(res.value.renamed).toHaveLength(0)
  })

  it('returns WORKFLOW_INVALID_INPUT for invalid bundle structure (non-array workflows)', async () => {
    const { service } = setup()
    const badBundle = { version: '1.0', exportedAt: '', workflows: 'not-an-array' }
    const res = await service.importAll(
      badBundle as unknown as import('./types').WorkflowExportBundle,
    )
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error.code).toBe('WORKFLOW_INVALID_INPUT')
  })

  it('returns WORKFLOW_INVALID_INPUT for unsupported bundle version', async () => {
    const { service } = setup()
    const badBundle = { version: '2.0', exportedAt: '', workflows: [] }
    const res = await service.importAll(
      badBundle as unknown as import('./types').WorkflowExportBundle,
    )
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error.code).toBe('WORKFLOW_INVALID_INPUT')
    expect(res.error.message).toContain('2.0')
  })
})

describe('Workflow Step Assertions', () => {
  it('passes step and records assertion results when all assertions pass', async () => {
    const executor = vi.fn().mockResolvedValue({
      status: 200,
      success: true,
      responseBody: JSON.stringify({ success: true, user: { id: 101, name: 'Alice' } }),
    })
    const { service } = setup({ defaultExecutor: executor })

    const wf = await service.create({
      name: 'Assertion Pass Flow',
      mode: 'stop-on-failure',
      steps: [
        {
          id: 'step_1',
          endpointId: 'get /user/101',
          assertions: [
            { id: 'a1', type: 'status', operator: 'equals', expected: 200 },
            { id: 'a2', type: 'jsonPath', target: '$.user.id', operator: 'equals', expected: 101 },
          ],
        },
      ],
    })
    expect(wf.ok).toBe(true)
    if (!wf.ok) return

    const runRes = await service.execute(wf.value.id)
    expect(runRes.ok).toBe(true)
    if (!runRes.ok) return

    expect(runRes.value.status).toBe('success')
    expect(runRes.value.completedSteps).toBe(1)
    const stepResult = runRes.value.results[0]
    expect(stepResult?.success).toBe(true)
    expect(stepResult?.assertionsPassed).toBe(true)
    expect(stepResult?.assertionResults).toHaveLength(2)
  })

  it('fails step and stops execution when an assertion fails under stop-on-failure', async () => {
    const executor = vi.fn().mockImplementation(async (payload) => {
      if (payload.step.id === 'step_1') {
        return {
          status: 200,
          success: true,
          responseBody: JSON.stringify({ count: 0 }),
        }
      }
      return { status: 200, success: true }
    })
    const { service } = setup({ defaultExecutor: executor })

    const wf = await service.create({
      name: 'Assertion Fail Stop Flow',
      mode: 'stop-on-failure',
      steps: [
        {
          id: 'step_1',
          endpointId: 'get /items',
          assertions: [
            { id: 'a1', type: 'jsonPath', target: '$.count', operator: 'greaterThan', expected: 0 },
          ],
        },
        {
          id: 'step_2',
          endpointId: 'post /items/process',
        },
      ],
    })
    expect(wf.ok).toBe(true)
    if (!wf.ok) return

    const runRes = await service.execute(wf.value.id)
    expect(runRes.ok).toBe(true)
    if (!runRes.ok) return

    expect(runRes.value.status).toBe('failed')
    expect(runRes.value.completedSteps).toBe(1)
    expect(runRes.value.results).toHaveLength(1)
    const step1 = runRes.value.results[0]
    expect(step1?.success).toBe(false)
    expect(step1?.assertionsPassed).toBe(false)
    expect(step1?.error).toContain('Expected 0 > 0')
    // Step 2 was never executed due to stop-on-failure
    expect(executor).toHaveBeenCalledTimes(1)
  })

  it('continues execution when an assertion fails under continue-on-failure', async () => {
    const executor = vi.fn().mockImplementation(async (payload) => {
      if (payload.step.id === 'step_1') {
        return {
          status: 200,
          success: true,
          responseBody: JSON.stringify({ status: 'pending' }),
        }
      }
      return { status: 200, success: true }
    })
    const { service } = setup({ defaultExecutor: executor })

    const wf = await service.create({
      name: 'Assertion Continue Flow',
      mode: 'continue-on-failure',
      steps: [
        {
          id: 'step_1',
          endpointId: 'get /status',
          assertions: [
            { id: 'a1', type: 'jsonPath', target: '$.status', operator: 'equals', expected: 'ready' },
          ],
        },
        {
          id: 'step_2',
          endpointId: 'post /notify',
        },
      ],
    })
    expect(wf.ok).toBe(true)
    if (!wf.ok) return

    const runRes = await service.execute(wf.value.id)
    expect(runRes.ok).toBe(true)
    if (!runRes.ok) return

    expect(runRes.value.status).toBe('failed')
    expect(runRes.value.completedSteps).toBe(2)
    expect(runRes.value.results).toHaveLength(2)
    expect(runRes.value.results[0]?.success).toBe(false)
    expect(runRes.value.results[1]?.success).toBe(true)
    expect(executor).toHaveBeenCalledTimes(2)
  })

  it('preserves assertions across export and import', async () => {
    const { service } = setup()
    const wf = await service.create({
      name: 'Export Assertions Flow',
      mode: 'stop-on-failure',
      steps: [
        {
          id: 'step_1',
          endpointId: 'get /data',
          assertions: [
            { id: 'a1', type: 'status', operator: 'equals', expected: 200 },
            { id: 'a2', type: 'type', target: '$.items', operator: 'equals', expected: 'array' },
          ],
        },
      ],
    })
    expect(wf.ok).toBe(true)
    if (!wf.ok) return

    const exported = await service.exportAll([wf.value.id])
    expect(exported.ok).toBe(true)
    if (!exported.ok) return
    expect(exported.value.workflows[0]?.steps[0]?.assertions).toHaveLength(2)

    // Delete and import back
    await service.delete(wf.value.id)
    const imported = await service.importAll(exported.value)
    expect(imported.ok).toBe(true)

    const list = await service.list()
    expect(list.ok).toBe(true)
    if (!list.ok) return
    expect(list.value[0]?.steps[0]?.assertions).toEqual([
      { id: 'a1', type: 'status', operator: 'equals', expected: 200 },
      { id: 'a2', type: 'type', target: '$.items', operator: 'equals', expected: 'array' },
    ])
  })

  it('executes step-level extractions and saves variables to environment service', async () => {
    const setVariableSpy = vi.fn().mockResolvedValue(ok(undefined))
    const mockEnvService = {
      getActiveId: vi.fn().mockResolvedValue('env_default'),
      resolve: vi.fn().mockImplementation(async (text: string) => ok({ text, missing: [] })),
      setVariable: setVariableSpy,
    }

    const executor = vi.fn().mockResolvedValue({
      status: 201,
      success: true,
      responseBody: JSON.stringify({ data: { user: { id: 9942, role: 'admin' } } }),
    })

    const { service } = setup({ envService: mockEnvService, defaultExecutor: executor })

    const wf = await service.create({
      name: 'Step Extractions Flow',
      steps: [
        {
          id: 'step_1',
          endpointId: 'post /users',
          extractions: [
            { id: 'e1', property: '$.data.user.id', variableName: 'userId' },
            { id: 'e2', property: '$.data.user.role', variableName: 'userRole' },
          ],
        },
      ],
    })
    expect(wf.ok).toBe(true)
    if (!wf.ok) return

    const runRes = await service.execute(wf.value.id)
    expect(runRes.ok).toBe(true)
    if (!runRes.ok) return

    expect(setVariableSpy).toHaveBeenCalledWith('userId', '9942')
    expect(setVariableSpy).toHaveBeenCalledWith('userRole', 'admin')
    expect(runRes.value.results[0]?.extractedVariables).toEqual({
      userId: '9942',
      userRole: 'admin',
    })
  })

  it('handles ask-on-failure mode: pauses, prompts, and continues when user chooses continue', async () => {
    const executor = vi.fn().mockImplementation(async (payload: StepExecutionPayload) => {
      if (payload.step.id === 'step_1') {
        return { status: 500, success: false, error: 'Internal Server Error' }
      }
      return { status: 200, success: true }
    })

    const { service } = setup({ defaultExecutor: executor })

    const wf = await service.create({
      name: 'Ask On Failure Flow',
      mode: 'ask-on-failure',
      steps: [
        { id: 'step_1', endpointId: 'post /critical' },
        { id: 'step_2', endpointId: 'get /followup' },
      ],
    })
    expect(wf.ok).toBe(true)
    if (!wf.ok) return

    const promptSpy = vi.fn().mockResolvedValue('continue')

    const runRes = await service.execute(wf.value.id, {
      onFailurePrompt: promptSpy,
    })
    expect(runRes.ok).toBe(true)
    if (!runRes.ok) return

    expect(promptSpy).toHaveBeenCalledTimes(1)
    expect(promptSpy).toHaveBeenCalledWith(0, expect.objectContaining({ id: 'step_1' }), expect.any(String))
    expect(runRes.value.completedSteps).toBe(2)
    expect(runRes.value.status).toBe('failed')
  })

  it('handles ask-on-failure mode: aborts remaining steps when user chooses stop', async () => {
    const executor = vi.fn().mockImplementation(async (payload: StepExecutionPayload) => {
      if (payload.step.id === 'step_1') {
        return { status: 500, success: false, error: 'Database down' }
      }
      return { status: 200, success: true }
    })

    const { service } = setup({ defaultExecutor: executor })

    const wf = await service.create({
      name: 'Ask On Failure Stop Flow',
      mode: 'ask-on-failure',
      steps: [
        { id: 'step_1', endpointId: 'post /critical' },
        { id: 'step_2', endpointId: 'get /followup' },
      ],
    })
    expect(wf.ok).toBe(true)
    if (!wf.ok) return

    const promptSpy = vi.fn().mockResolvedValue('stop')

    const runRes = await service.execute(wf.value.id, {
      onFailurePrompt: promptSpy,
    })
    expect(runRes.ok).toBe(true)
    if (!runRes.ok) return

    expect(promptSpy).toHaveBeenCalledTimes(1)
    expect(runRes.value.completedSteps).toBe(1)
    expect(executor).toHaveBeenCalledTimes(1)
  })

  it('persists lastRunSummary on the workflow record', async () => {
    const executor = vi.fn().mockResolvedValue({ status: 200, success: true })
    const { service } = setup({ defaultExecutor: executor })

    const wf = await service.create({
      name: 'Summary Persistence Flow',
      steps: [{ id: 'step_1', endpointId: 'get /health' }],
    })
    expect(wf.ok).toBe(true)
    if (!wf.ok) return

    await service.execute(wf.value.id)

    const updated = await service.get(wf.value.id)
    expect(updated.ok).toBe(true)
    if (!updated.ok || !updated.value) return

    expect(updated.value.lastRunSummary).toBeDefined()
    expect(updated.value.lastRunSummary?.status).toBe('success')
    expect(updated.value.lastRunSummary?.totalSteps).toBe(1)
  })
})


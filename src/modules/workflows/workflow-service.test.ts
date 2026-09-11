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
    const res = await service.importAll(badBundle as unknown as import('./types').WorkflowExportBundle)
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error.code).toBe('WORKFLOW_INVALID_INPUT')
  })

  it('returns WORKFLOW_INVALID_INPUT for unsupported bundle version', async () => {
    const { service } = setup()
    const badBundle = { version: '2.0', exportedAt: '', workflows: [] }
    const res = await service.importAll(badBundle as unknown as import('./types').WorkflowExportBundle)
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error.code).toBe('WORKFLOW_INVALID_INPUT')
    expect(res.error.message).toContain('2.0')
  })
})

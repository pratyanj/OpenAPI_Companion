import { describe, it, expect, vi } from 'vitest'
import { RequestService } from './request-service'
import { StorageService } from '@/core/storage'
import { EventBus } from '@/core/events'
import { ok, type Result } from '@/types'
import type { RequestSnapshot, SwaggerAdapter } from '@/adapters'
import { createFakeArea } from '@/tests/fake-storage'

const NOW = 1_700_000_000_000
const PROJECT = 'project_test'

function mockAdapter(over: Partial<SwaggerAdapter> = {}): SwaggerAdapter {
  return {
    detect: () => true,
    version: () => null,
    specUrl: () => null,
    readAuth: () => null,
    writeAuth: (): Result<void> => ok(undefined),
    clearAuth: (): Result<void> => ok(undefined),
    readOpenRequests: () => [],
    writeRequest: (): Result<void> => ok(undefined),
    replay: (): Result<void> => ok(undefined),
    isRequestBodyEmpty: () => true,
    readExecutedResponses: () => [],
    listEndpoints: () => [],
    openEndpoint: (): Result<void> => ok(undefined),
    onExecute: () => () => {},
    observe: () => () => {},
    ...over,
  }
}

function setup(adapter: SwaggerAdapter = mockAdapter()) {
  const storage = new StorageService({ area: createFakeArea(), now: () => NOW })
  const bus = new EventBus()
  const service = new RequestService({ storage, adapter, projectId: PROJECT, bus, now: () => NOW })
  return { storage, bus, service }
}

const snapshot = (over: Partial<RequestSnapshot> = {}): RequestSnapshot => ({
  endpointId: 'post /users',
  method: 'post',
  body: '{"name":"a"}',
  ...over,
})

describe('RequestService — drafts', () => {
  it('saves a draft and publishes REQUEST_CHANGED', async () => {
    const { service, bus } = setup()
    const changed = vi.fn()
    bus.subscribe('REQUEST_CHANGED', changed)

    await service.saveDraft({
      endpointId: 'post /users',
      method: 'post',
      environmentId: 'default',
      body: '{}',
      updatedAt: NOW,
    })

    expect(changed).toHaveBeenCalledWith({ endpointId: 'post /users', environmentId: 'default' })
    const draft = await service.getDraft('default', 'post /users')
    expect(draft.ok && draft.value?.body).toBe('{}')
  })

  it('autosaves every open operation with a non-empty body', async () => {
    const adapter = mockAdapter({
      readOpenRequests: () => [
        snapshot(),
        snapshot({ endpointId: 'get /ping', method: 'get', body: '' }),
      ],
    })
    const { service } = setup(adapter)

    const result = await service.captureOpen('default')
    expect(result).toEqual({ ok: true, value: 1 }) // empty body skipped
    const draft = await service.getDraft('default', 'post /users')
    expect(draft.ok && draft.value?.body).toBe('{"name":"a"}')
  })

  it('restores a draft into Swagger and publishes REQUEST_RESTORED', async () => {
    const writeRequest = vi.fn((): Result<void> => ok(undefined))
    const adapter = mockAdapter({ writeRequest })
    const { service, bus } = setup(adapter)
    const restored = vi.fn()
    bus.subscribe('REQUEST_RESTORED', restored)

    await service.saveDraft({
      endpointId: 'post /users',
      method: 'post',
      environmentId: 'default',
      body: '{"saved":true}',
      updatedAt: NOW,
    })

    const result = await service.restore('default', 'post /users')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value?.body).toBe('{"saved":true}')
    expect(writeRequest).toHaveBeenCalledWith(
      'post /users',
      expect.objectContaining({ body: '{"saved":true}' }),
    )
    expect(restored).toHaveBeenCalledWith({
      endpointId: 'post /users',
      environmentId: 'default',
    })
  })

  it('only auto-restores when the open body is EMPTY (preserves edits, EC-007)', async () => {
    const writeRequest = vi.fn((): Result<void> => ok(undefined))
    const adapter = mockAdapter({
      readOpenRequests: () => [
        snapshot({ body: undefined }),
        snapshot({ endpointId: 'put /x', method: 'put', body: undefined }),
      ],
      isRequestBodyEmpty: (id) => id === 'post /users', // only this one is empty
      writeRequest,
    })
    const { service } = setup(adapter)
    await service.saveDraft({
      endpointId: 'post /users',
      method: 'post',
      environmentId: 'default',
      body: 'B1',
      updatedAt: NOW,
    })
    await service.saveDraft({
      endpointId: 'put /x',
      method: 'put',
      environmentId: 'default',
      body: 'B2',
      updatedAt: NOW,
    })

    const result = await service.autoRestoreOpen('default')

    expect(result).toEqual({ ok: true, value: 1 })
    expect(writeRequest).toHaveBeenCalledTimes(1)
    expect(writeRequest).toHaveBeenCalledWith(
      'post /users',
      expect.objectContaining({ body: 'B1' }),
    )
  })
})

describe('RequestService — templates', () => {
  const record = {
    endpointId: 'post /users',
    method: 'post',
    environmentId: 'default',
    body: '{"t":1}',
    updatedAt: NOW,
  }

  it('saves, lists, and deletes templates', async () => {
    const { service, bus } = setup()
    const saved = vi.fn()
    const deleted = vi.fn()
    bus.subscribe('TEMPLATE_SAVED', saved)
    bus.subscribe('TEMPLATE_DELETED', deleted)

    const created = await service.saveTemplate('Create user', record)
    expect(created.ok).toBe(true)
    if (!created.ok) return
    expect(saved).toHaveBeenCalledWith({
      templateId: created.value.templateId,
      endpointId: 'post /users',
    })

    const list = await service.listTemplates()
    expect(list.ok && list.value.map((t) => t.name)).toEqual(['Create user'])

    await service.deleteTemplate(created.value.templateId)
    expect(deleted).toHaveBeenCalledWith({ templateId: created.value.templateId })
    const after = await service.listTemplates()
    expect(after.ok && after.value).toEqual([])
  })

  it('creates custom templates directly from input', async () => {
    const { service } = setup()
    const created = await service.createCustomTemplate({
      name: 'Custom Admin',
      endpointId: 'post /admin',
      method: 'post',
      environmentId: 'default',
      body: '{"admin":true}',
    })

    expect(created.ok).toBe(true)
    if (!created.ok) return
    expect(created.value.name).toBe('Custom Admin')
    expect(created.value.endpointId).toBe('post /admin')
    expect(created.value.body).toBe('{"admin":true}')
  })

  it('updates an existing template in place', async () => {
    const { service } = setup()
    const created = await service.createCustomTemplate({
      name: 'Initial Name',
      endpointId: 'post /users',
      method: 'post',
      environmentId: 'default',
      body: '{"name":"initial"}',
    })

    expect(created.ok).toBe(true)
    if (!created.ok) return

    const updated = await service.updateTemplate(created.value.templateId, {
      name: 'Updated Name',
      body: '{"name":"updated"}',
    })

    expect(updated.ok).toBe(true)
    if (!updated.ok) return
    expect(updated.value.name).toBe('Updated Name')
    expect(updated.value.body).toBe('{"name":"updated"}')
  })

  it('saves the first open request as a template', async () => {
    const { service } = setup(
      mockAdapter({ readOpenRequests: () => [snapshot({ body: '{"open":true}' })] }),
    )
    const created = await service.saveOpenAsTemplate('From open', 'default')
    expect(created.ok && created.value?.body).toBe('{"open":true}')
  })

  it('applies a template by navigating to and EXECUTING the operation', async () => {
    const replay = vi.fn((): Result<void> => ok(undefined))
    const { service } = setup(mockAdapter({ replay }))
    const created = await service.saveTemplate('T', record)
    expect(created.ok).toBe(true)
    if (!created.ok) return

    await service.applyTemplate(created.value.templateId)
    expect(replay).toHaveBeenCalledWith('post /users', '{"t":1}')
  })

  it('locates and fills a template in Swagger without executing', async () => {
    const openEndpoint = vi.fn((): Result<void> => ok(undefined))
    const writeRequest = vi.fn((): Result<void> => ok(undefined))
    const { service } = setup(mockAdapter({ openEndpoint, writeRequest }))

    const created = await service.saveTemplate('T', record)
    expect(created.ok).toBe(true)
    if (!created.ok) return

    const located = await service.locateAndFill(created.value.templateId)
    expect(located.ok).toBe(true)
    expect(openEndpoint).toHaveBeenCalledWith('post /users')
    expect(writeRequest).toHaveBeenCalledWith(
      'post /users',
      expect.objectContaining({ body: '{"t":1}' }),
    )
  })

  it('resolves {{VAR}} and dynamic system variables when applying a template (DD-032)', async () => {
    const replay = vi.fn((): Result<void> => ok(undefined))
    const storage = new StorageService({ area: createFakeArea(), now: () => NOW })
    const bus = new EventBus()
    const service = new RequestService({
      storage,
      adapter: mockAdapter({ replay }),
      projectId: PROJECT,
      bus,
      now: () => NOW,
      resolveVariables: (text, envId) => {
        if (envId === 'qa') {
          return ok({ text: text.replace('{{USER_ID}}', 'qa_usr_456'), missing: [] })
        }
        return ok({ text: text.replace('{{USER_ID}}', 'usr_123'), missing: [] })
      },
    })

    const tpl = await service.saveTemplate('User Create', {
      endpointId: 'post /users',
      method: 'post',
      environmentId: 'default',
      body: '{"id":"{{USER_ID}}","trace":"{{$timestamp}}"}',
      updatedAt: NOW,
    })
    expect(tpl.ok).toBe(true)
    if (!tpl.ok) return

    // Apply with default environment
    await service.applyTemplate(tpl.value.templateId)
    expect(replay).toHaveBeenCalledWith(
      'post /users',
      `{"id":"usr_123","trace":"${Math.floor(NOW / 1000)}"}`,
    )

    // Apply with QA environment override
    await service.applyTemplate(tpl.value.templateId, undefined, 'qa')
    expect(replay).toHaveBeenCalledWith(
      'post /users',
      `{"id":"qa_usr_456","trace":"${Math.floor(NOW / 1000)}"}`,
    )
  })

  it('resolves {{VAR}} and dynamic variables when locating and filling a template', async () => {
    const openEndpoint = vi.fn((): Result<void> => ok(undefined))
    const writeRequest = vi.fn((): Result<void> => ok(undefined))
    const storage = new StorageService({ area: createFakeArea(), now: () => NOW })
    const bus = new EventBus()
    const service = new RequestService({
      storage,
      adapter: mockAdapter({ openEndpoint, writeRequest }),
      projectId: PROJECT,
      bus,
      now: () => NOW,
      resolveVariables: (text) =>
        ok({ text: text.replace('{{TOKEN}}', 'secret-jwt'), missing: [] }),
    })

    const tpl = await service.saveTemplate('Auth Request', {
      endpointId: 'post /items',
      method: 'post',
      environmentId: 'default',
      body: '{"token":"{{TOKEN}}","time":"{{$timestamp}}"}',
      headers: { Authorization: 'Bearer {{TOKEN}}' },
      updatedAt: NOW,
    })
    expect(tpl.ok).toBe(true)
    if (!tpl.ok) return

    await service.locateAndFill(tpl.value.templateId)
    expect(openEndpoint).toHaveBeenCalledWith('post /items')
    expect(writeRequest).toHaveBeenCalledWith(
      'post /items',
      expect.objectContaining({
        body: `{"token":"secret-jwt","time":"${Math.floor(NOW / 1000)}"}`,
        headers: { Authorization: 'Bearer secret-jwt' },
      }),
    )
  })

  it('resolves {{VAR}} in path and query parameters and passes them to replay when applying', async () => {
    const replay = vi.fn(() => ok(undefined))
    const adapter = mockAdapter({ replay })
    const storage = new StorageService({ area: createFakeArea(), now: () => NOW })
    const bus = new EventBus()
    const service = new RequestService({
      storage,
      adapter,
      bus,
      projectId: PROJECT,
      now: () => NOW,
      resolveVariables: (text) => {
        let res = text.replace('{{TEAM}}', 'engineering')
        res = res.replace('{{USER}}', 'usr_42')
        res = res.replace('{{FLAG}}', 'true')
        return ok({ text: res, missing: [] })
      },
    })

    const tpl = await service.saveTemplate('Promote Member', {
      endpointId: 'patch /teams/{team_id}/members/{user_id}/promote',
      method: 'patch',
      environmentId: 'default',
      path: { team_id: '{{TEAM}}', user_id: '{{USER}}' },
      query: { dry_run: '{{FLAG}}' },
      body: '{"role":"admin"}',
      updatedAt: NOW,
    })
    expect(tpl.ok).toBe(true)
    if (!tpl.ok) return

    await service.applyTemplate(tpl.value.templateId)
    expect(replay).toHaveBeenCalledWith(
      'patch /teams/{team_id}/members/{user_id}/promote',
      '{"role":"admin"}',
      { team_id: 'engineering', user_id: 'usr_42' },
      { dry_run: 'true' },
    )
  })
})


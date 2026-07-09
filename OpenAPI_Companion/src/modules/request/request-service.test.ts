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

  it('captures every open operation with a non-empty body', async () => {
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

  it('skips oversized bodies during autosave (EC-015)', async () => {
    const adapter = mockAdapter({
      readOpenRequests: () => [
        snapshot({ body: 'x'.repeat(300 * 1024) }),
        snapshot({ endpointId: 'get /small', method: 'get', body: '{}' }),
      ],
    })
    const { service } = setup(adapter)

    const result = await service.captureOpen('default')
    expect(result).toEqual({ ok: true, value: 1 }) // only the small one saved
    expect(await service.getDraft('default', 'post /users')).toEqual({ ok: true, value: null })
  })

  it('isolates drafts per environment', async () => {
    const { service } = setup()
    await service.saveDraft({
      endpointId: 'post /users',
      method: 'post',
      environmentId: 'prod',
      body: 'P',
      updatedAt: NOW,
    })
    expect(await service.getDraft('default', 'post /users')).toEqual({ ok: true, value: null })
    const prod = await service.getDraft('prod', 'post /users')
    expect(prod.ok && prod.value?.body).toBe('P')
  })
})

describe('RequestService — restore', () => {
  it('writes the stored draft into Swagger and emits REQUEST_RESTORED', async () => {
    const writeRequest = vi.fn((): Result<void> => ok(undefined))
    const { service, bus } = setup(mockAdapter({ writeRequest }))
    const restored = vi.fn()
    bus.subscribe('REQUEST_RESTORED', restored)
    await service.saveDraft({
      endpointId: 'post /users',
      method: 'post',
      environmentId: 'default',
      body: '{"a":1}',
      updatedAt: NOW,
    })

    const result = await service.restore('default', 'post /users')

    expect(result.ok && result.value?.body).toBe('{"a":1}')
    expect(writeRequest).toHaveBeenCalledWith(
      'post /users',
      expect.objectContaining({ body: '{"a":1}' }),
    )
    expect(restored).toHaveBeenCalledWith({ endpointId: 'post /users', environmentId: 'default' })
  })

  it('returns null restoring an endpoint with no draft', async () => {
    const { service } = setup()
    expect(await service.restore('default', 'get /nope')).toEqual({ ok: true, value: null })
  })

  it('auto-restores only into open operations with an empty body', async () => {
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
})

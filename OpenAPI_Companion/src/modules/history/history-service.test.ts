import { describe, it, expect, vi } from 'vitest'
import { HistoryService, type HistoryInput } from './history-service'
import { StorageService } from '@/core/storage'
import { EventBus } from '@/core/events'
import { ok, type Result } from '@/types'
import type { ExecutedResponse, SwaggerAdapter } from '@/adapters'
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

function setup(adapter: SwaggerAdapter = mockAdapter(), max = 100) {
  const storage = new StorageService({ area: createFakeArea(), now: () => NOW })
  const bus = new EventBus()
  const service = new HistoryService({
    storage,
    adapter,
    projectId: PROJECT,
    bus,
    now: () => NOW,
    max,
  })
  return { storage, bus, service }
}

const input = (over: Partial<HistoryInput> = {}): HistoryInput => ({
  endpointId: 'post /users',
  method: 'post',
  endpoint: '/users',
  status: 201,
  environmentId: 'default',
  requestBody: '{"a":1}',
  responseBody: '{"id":7}',
  ...over,
})

describe('HistoryService', () => {
  it('records an execution and publishes HISTORY_RECORDED', async () => {
    const { service, bus } = setup()
    const recorded = vi.fn()
    bus.subscribe('HISTORY_RECORDED', recorded)

    const result = await service.record(input())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(recorded).toHaveBeenCalledWith({
      recordId: result.value.id,
      endpointId: 'post /users',
      status: 201,
    })

    const list = await service.list()
    expect(list.ok && list.value).toHaveLength(1)
    const full = await service.get(result.value.id)
    expect(full.ok && full.value?.responseBody).toBe('{"id":7}')
  })

  it('caps the history as a ring buffer, evicting oldest records', async () => {
    const { service } = setup(mockAdapter(), 2)
    const a = await service.record(input({ status: 1 }))
    await service.record(input({ status: 2 }))
    await service.record(input({ status: 3 }))

    const list = await service.list()
    expect(list.ok && list.value.map((e) => e.status)).toEqual([3, 2]) // newest first, oldest gone
    if (a.ok) expect(await service.get(a.value.id)).toEqual({ ok: true, value: null }) // evicted
  })

  it('captures executed responses and de-duplicates identical ones', async () => {
    const executed: ExecutedResponse[] = [
      {
        endpointId: 'get /ping',
        method: 'get',
        endpoint: '/ping',
        status: 200,
        responseBody: 'pong',
      },
    ]
    const { service } = setup(mockAdapter({ readExecutedResponses: () => executed }))

    expect(await service.captureExecuted('default')).toEqual({ ok: true, value: 1 })
    expect(await service.captureExecuted('default')).toEqual({ ok: true, value: 0 }) // same → skipped

    const list = await service.list()
    expect(list.ok && list.value).toHaveLength(1)
  })

  it('searches and filters history', async () => {
    const { service } = setup()
    await service.record(
      input({ endpointId: 'post /users', method: 'post', endpoint: '/users', status: 201 }),
    )
    await service.record(
      input({ endpointId: 'get /ping', method: 'get', endpoint: '/ping', status: 200 }),
    )

    const byMethod = await service.list({ method: 'get' })
    expect(byMethod.ok && byMethod.value.map((e) => e.endpoint)).toEqual(['/ping'])
    const byText = await service.list({ text: 'users' })
    expect(byText.ok && byText.value.map((e) => e.endpoint)).toEqual(['/users'])
  })

  it('replays a record by navigating to and auto-executing the operation', async () => {
    const replay = vi.fn((): Result<void> => ok(undefined))
    const { service, bus } = setup(mockAdapter({ replay }))
    const replayed = vi.fn()
    bus.subscribe('REQUEST_REPLAYED', replayed)
    const rec = await service.record(input())
    if (!rec.ok) return

    const result = await service.replay(rec.value.id)
    expect(result.ok).toBe(true)
    expect(replay).toHaveBeenCalledWith('post /users', '{"a":1}')
    expect(replayed).toHaveBeenCalledWith({ sourceId: rec.value.id, newRecordId: rec.value.id })
  })

  it('truncates oversized bodies with a marker (EC-015)', async () => {
    const { service } = setup()
    const huge = 'x'.repeat(300 * 1024)
    const rec = await service.record(input({ responseBody: huge }))
    expect(rec.ok).toBe(true)
    if (!rec.ok) return
    expect(rec.value.responseBody!.length).toBeLessThan(huge.length)
    expect(rec.value.responseBody).toContain('[truncated by OpenAPI Companion]')
    expect(rec.value.requestBody).toBe('{"a":1}') // small body untouched
  })

  it('deletes a single entry', async () => {
    const { service } = setup()
    const rec = await service.record(input())
    if (!rec.ok) return
    await service.deleteEntry(rec.value.id)
    const after = await service.list()
    expect(after.ok && after.value).toEqual([])
    expect(await service.get(rec.value.id)).toEqual({ ok: true, value: null })
  })

  it('clears all project history and emits HISTORY_CLEARED', async () => {
    const { service, bus } = setup()
    const cleared = vi.fn()
    bus.subscribe('HISTORY_CLEARED', cleared)
    await service.record(input())
    await service.record(input({ status: 200 }))

    await service.clearProject()
    const after = await service.list()
    expect(after.ok && after.value).toEqual([])
    expect(cleared).toHaveBeenCalledWith({ projectId: PROJECT })
  })
})

import { describe, it, expect, vi } from 'vitest'
import { ok, type Result } from '@/types'
import { StorageService } from '@/core/storage'
import { EventBus } from '@/core/events'
import { createFakeArea } from '@/tests/fake-storage'
import type { AuthSnapshot, EndpointInfo, RequestSnapshot, SwaggerAdapter } from '@/adapters'
import { ProductivityService } from './productivity-service'

const NOW = 1_000

const ENDPOINTS: EndpointInfo[] = [
  { endpointId: 'get /users', method: 'get', path: '/users', summary: 'List users', tag: 'Users' },
  {
    endpointId: 'post /users',
    method: 'post',
    path: '/users',
    summary: 'Create user',
    tag: 'Users',
  },
  {
    endpointId: 'get /orders',
    method: 'get',
    path: '/orders',
    summary: 'List orders',
    tag: 'Orders',
  },
]

type MockAdapter = SwaggerAdapter & { openEndpoint: ReturnType<typeof vi.fn> }

function mockAdapter(over: Partial<SwaggerAdapter> = {}): MockAdapter {
  const openEndpoint = vi.fn((): Result<void> => ok(undefined))
  const adapter: SwaggerAdapter = {
    detect: () => true,
    version: () => null,
    specUrl: () => null,
    readAuth: () => null,
    writeAuth: (): Result<void> => ok(undefined),
    clearAuth: (): Result<void> => ok(undefined),
    readOpenRequests: (): RequestSnapshot[] => [],
    writeRequest: (): Result<void> => ok(undefined),
    replay: (): Result<void> => ok(undefined),
    isRequestBodyEmpty: () => true,
    readExecutedResponses: () => [],
    listEndpoints: () => ENDPOINTS,
    openEndpoint,
    observe: () => () => {},
    ...over,
  }
  return adapter as MockAdapter
}

function makeService(adapter: SwaggerAdapter, bus = new EventBus()) {
  const storage = new StorageService({ area: createFakeArea(), now: () => NOW })
  const service = new ProductivityService({
    adapter,
    storage,
    projectId: 'p1',
    bus,
    now: () => NOW,
    maxRecents: 3,
    baseUrl: 'https://api.example.com',
  })
  return { service, storage, bus }
}

describe('ProductivityService.search', () => {
  it('returns all endpoints for an empty query and filters by text', () => {
    const { service } = makeService(mockAdapter())
    expect(service.search('').length).toBe(3)
    expect(service.search('order').map((e) => e.endpointId)).toEqual(['get /orders'])
    expect(service.search('user').map((e) => e.endpointId)).toEqual(['get /users', 'post /users'])
  })

  it('filters by HTTP method, alone or combined with text', () => {
    const { service } = makeService(mockAdapter())
    expect(service.search('', 'get').map((e) => e.endpointId)).toEqual([
      'get /users',
      'get /orders',
    ])
    expect(service.search('', 'post').map((e) => e.endpointId)).toEqual(['post /users'])
    expect(service.search('user', 'get').map((e) => e.endpointId)).toEqual(['get /users'])
    expect(service.search('', 'delete')).toEqual([])
  })

  it('surfaces favorites first', async () => {
    const { service } = makeService(mockAdapter())
    await service.init()
    await service.toggleFavorite(ENDPOINTS[2]!) // /orders
    expect(service.search('')[0]?.endpointId).toBe('get /orders')
  })
})

describe('ProductivityService favorites', () => {
  it('toggles, persists, emits, and reflects in getFavorites', async () => {
    const bus = new EventBus()
    const toggled = vi.fn()
    bus.subscribe('FAVORITE_TOGGLED', toggled)
    const { service, storage } = makeService(mockAdapter(), bus)
    await service.init()

    const on = await service.toggleFavorite(ENDPOINTS[0]!)
    expect(on).toEqual({ ok: true, value: true })
    expect(service.isFavorite('get /users')).toBe(true)
    expect(service.getFavorites().map((f) => f.endpointId)).toEqual(['get /users'])
    expect(toggled).toHaveBeenCalledWith({ endpointId: 'get /users', favorite: true })

    // Persisted: a fresh service picks it up after init.
    const reloaded = new ProductivityService({ adapter: mockAdapter(), storage, projectId: 'p1' })
    await reloaded.init()
    expect(reloaded.isFavorite('get /users')).toBe(true)

    const off = await service.toggleFavorite(ENDPOINTS[0]!)
    expect(off).toEqual({ ok: true, value: false })
    expect(service.getFavorites()).toEqual([])
  })
})

describe('ProductivityService recents', () => {
  it('records most-recent-first, dedups, caps, and emits', async () => {
    const bus = new EventBus()
    const updated = vi.fn()
    bus.subscribe('RECENT_UPDATED', updated)
    const { service } = makeService(mockAdapter(), bus)
    await service.init()

    await service.recordRecent(ENDPOINTS[0]!)
    await service.recordRecent(ENDPOINTS[1]!)
    await service.recordRecent(ENDPOINTS[2]!)
    await service.recordRecent(ENDPOINTS[0]!) // move to front (dedup)

    // maxRecents=3, so the oldest distinct (/users create at pos) is evicted.
    expect(service.getRecents().map((r) => r.endpointId)).toEqual([
      'get /users',
      'get /orders',
      'post /users',
    ])
    expect(updated).toHaveBeenCalledTimes(4)
  })

  it('open() records a recent and navigates via the adapter', async () => {
    const adapter = mockAdapter()
    const { service } = makeService(adapter)
    await service.init()

    const result = await service.open(ENDPOINTS[1]!)
    expect(result.ok).toBe(true)
    expect(adapter.openEndpoint).toHaveBeenCalledWith('post /users')
    expect(service.getRecents()[0]?.endpointId).toBe('post /users')
  })
})

describe('ProductivityService.generateCode', () => {
  it('assembles URL, auth header, and open body', () => {
    const auth: AuthSnapshot = { type: 'bearer', token: 'TKN' }
    const adapter = mockAdapter({
      readAuth: () => auth,
      readOpenRequests: () => [{ endpointId: 'post /users', method: 'post', body: '{"a":1}' }],
    })
    const { service } = makeService(adapter)

    const curl = service.generateCode('curl', 'post /users')
    expect(curl.ok).toBe(true)
    if (!curl.ok) return
    expect(curl.value).toContain("curl -X POST 'https://api.example.com/users'")
    expect(curl.value).toContain("-H 'Authorization: Bearer TKN'")
    expect(curl.value).toContain(`-d '{"a":1}'`)
  })
})

import { describe, it, expect } from 'vitest'
import { ok, type Result } from '@/types'
import { StorageService } from '@/core/storage'
import { createFakeArea } from '@/tests/fake-storage'
import type { EndpointInfo, SwaggerAdapter } from '@/adapters'
import { ProductivityService } from '@/modules/productivity'
import { HistoryService } from '@/modules/history'

/**
 * NFR performance targets (T-10.2, planning/13 §6, EC-039/EC-023). Thresholds
 * are the SPEC targets; CI machines vary, so each assertion runs the operation
 * several times and takes the best run (steady-state, JIT-warmed) to avoid
 * flakes while still catching real regressions in algorithmic complexity.
 */

function bestOf(runs: number, fn: () => void): number {
  let best = Infinity
  for (let i = 0; i < runs; i++) {
    const start = performance.now()
    fn()
    best = Math.min(best, performance.now() - start)
  }
  return best
}

function bigAdapter(count: number): SwaggerAdapter {
  const endpoints: EndpointInfo[] = Array.from({ length: count }, (_, i) => ({
    endpointId: `get /resource-${i}/items`,
    method: i % 4 === 0 ? 'post' : 'get',
    path: `/resource-${i}/items`,
    summary: `Operation number ${i}`,
    tag: `Tag${i % 20}`,
  }))
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
    listEndpoints: () => endpoints,
    openEndpoint: (): Result<void> => ok(undefined),
    observe: () => () => {},
  }
}

describe('performance targets', () => {
  it('endpoint search stays under 50 ms at 5,000 endpoints (EC-039)', () => {
    const storage = new StorageService({ area: createFakeArea() })
    const service = new ProductivityService({
      adapter: bigAdapter(5000),
      storage,
      projectId: 'perf',
      baseUrl: 'https://x',
    })
    const elapsed = bestOf(5, () => {
      const hits = service.search('resource-4999')
      expect(hits.length).toBeGreaterThan(0)
    })
    expect(elapsed).toBeLessThan(50)
  })

  it('history list + search stays under 100 ms at 1,000 entries (EC-023)', async () => {
    const storage = new StorageService({ area: createFakeArea(), now: () => 1 })
    const service = new HistoryService({
      adapter: bigAdapter(0),
      storage,
      projectId: 'perf',
      now: () => 1,
      max: 1000,
    })
    for (let i = 0; i < 1000; i++) {
      await service.record({
        endpointId: `get /e${i}`,
        method: 'get',
        endpoint: `/e${i}`,
        status: 200,
        environmentId: 'default',
      })
    }
    const start = performance.now()
    const all = await service.list({})
    const filtered = await service.list({ text: '/e999', method: 'get' })
    const elapsed = performance.now() - start
    expect(all.ok && all.value.length).toBe(1000)
    expect(filtered.ok && filtered.value.length).toBe(1)
    expect(elapsed).toBeLessThan(100)
  })

  it('code generation stays under 30 ms', () => {
    const storage = new StorageService({ area: createFakeArea() })
    const service = new ProductivityService({
      adapter: bigAdapter(5000),
      storage,
      projectId: 'perf',
      baseUrl: 'https://x',
    })
    const elapsed = bestOf(5, () => {
      const code = service.generateCode('curl', 'get /resource-1/items')
      expect(code.ok).toBe(true)
    })
    expect(elapsed).toBeLessThan(30)
  })
})

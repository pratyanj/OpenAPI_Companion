import { describe, it, expect, vi } from 'vitest'
import { ok, type Result } from '@/types'
import { EventBus } from '@/core/events'
import type { RequestSnapshot, SwaggerAdapter } from '@/adapters'
import { FakeDataService } from './fake-data-service'
import type { Rng } from './generators'

/** Adapter double whose open request and written body are configurable. */
function mockAdapter(open: RequestSnapshot[]) {
  const written: { endpointId: string; body: string }[] = []
  const adapter: SwaggerAdapter = {
    detect: () => true,
    version: () => null,
    specUrl: () => null,
    readAuth: () => null,
    writeAuth: (): Result<void> => ok(undefined),
    clearAuth: (): Result<void> => ok(undefined),
    readOpenRequests: () => open,
    writeRequest: (endpointId, data): Result<void> => {
      written.push({ endpointId, body: data.body ?? '' })
      return ok(undefined)
    },
    replay: (): Result<void> => ok(undefined),
    isRequestBodyEmpty: () => true,
    readExecutedResponses: () => [],
    listEndpoints: () => [],
    openEndpoint: (): Result<void> => ok(undefined),
    observe: () => () => {},
  }
  return { adapter, written }
}

function bodyOf(obj: unknown): RequestSnapshot {
  return { endpointId: 'post /users', method: 'post', body: JSON.stringify(obj) }
}

// Deterministic rng so generated values are stable within a test.
const rng: Rng = () => 0.42

describe('FakeDataService.previewOpenRequest', () => {
  it('lists top-level fields with detected generators', () => {
    const { adapter } = mockAdapter([bodyOf({ email: '', age: 0, note: 'x' })])
    const service = new FakeDataService({ adapter, rng })
    const preview = service.previewOpenRequest()
    expect(preview?.endpointId).toBe('post /users')
    expect(preview?.fields.map((f) => [f.key, f.generator])).toEqual([
      ['email', 'email'],
      ['age', 'integer'],
      ['note', null], // unsupported string
    ])
  })

  it('returns null when no open request has a JSON object body', () => {
    const { adapter } = mockAdapter([{ endpointId: 'get /x', method: 'get', body: 'not json' }])
    expect(new FakeDataService({ adapter, rng }).previewOpenRequest()).toBeNull()
    expect(
      new FakeDataService({ adapter: mockAdapter([]).adapter, rng }).previewOpenRequest(),
    ).toBeNull()
  })
})

describe('FakeDataService.generateAll', () => {
  it('fills placeholders, preserves manual edits, leaves unsupported fields, and emits an event', async () => {
    const { adapter, written } = mockAdapter([
      bodyOf({ email: '', name: 'Jane Doe', count: 0, note: 'keepme' }),
    ])
    const bus = new EventBus()
    const generated = vi.fn()
    bus.subscribe('FAKE_DATA_GENERATED', generated)
    const service = new FakeDataService({ adapter, bus, rng })

    const result = await service.generateAll()
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.fieldCount).toBe(2) // email + count (name/note preserved)

    const out = JSON.parse(written.at(-1)!.body)
    expect(out.email).toMatch(/@/)
    expect(Number.isInteger(out.count)).toBe(true)
    expect(out.count).not.toBe(0)
    expect(out.name).toBe('Jane Doe') // manual edit preserved
    expect(out.note).toBe('keepme') // unsupported, unchanged
    expect(generated).toHaveBeenCalledWith({ endpointId: 'post /users', fieldCount: 2 })
  })

  it('overwrite=true also replaces non-placeholder values (but not unsupported)', async () => {
    const { adapter, written } = mockAdapter([bodyOf({ name: 'Jane Doe', note: 'keepme' })])
    const service = new FakeDataService({ adapter, rng })

    const result = await service.generateAll({ overwrite: true })
    expect(result.ok && result.value.fieldCount).toBe(1) // name (note has no generator)
    const out = JSON.parse(written.at(-1)!.body)
    expect(out.name).not.toBe('Jane Doe')
    expect(out.note).toBe('keepme')
  })

  it('recurses into nested objects and arrays', async () => {
    const { adapter, written } = mockAdapter([
      bodyOf({ user: { email: '', profile: { city: '' } }, emails: ['', ''] }),
    ])
    const service = new FakeDataService({ adapter, rng })

    const result = await service.generateAll()
    expect(result.ok && result.value.fieldCount).toBe(4) // user.email, profile.city, 2× emails[]
    const out = JSON.parse(written.at(-1)!.body)
    expect(out.user.email).toMatch(/@/)
    expect(out.user.profile.city).not.toBe('')
    expect(out.emails.every((e: string) => e.includes('@'))).toBe(true)
  })

  it('errors when there is no open JSON request', async () => {
    const { adapter } = mockAdapter([])
    const result = await new FakeDataService({ adapter, rng }).generateAll()
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('FAKE_DATA_NO_REQUEST')
  })
})

describe('FakeDataService.regenerateField', () => {
  it('overwrites a single field and leaves the rest untouched', async () => {
    const { adapter, written } = mockAdapter([bodyOf({ email: 'a@b.com', city: 'Paris' })])
    const service = new FakeDataService({ adapter, rng })

    const result = await service.regenerateField('email')
    expect(result.ok && result.value.fieldCount).toBe(1)
    const out = JSON.parse(written.at(-1)!.body)
    expect(out.email).not.toBe('a@b.com')
    expect(out.email).toMatch(/@/)
    expect(out.city).toBe('Paris')
  })
})

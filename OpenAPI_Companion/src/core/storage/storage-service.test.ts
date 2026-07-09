import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { StorageService } from './storage-service'
import { EventBus } from '@/core/events'
import { createFakeArea } from '@/tests/fake-storage'
import type { AsyncStorageArea } from './types'

const NOW = 1_700_000_000_000
const APP = '0.1.0'

function make(area: AsyncStorageArea, overrides = {}) {
  return new StorageService({
    area,
    appVersion: APP,
    now: () => NOW,
    debounceMs: 1000,
    ...overrides,
  })
}

describe('StorageService', () => {
  let area: AsyncStorageArea

  beforeEach(() => {
    area = createFakeArea()
  })

  it('round-trips a value inside a versioned envelope', async () => {
    const s = make(area)
    await s.set('settings/theme', { theme: 'dark' }, { immediate: true })

    const got = await s.get<{ theme: string }>('settings/theme')
    expect(got.ok).toBe(true)
    if (!got.ok) return
    expect(got.value).toEqual({
      schemaVersion: 1,
      createdVersion: APP,
      updatedVersion: APP,
      updatedAt: NOW,
      data: { theme: 'dark' },
    })
  })

  it('getData unwraps the payload, or null when absent', async () => {
    const s = make(area)
    expect(await s.getData('missing')).toEqual({ ok: true, value: null })
    await s.set('k', 42, { immediate: true })
    expect(await s.getData<number>('k')).toEqual({ ok: true, value: 42 })
  })

  it('coalesces rapid writes to one batched area.set (last value wins)', async () => {
    const s = make(area)
    const setSpy = vi.spyOn(area, 'set')

    void s.set('k', 1)
    void s.set('k', 2)
    void s.set('other', 'x')
    await s.flush()

    expect(setSpy).toHaveBeenCalledTimes(1)
    expect(await s.getData<number>('k')).toEqual({ ok: true, value: 2 })
    expect(await s.getData<string>('other')).toEqual({ ok: true, value: 'x' })
  })

  it('reads a queued-but-unflushed write (write-through consistency)', async () => {
    const s = make(area)
    void s.set('k', 'pending')
    const got = await s.getData<string>('k')
    expect(got).toEqual({ ok: true, value: 'pending' })
  })

  it('removes a key and reflects it before flush', async () => {
    const s = make(area)
    await s.set('k', 1, { immediate: true })
    void s.remove('k')
    expect(await s.getData('k')).toEqual({ ok: true, value: null })
    await s.flush()
    expect(await s.getData('k')).toEqual({ ok: true, value: null })
  })

  it('lists keys by prefix (including pending, excluding removed)', async () => {
    const s = make(area)
    await s.set('projects/p1/history/r1', 1, { immediate: true })
    await s.set('projects/p1/history/r2', 2, { immediate: true })
    await s.set('projects/p2/history/r1', 3, { immediate: true })

    const listed = await s.list('projects/p1/')
    expect(listed.ok).toBe(true)
    if (!listed.ok) return
    expect(listed.value.sort()).toEqual(['projects/p1/history/r1', 'projects/p1/history/r2'])
  })

  it('reports byte usage for a prefix', async () => {
    const s = make(area)
    await s.set('projects/p1/x', { a: 'hello world' }, { immediate: true })
    const bytes = await s.getBytesInUse('projects/p1/')
    expect(bytes.ok).toBe(true)
    if (!bytes.ok) return
    expect(bytes.value).toBeGreaterThan(0)
  })

  it('flags corrupt (non-envelope) values instead of returning them', async () => {
    area = createFakeArea({ 'settings/theme': { not: 'an envelope' } })
    const s = make(area)
    const got = await s.get('settings/theme')
    expect(got.ok).toBe(false)
    if (got.ok) return
    expect(got.error.code).toBe('STORAGE_CORRUPT')
  })

  it('getOrSeed seeds a default when missing or corrupt', async () => {
    area = createFakeArea({ 'settings/theme': 'corrupt-string' })
    const s = make(area)
    const seeded = await s.getOrSeed('settings/theme', () => ({ theme: 'light' }))
    expect(seeded.ok).toBe(true)
    if (!seeded.ok) return
    expect(seeded.value.data).toEqual({ theme: 'light' })
    // persisted
    expect(await s.getData('settings/theme')).toEqual({ ok: true, value: { theme: 'light' } })
  })

  it('serializes tasks per project via withLock', async () => {
    const s = make(area)
    const order: number[] = []
    const task = (id: number, delay: number) => async () => {
      await new Promise((r) => setTimeout(r, delay))
      order.push(id)
    }
    // Task 1 is slower but acquired the lock first — it must finish before task 2.
    const p1 = s.withLock('p', task(1, 20))
    const p2 = s.withLock('p', task(2, 1))
    await Promise.all([p1, p2])
    expect(order).toEqual([1, 2])
  })

  it('withLock surfaces a failing task as an error result', async () => {
    const s = make(area)
    const result = await s.withLock('p', async () => {
      throw new Error('nope')
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('LOCK_TASK_FAILED')
  })

  it('publishes STORAGE_QUOTA_WARNING when usage exceeds the threshold', async () => {
    const bus = new EventBus()
    const spy = vi.fn()
    bus.subscribe('STORAGE_QUOTA_WARNING', spy)
    const s = make(area, { bus, quotaWarnBytes: 1 })

    await s.set('k', { blob: 'x'.repeat(64) }, { immediate: true })

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0]?.[0].bytesInUse).toBeGreaterThan(0)
  })

  it('does not warn when usage is under the threshold', async () => {
    const bus = new EventBus()
    const spy = vi.fn()
    bus.subscribe('STORAGE_QUOTA_WARNING', spy)
    const s = make(area, { bus, quotaWarnBytes: 10_000_000 })

    await s.set('k', { small: true }, { immediate: true })

    expect(spy).not.toHaveBeenCalled()
  })

  it('returns a write error result when the area throws', async () => {
    vi.spyOn(area, 'set').mockRejectedValueOnce(new Error('disk full'))
    const s = make(area)
    const result = await s.set('k', 1, { immediate: true })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('STORAGE_WRITE')
  })
})

describe('StorageService debounce', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('defers the write until the debounce window elapses', async () => {
    const area = createFakeArea()
    const setSpy = vi.spyOn(area, 'set')
    const s = new StorageService({ area, appVersion: APP, now: () => NOW, debounceMs: 150 })

    void s.set('k', 1)
    expect(setSpy).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(150)
    expect(setSpy).toHaveBeenCalledTimes(1)
  })
})

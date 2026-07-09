import { ok, err, type Result, type AppError, type StorageEnvelope } from '@/types'
import { APP_VERSION, DEFAULT_DEBOUNCE_MS, QUOTA_WARN_BYTES } from '@/constants'
import type { EventBus } from '@/core/events'
import type { AsyncStorageArea, StorageServiceOptions } from './types'
import { wrap, isEnvelope } from './envelope'

const errors = {
  read: (cause?: unknown): AppError => ({
    code: 'STORAGE_READ',
    message: 'Failed to read from storage',
    recoverable: true,
    cause,
  }),
  write: (cause?: unknown): AppError => ({
    code: 'STORAGE_WRITE',
    message: 'Failed to write to storage',
    recoverable: true,
    cause,
  }),
  corrupt: (key: string): AppError => ({
    code: 'STORAGE_CORRUPT',
    message: `Stored value at "${key}" is not a valid envelope`,
    recoverable: true,
  }),
  lockTaskFailed: (cause?: unknown): AppError => ({
    code: 'LOCK_TASK_FAILED',
    message: 'A locked task failed',
    recoverable: true,
    cause,
  }),
}

/**
 * Centralized, namespaced, envelope-wrapped persistence (planning/08, 11).
 *
 * - Writes are DEBOUNCED and BATCHED: rapid `set`s to the same key coalesce and
 *   a single flush writes them all in one `area.set` (planning/08 §10).
 * - `withLock(projectId, fn)` serializes read-modify-write sequences per project
 *   to avoid multi-tab races (risk R-04).
 * - Reads are write-through-consistent: a value queued but not yet flushed is
 *   returned by `get`.
 * - Corrupt (non-envelope) values are reported (STORAGE_CORRUPT) rather than
 *   returned as data; `getOrSeed` reseeds a default (planning/08 §9, EC-020/021).
 * - No exceptions cross the boundary — everything returns a Result.
 */
export class StorageService {
  private readonly area: AsyncStorageArea
  private readonly bus: EventBus | undefined
  private readonly appVersion: string
  private readonly now: () => number
  private readonly debounceMs: number
  private readonly quotaWarnBytes: number

  private readonly pending = new Map<string, StorageEnvelope<unknown>>()
  private readonly removals = new Set<string>()
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private flushPromise: Promise<Result<void>> | null = null
  private flushResolve: ((result: Result<void>) => void) | null = null

  private readonly lockTails = new Map<string, Promise<void>>()

  constructor(options: StorageServiceOptions) {
    this.area = options.area
    this.bus = options.bus
    this.appVersion = options.appVersion ?? APP_VERSION
    this.now = options.now ?? (() => Date.now())
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS
    this.quotaWarnBytes = options.quotaWarnBytes ?? QUOTA_WARN_BYTES
  }

  async get<T>(key: string): Promise<Result<StorageEnvelope<T> | null>> {
    // Write-through consistency: reflect queued writes/removals first.
    if (this.pending.has(key)) {
      return ok(this.pending.get(key) as StorageEnvelope<T>)
    }
    if (this.removals.has(key)) return ok(null)
    try {
      const record = await this.area.get(key)
      const raw = record[key]
      if (raw === undefined) return ok(null)
      if (!isEnvelope(raw)) return err(errors.corrupt(key))
      return ok(raw as StorageEnvelope<T>)
    } catch (cause) {
      return err(errors.read(cause))
    }
  }

  /** Convenience: unwrap to the payload, or null when absent. Corrupt → error. */
  async getData<T>(key: string): Promise<Result<T | null>> {
    const result = await this.get<T>(key)
    if (!result.ok) return result
    return ok(result.value ? result.value.data : null)
  }

  set<T>(key: string, data: T, opts?: { immediate?: boolean }): Promise<Result<void>> {
    try {
      const previous = this.pending.get(key)
      const envelope = wrap(data, this.appVersion, this.now(), previous)
      this.pending.set(key, envelope)
      this.removals.delete(key)
      return opts?.immediate ? this.flush() : this.queueFlush()
    } catch (cause) {
      return Promise.resolve(err(errors.write(cause)))
    }
  }

  remove(key: string): Promise<Result<void>> {
    this.pending.delete(key)
    this.removals.add(key)
    return this.queueFlush()
  }

  /** Seed and persist a default when a key is missing or corrupt (EC-021). */
  async getOrSeed<T>(key: string, factory: () => T): Promise<Result<StorageEnvelope<T>>> {
    const existing = await this.get<T>(key)
    if (existing.ok && existing.value) return ok(existing.value)
    const setResult = await this.set(key, factory(), { immediate: true })
    if (!setResult.ok) return setResult
    const reread = await this.get<T>(key)
    if (reread.ok && reread.value) return ok(reread.value)
    return err(errors.read())
  }

  async list(prefix: string): Promise<Result<string[]>> {
    try {
      const all = await this.area.get(null)
      const keys = new Set(Object.keys(all).filter((k) => k.startsWith(prefix)))
      for (const k of this.pending.keys()) if (k.startsWith(prefix)) keys.add(k)
      for (const k of this.removals) keys.delete(k)
      return ok([...keys])
    } catch (cause) {
      return err(errors.read(cause))
    }
  }

  async getBytesInUse(prefix?: string): Promise<Result<number>> {
    try {
      if (!prefix) return ok(await this.area.getBytesInUse(null))
      const all = await this.area.get(null)
      const keys = Object.keys(all).filter((k) => k.startsWith(prefix))
      return ok(keys.length ? await this.area.getBytesInUse(keys) : 0)
    } catch (cause) {
      return err(errors.read(cause))
    }
  }

  /**
   * Serialize an async task against a project's key space so concurrent
   * read-modify-write sequences (e.g. across tabs within this context) don't
   * interleave. Flushes pending writes first so the task sees a consistent store.
   */
  async withLock<T>(projectId: string, fn: () => Promise<T>): Promise<Result<T>> {
    const previous = this.lockTails.get(projectId) ?? Promise.resolve()
    let releaseCurrent!: () => void
    const current = new Promise<void>((resolve) => {
      releaseCurrent = resolve
    })
    const chained = previous.then(() => current)
    this.lockTails.set(projectId, chained)

    await previous
    try {
      await this.flush()
      const value = await fn()
      return ok(value)
    } catch (cause) {
      return err(errors.lockTaskFailed(cause))
    } finally {
      releaseCurrent()
      // Best-effort cleanup so the map doesn't grow unbounded.
      if (this.lockTails.get(projectId) === chained) {
        this.lockTails.delete(projectId)
      }
    }
  }

  /** Force any queued writes to persist now. */
  async flush(): Promise<Result<void>> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    const resolve = this.flushResolve
    this.flushResolve = null
    this.flushPromise = null

    const items = Object.fromEntries(this.pending)
    this.pending.clear()
    const removals = [...this.removals]
    this.removals.clear()

    let result: Result<void>
    try {
      if (Object.keys(items).length > 0) await this.area.set(items)
      if (removals.length > 0) await this.area.remove(removals)
      result = ok(undefined)
    } catch (cause) {
      result = err(errors.write(cause))
    }

    // Unblock set() callers immediately; the quota probe is best-effort and
    // must not delay their write result.
    resolve?.(result)
    await this.checkQuota()
    return result
  }

  private queueFlush(): Promise<Result<void>> {
    if (!this.flushPromise) {
      this.flushPromise = new Promise<Result<void>>((resolve) => {
        this.flushResolve = resolve
      })
    }
    if (this.flushTimer) clearTimeout(this.flushTimer)
    this.flushTimer = setTimeout(() => {
      void this.flush()
    }, this.debounceMs)
    return this.flushPromise
  }

  private async checkQuota(): Promise<void> {
    if (!this.bus) return
    try {
      const bytesInUse = await this.area.getBytesInUse(null)
      if (bytesInUse >= this.quotaWarnBytes) {
        this.bus.publish('STORAGE_QUOTA_WARNING', { bytesInUse, quota: this.quotaWarnBytes })
      }
    } catch {
      // Quota checking is best-effort; never fail a write because of it.
    }
  }
}

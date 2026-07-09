import { ok, err, type Result, type AppError } from '@/types'
import { projectKey, type StorageService } from '@/core/storage'
import { MAX_HISTORY_ITEMS, MAX_SAVED_BODY_BYTES } from '@/constants'
import type { EventBus } from '@/core/events'
import type { SwaggerAdapter } from '@/adapters'
import type { HistoryEntry, HistoryQuery, HistoryRecord } from './types'

export interface HistoryServiceOptions {
  storage: StorageService
  adapter: SwaggerAdapter
  projectId: string
  bus?: EventBus
  now?: () => number
  max?: number
  debounceMs?: number
}

export interface HistoryInput {
  endpointId: string
  method: string
  endpoint: string
  status: number
  environmentId: string
  requestBody?: string
  responseBody?: string
  durationMs?: number
}

const notFound = (id: string): AppError => ({
  code: 'HISTORY_NOT_FOUND',
  message: `History record "${id}" not found`,
  recoverable: true,
})

/** EC-015: keep a single giant payload from bloating storage — truncate with a marker. */
function capBody(body: string | undefined): string | undefined {
  if (body == null || body.length <= MAX_SAVED_BODY_BYTES) return body
  return `${body.slice(0, MAX_SAVED_BODY_BYTES)}… [truncated by OpenAPI Companion]`
}

/**
 * Records every executed request+response, and supports search/replay/clear
 * (FR-009/010, FDD-004). A lightweight index (metadata) drives the list/search;
 * full records (incl. bodies) are stored separately and fetched on demand. The
 * index is a ring buffer capped at `max` (DD-031) — oldest entries auto-evict.
 * Replay re-populates the request (never executes it; never mutates templates).
 */
export class HistoryService {
  private readonly storage: StorageService
  private readonly adapter: SwaggerAdapter
  private readonly projectId: string
  private readonly bus: EventBus | undefined
  private readonly now: () => number
  private readonly max: number
  private readonly debounceMs: number
  private seq = 0
  private captureTimer: ReturnType<typeof setTimeout> | null = null
  private readonly lastSignature = new Map<string, string>()

  constructor(options: HistoryServiceOptions) {
    this.storage = options.storage
    this.adapter = options.adapter
    this.projectId = options.projectId
    this.bus = options.bus
    this.now = options.now ?? (() => Date.now())
    this.max = options.max ?? MAX_HISTORY_ITEMS
    this.debounceMs = options.debounceMs ?? 400
  }

  private indexKey(): string {
    return projectKey(this.projectId, 'history', 'index')
  }
  private recordKey(id: string): string {
    return projectKey(this.projectId, 'history', `record/${id}`)
  }

  private async readIndex(): Promise<HistoryEntry[]> {
    const got = await this.storage.getData<HistoryEntry[]>(this.indexKey())
    return got.ok && got.value ? got.value : []
  }

  async record(input: HistoryInput): Promise<Result<HistoryRecord>> {
    const id = `hist_${this.now()}_${this.seq++}`
    const entry: HistoryEntry = {
      id,
      endpointId: input.endpointId,
      method: input.method,
      endpoint: input.endpoint,
      status: input.status,
      durationMs: input.durationMs,
      timestamp: this.now(),
      environmentId: input.environmentId,
    }
    const full: HistoryRecord = {
      ...entry,
      requestBody: capBody(input.requestBody),
      responseBody: capBody(input.responseBody),
    }

    const next = [entry, ...(await this.readIndex())]
    const kept = next.slice(0, this.max)
    const evicted = next.slice(this.max)

    const written = await this.storage.set(this.recordKey(id), full, { immediate: true })
    if (!written.ok) return written
    for (const e of evicted) await this.storage.remove(this.recordKey(e.id))
    const indexWritten = await this.storage.set(this.indexKey(), kept, { immediate: true })
    if (!indexWritten.ok) return indexWritten

    this.bus?.publish('HISTORY_RECORDED', {
      recordId: id,
      endpointId: input.endpointId,
      status: input.status,
    })
    return ok(full)
  }

  /** Debounced capture of executed responses currently rendered in Swagger. */
  scheduleCapture(environmentId: string): void {
    if (this.captureTimer) clearTimeout(this.captureTimer)
    this.captureTimer = setTimeout(() => void this.captureExecuted(environmentId), this.debounceMs)
  }

  async captureExecuted(environmentId: string): Promise<Result<number>> {
    let recorded = 0
    for (const res of this.adapter.readExecutedResponses()) {
      const signature = `${res.status}:${res.responseBody ?? ''}`
      if (this.lastSignature.get(res.endpointId) === signature) continue // already recorded
      this.lastSignature.set(res.endpointId, signature)
      const result = await this.record({
        endpointId: res.endpointId,
        method: res.method,
        endpoint: res.endpoint,
        status: res.status,
        environmentId,
        requestBody: res.requestBody,
        responseBody: res.responseBody,
        durationMs: res.durationMs,
      })
      if (result.ok) recorded++
    }
    return ok(recorded)
  }

  async list(query: HistoryQuery = {}): Promise<Result<HistoryEntry[]>> {
    const index = await this.readIndex()
    const text = query.text?.trim().toLowerCase()
    const filtered = index.filter((e) => {
      if (query.method && e.method !== query.method.toLowerCase()) return false
      if (query.from != null && e.timestamp < query.from) return false
      if (query.to != null && e.timestamp > query.to) return false
      if (text && !`${e.method} ${e.endpoint} ${e.status}`.toLowerCase().includes(text))
        return false
      return true
    })
    return ok(filtered)
  }

  async get(id: string): Promise<Result<HistoryRecord | null>> {
    const got = await this.storage.getData<HistoryRecord>(this.recordKey(id))
    if (!got.ok) return got.error.code === 'STORAGE_CORRUPT' ? ok(null) : got
    return ok(got.value)
  }

  /**
   * Navigate to the operation in Swagger and auto-execute it with the saved
   * request body (FR-010). The freshly-rendered response is picked up by the
   * normal capture path, creating a new history entry.
   */
  async replay(id: string): Promise<Result<HistoryRecord>> {
    const got = await this.get(id)
    if (!got.ok) return got
    if (!got.value) return err(notFound(id))
    const record = got.value
    const replayed = this.adapter.replay(record.endpointId, record.requestBody)
    if (!replayed.ok) return replayed
    this.bus?.publish('REQUEST_REPLAYED', { sourceId: id, newRecordId: id })
    return ok(record)
  }

  async deleteEntry(id: string): Promise<Result<void>> {
    const index = await this.readIndex()
    const removedRecord = await this.storage.remove(this.recordKey(id))
    if (!removedRecord.ok) return removedRecord
    return this.storage.set(
      this.indexKey(),
      index.filter((e) => e.id !== id),
      { immediate: true },
    )
  }

  async clearProject(): Promise<Result<void>> {
    const index = await this.readIndex()
    for (const e of index) await this.storage.remove(this.recordKey(e.id))
    const cleared = await this.storage.set(this.indexKey(), [], { immediate: true })
    if (!cleared.ok) return cleared
    this.lastSignature.clear()
    this.bus?.publish('HISTORY_CLEARED', { projectId: this.projectId })
    return ok(undefined)
  }
}

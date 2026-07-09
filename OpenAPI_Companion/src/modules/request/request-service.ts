import { ok, err, type Result, type AppError } from '@/types'
import { projectKey, type StorageService } from '@/core/storage'
import { MAX_SAVED_BODY_BYTES } from '@/constants'
import type { EventBus } from '@/core/events'
import type { RequestSnapshot, SwaggerAdapter } from '@/adapters'
import { stableId } from '@/utils'
import type { RequestRecord, RequestTemplate } from './types'

export interface RequestServiceOptions {
  storage: StorageService
  adapter: SwaggerAdapter
  projectId: string
  bus?: EventBus
  now?: () => number
  debounceMs?: number
}

const notFound = (endpointId: string): AppError => ({
  code: 'REQUEST_ENDPOINT_NOT_OPEN',
  message: `No open operation matching "${endpointId}"`,
  recoverable: true,
})

/**
 * Auto-saves and restores request data per endpoint + environment, and manages
 * named templates (FR-005/006, FDD-002). v1 focuses on the request body.
 *
 * Auto paths (restore/auto-restore) only populate fields — they never execute a
 * request; auto-restore-on-open only fills an EMPTY body, so it never clobbers
 * edits. The EXPLICIT "Apply template" action does execute (user-requested).
 */
export class RequestService {
  private readonly storage: StorageService
  private readonly adapter: SwaggerAdapter
  private readonly projectId: string
  private readonly bus: EventBus | undefined
  private readonly now: () => number
  private readonly debounceMs: number
  private autosaveTimer: ReturnType<typeof setTimeout> | null = null

  constructor(options: RequestServiceOptions) {
    this.storage = options.storage
    this.adapter = options.adapter
    this.projectId = options.projectId
    this.bus = options.bus
    this.now = options.now ?? (() => Date.now())
    this.debounceMs = options.debounceMs ?? 300
  }

  private draftKey(environmentId: string, endpointId: string): string {
    return projectKey(this.projectId, 'requests', `draft/${environmentId}/${endpointId}`)
  }
  private templatesPrefix(): string {
    return projectKey(this.projectId, 'requests', 'template/')
  }
  private templateKey(templateId: string): string {
    return `${this.templatesPrefix()}${templateId}`
  }

  async saveDraft(record: RequestRecord): Promise<Result<void>> {
    const written = await this.storage.set(
      this.draftKey(record.environmentId, record.endpointId),
      record,
      {
        immediate: true,
      },
    )
    if (!written.ok) return written
    this.bus?.publish('REQUEST_CHANGED', {
      endpointId: record.endpointId,
      environmentId: record.environmentId,
    })
    return ok(undefined)
  }

  getDraft(environmentId: string, endpointId: string): Promise<Result<RequestRecord | null>> {
    return this.readData<RequestRecord>(this.draftKey(environmentId, endpointId))
  }

  /** Debounced capture of every open operation's body (the auto-save path). */
  autosaveOpen(environmentId: string): void {
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer)
    this.autosaveTimer = setTimeout(() => {
      void this.captureOpen(environmentId)
    }, this.debounceMs)
  }

  async captureOpen(environmentId: string): Promise<Result<number>> {
    let saved = 0
    for (const snapshot of this.adapter.readOpenRequests()) {
      if (snapshot.body == null || snapshot.body === '') continue
      if (snapshot.body.length > MAX_SAVED_BODY_BYTES) continue // EC-015: skip oversized bodies
      const result = await this.saveDraft(this.toRecord(snapshot, environmentId))
      if (result.ok) saved++
    }
    return ok(saved)
  }

  /** Explicitly populate Swagger with the stored draft for an endpoint. */
  async restore(environmentId: string, endpointId: string): Promise<Result<RequestRecord | null>> {
    const got = await this.getDraft(environmentId, endpointId)
    if (!got.ok) return got
    if (!got.value) return ok(null)
    const injected = this.adapter.writeRequest(endpointId, this.toSnapshot(got.value))
    if (!injected.ok) return injected
    this.bus?.publish('REQUEST_RESTORED', { endpointId, environmentId })
    return ok(got.value)
  }

  /** On load: fill drafts into open operations whose body is still empty. */
  async autoRestoreOpen(environmentId: string): Promise<Result<number>> {
    let restored = 0
    for (const snapshot of this.adapter.readOpenRequests()) {
      if (!this.adapter.isRequestBodyEmpty(snapshot.endpointId)) continue
      const result = await this.restore(environmentId, snapshot.endpointId)
      if (result.ok && result.value) restored++
    }
    return ok(restored)
  }

  // --- Templates ---

  async saveTemplate(name: string, record: RequestRecord): Promise<Result<RequestTemplate>> {
    const templateId = stableId('tpl', name, record.endpointId, String(this.now()))
    const template: RequestTemplate = { ...record, templateId, name }
    const written = await this.storage.set(this.templateKey(templateId), template, {
      immediate: true,
    })
    if (!written.ok) return written
    this.bus?.publish('TEMPLATE_SAVED', { templateId, endpointId: record.endpointId })
    return ok(template)
  }

  /** Save the first open operation's request as a named template. */
  async saveOpenAsTemplate(
    name: string,
    environmentId: string,
  ): Promise<Result<RequestTemplate | null>> {
    const open = this.adapter.readOpenRequests().find((r) => r.body != null && r.body !== '')
    if (!open) return ok(null)
    return this.saveTemplate(name, this.toRecord(open, environmentId))
  }

  async listTemplates(): Promise<Result<RequestTemplate[]>> {
    const keys = await this.storage.list(this.templatesPrefix())
    if (!keys.ok) return keys
    const templates: RequestTemplate[] = []
    for (const key of keys.value) {
      const got = await this.readData<RequestTemplate>(key)
      if (got.ok && got.value) templates.push(got.value)
    }
    templates.sort((a, b) => a.name.localeCompare(b.name))
    return ok(templates)
  }

  async deleteTemplate(templateId: string): Promise<Result<void>> {
    const removed = await this.storage.remove(this.templateKey(templateId))
    if (!removed.ok) return removed
    this.bus?.publish('TEMPLATE_DELETED', { templateId })
    return ok(undefined)
  }

  /**
   * Apply = navigate to the operation, fill the saved body, and EXECUTE it (an
   * explicit user action, unlike auto-restore which only fills empty fields).
   */
  async applyTemplate(templateId: string, endpointId?: string): Promise<Result<void>> {
    const got = await this.readData<RequestTemplate>(this.templateKey(templateId))
    if (!got.ok) return got
    if (!got.value) return err(notFound(templateId))
    const target = endpointId ?? got.value.endpointId
    return this.adapter.replay(target, got.value.body)
  }

  // --- helpers ---

  private toRecord(snapshot: RequestSnapshot, environmentId: string): RequestRecord {
    return {
      endpointId: snapshot.endpointId,
      method: snapshot.method,
      environmentId,
      body: snapshot.body,
      query: snapshot.query,
      path: snapshot.path,
      headers: snapshot.headers,
      contentType: snapshot.contentType,
      updatedAt: this.now(),
    }
  }

  private toSnapshot(record: RequestRecord): RequestSnapshot {
    return {
      endpointId: record.endpointId,
      method: record.method,
      body: record.body,
      query: record.query,
      path: record.path,
      headers: record.headers,
      contentType: record.contentType,
    }
  }

  private async readData<T>(key: string): Promise<Result<T | null>> {
    const got = await this.storage.getData<T>(key)
    if (!got.ok) return got.error.code === 'STORAGE_CORRUPT' ? ok(null) : got
    return ok(got.value)
  }
}

import { ok, err, type Result, type AppError } from '@/types'
import { projectKey, type StorageService } from '@/core/storage'
import { MAX_SAVED_BODY_BYTES } from '@/constants'
import type { EventBus } from '@/core/events'
import type { EndpointInfo, RequestSnapshot, SwaggerAdapter } from '@/adapters'
import { substitute } from '@/modules/environment'
import { stableId } from '@/utils'
import type { CustomTemplateInput, RequestRecord, RequestTemplate } from './types'

export type VariableResolver = (
  text: string,
  environmentId: string,
) =>
  Promise<Result<{ text: string; missing: string[] }>> | Result<{ text: string; missing: string[] }>

export interface RequestServiceOptions {
  storage: StorageService
  adapter: SwaggerAdapter
  projectId: string
  bus?: EventBus
  now?: () => number
  debounceMs?: number
  resolveVariables?: VariableResolver
}

const notFound = (endpointId: string): AppError => ({
  code: 'REQUEST_ENDPOINT_NOT_OPEN',
  message: `No open operation matching "${endpointId}"`,
  recoverable: true,
})

const noOpenEndpoint = (): AppError => ({
  code: 'REQUEST_NO_OPEN_ENDPOINT',
  message: 'No operation is currently open',
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
  private readonly resolveVariables?: VariableResolver
  private autosaveTimer: ReturnType<typeof setTimeout> | null = null

  constructor(options: RequestServiceOptions) {
    this.storage = options.storage
    this.adapter = options.adapter
    this.projectId = options.projectId
    this.bus = options.bus
    this.now = options.now ?? (() => Date.now())
    this.debounceMs = options.debounceMs ?? 300
    this.resolveVariables = options.resolveVariables
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
    const snapshot = await this.toResolvedSnapshot(got.value, environmentId)
    const injected = this.adapter.writeRequest(endpointId, snapshot)
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

  /** Get the currently open operation (the one with non-empty body) */
  async getCurrentEndpoint(): Promise<
    Result<{ endpointId: string; method: string; endpoint: string }>
  > {
    const open = this.adapter.readOpenRequests().find((r) => r.body != null && r.body !== '')
    if (!open) return err(noOpenEndpoint())
    const path = open.endpointId.split(' ').slice(1).join(' ')
    return ok({
      endpointId: open.endpointId,
      method: open.method,
      endpoint: path || open.endpointId,
    })
  }

  /** List all currently open operations (endpoints that have been expanded) */
  async listOpenRequests(): Promise<Result<RequestSnapshot[]>> {
    return ok(this.adapter.readOpenRequests())
  }

  /** List all endpoints available in the Swagger document */
  async listEndpoints(): Promise<Result<EndpointInfo[]>> {
    return ok(this.adapter.listEndpoints())
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

  /** Create a custom template directly from user-specified fields. */
  async createCustomTemplate(input: CustomTemplateInput): Promise<Result<RequestTemplate>> {
    const trimmedName = input.name.trim()
    if (!trimmedName) {
      return err({
        code: 'REQUEST_INVALID_NAME',
        message: 'Template name is required',
        recoverable: true,
      })
    }
    const record: RequestRecord = {
      endpointId: input.endpointId,
      method: input.method,
      environmentId: input.environmentId,
      body: input.body,
      query: input.query,
      path: input.path,
      headers: input.headers,
      contentType: input.contentType,
      updatedAt: this.now(),
    }
    return this.saveTemplate(trimmedName, record)
  }

  /** Update an existing template in-place. */
  async updateTemplate(
    templateId: string,
    updates: Partial<
      Pick<
        RequestTemplate,
        'name' | 'body' | 'query' | 'headers' | 'path' | 'endpointId' | 'method' | 'description'
      >
    >,
  ): Promise<Result<RequestTemplate>> {
    const got = await this.readData<RequestTemplate>(this.templateKey(templateId))
    if (!got.ok) return got
    if (!got.value) return err(notFound(templateId))

    const existing = got.value
    let newName = existing.name
    if (updates.name !== undefined) {
      const trimmed = updates.name.trim()
      if (!trimmed) {
        return err({
          code: 'REQUEST_INVALID_NAME',
          message: 'Template name cannot be empty',
          recoverable: true,
        })
      }
      newName = trimmed
    }

    const updated: RequestTemplate = {
      ...existing,
      ...updates,
      name: newName,
      updatedAt: this.now(),
    }

    const written = await this.storage.set(this.templateKey(templateId), updated, {
      immediate: true,
    })
    if (!written.ok) return written
    this.bus?.publish('TEMPLATE_SAVED', { templateId, endpointId: updated.endpointId })
    return ok(updated)
  }

  /**
   * Apply = navigate to the operation, fill the saved body, and EXECUTE it (an
   * explicit user action, unlike auto-restore which only fills empty fields).
   * Resolves environment variables and dynamic system variables before running.
   */
  async applyTemplate(
    templateId: string,
    endpointId?: string,
    environmentId?: string,
  ): Promise<Result<void>> {
    const got = await this.readData<RequestTemplate>(this.templateKey(templateId))
    if (!got.ok) return got
    if (!got.value) return err(notFound(templateId))
    const target = endpointId ?? got.value.endpointId
    const envId = environmentId ?? got.value.environmentId
    const resolvedBody =
      got.value.body != null ? await this.resolveText(got.value.body, envId) : undefined
    return this.adapter.replay(target, resolvedBody)
  }

  /**
   * Locate & fill = navigate to the operation in Swagger and populate the saved
   * body/parameters WITHOUT executing it. Resolves environment variables and dynamic system variables.
   */
  async locateAndFill(templateId: string, environmentId?: string): Promise<Result<void>> {
    const got = await this.readData<RequestTemplate>(this.templateKey(templateId))
    if (!got.ok) return got
    if (!got.value) return err(notFound(templateId))
    const { endpointId, body } = got.value
    const opened = this.adapter.openEndpoint(endpointId)
    if (!opened.ok) return opened
    if (body != null) {
      const snapshot = await this.toResolvedSnapshot(
        got.value,
        environmentId ?? got.value.environmentId,
      )
      this.adapter.writeRequest(endpointId, snapshot)
    }
    return ok(undefined)
  }

  // --- helpers ---

  async resolveText(text: string, environmentId: string): Promise<string> {
    let current = text
    if (this.resolveVariables) {
      const res = await this.resolveVariables(text, environmentId)
      if (res.ok) current = res.value.text
    }
    return substitute(current, {}, { now: this.now }).text
  }

  private async resolveRecord(
    record: Record<string, string> | undefined,
    environmentId: string,
  ): Promise<Record<string, string> | undefined> {
    if (!record) return undefined
    const resolved: Record<string, string> = {}
    for (const [k, v] of Object.entries(record)) {
      resolved[k] = await this.resolveText(v, environmentId)
    }
    return resolved
  }

  private async toResolvedSnapshot(
    record: RequestRecord,
    environmentId?: string,
  ): Promise<RequestSnapshot> {
    const envId = environmentId ?? record.environmentId
    const body = record.body != null ? await this.resolveText(record.body, envId) : undefined
    const query = await this.resolveRecord(record.query, envId)
    const path = await this.resolveRecord(record.path, envId)
    const headers = await this.resolveRecord(record.headers, envId)
    return {
      endpointId: record.endpointId,
      method: record.method,
      body,
      query,
      path,
      headers,
      contentType: record.contentType,
    }
  }

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

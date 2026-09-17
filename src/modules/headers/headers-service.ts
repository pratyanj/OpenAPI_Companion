import { ok, err, type Result } from '@/types'
import { projectKey, type StorageService } from '@/core/storage'
import { stableId } from '@/utils'
import type { GlobalHeaderItem } from './types'

export interface HeadersServiceOptions {
  storage: StorageService
  projectId: string
}

export class HeadersService {
  private readonly storage: StorageService
  private readonly projectId: string
  private headers: GlobalHeaderItem[] = []
  private loaded = false

  constructor(options: HeadersServiceOptions) {
    this.storage = options.storage
    this.projectId = options.projectId
  }

  private storageKey(): string {
    return projectKey(this.projectId, 'global-headers')
  }

  async load(): Promise<GlobalHeaderItem[]> {
    const res = await this.storage.getData<GlobalHeaderItem[]>(this.storageKey())
    this.headers = res.ok && Array.isArray(res.value) ? res.value : []
    this.loaded = true
    return this.getHeaders()
  }

  getHeaders(): GlobalHeaderItem[] {
    return [...this.headers]
  }

  getActiveHeadersRecord(): Record<string, string> {
    const record: Record<string, string> = {}
    for (const h of this.headers) {
      if (h.enabled && h.name.trim()) {
        record[h.name.trim()] = h.value ?? ''
      }
    }
    return record
  }

  async saveHeaders(headers: GlobalHeaderItem[]): Promise<Result<GlobalHeaderItem[]>> {
    this.headers = headers.map((h, idx) => ({
      id: h.id || stableId('gh', h.name, String(Date.now()), String(idx)),
      name: h.name.trim(),
      value: h.value ?? '',
      enabled: Boolean(h.enabled),
      description: h.description,
    }))
    const res = await this.storage.set(this.storageKey(), this.headers, { immediate: true })
    if (!res.ok) return err(res.error)
    return ok(this.getHeaders())
  }

  async addHeader(header: Omit<GlobalHeaderItem, 'id'>): Promise<Result<GlobalHeaderItem>> {
    if (!this.loaded) await this.load()
    const item: GlobalHeaderItem = {
      id: stableId('gh', header.name, String(Date.now()), String(this.headers.length)),
      name: header.name.trim(),
      value: header.value ?? '',
      enabled: header.enabled ?? true,
      description: header.description,
    }
    this.headers.push(item)
    const res = await this.saveHeaders(this.headers)
    if (!res.ok) return err(res.error)
    return ok(item)
  }

  async toggleHeader(id: string, enabled: boolean): Promise<Result<void>> {
    if (!this.loaded) await this.load()
    const target = this.headers.find((h) => h.id === id)
    if (!target) return err(new Error(`Header with id ${id} not found`))
    target.enabled = enabled
    const res = await this.saveHeaders(this.headers)
    if (!res.ok) return err(res.error)
    return ok(undefined)
  }

  async deleteHeader(id: string): Promise<Result<void>> {
    if (!this.loaded) await this.load()
    this.headers = this.headers.filter((h) => h.id !== id)
    const res = await this.saveHeaders(this.headers)
    if (!res.ok) return err(res.error)
    return ok(undefined)
  }
}

import { ok, type Result } from '@/types'
import { projectKey, type StorageService } from '@/core/storage'
import type { EventBus } from '@/core/events'
import type { SwaggerAdapter } from '@/adapters'
import { generateCode } from './codegen'
import type {
  CodeGenRequest,
  CodeLang,
  EndpointInfo,
  EndpointListItem,
  FavoriteEntry,
  RecentEntry,
} from './types'

export interface ProductivityServiceOptions {
  adapter: SwaggerAdapter
  storage: StorageService
  projectId: string
  bus?: EventBus
  now?: () => number
  /** Max recent endpoints kept (ring buffer). */
  maxRecents?: number
  /** Base URL for generated code; defaults to the page origin. */
  baseUrl?: string
}

const DEFAULT_MAX_RECENTS = 10

/**
 * Productivity Tools (FDD-009, EPIC-08): endpoint search, favorites, recents,
 * and copy-as-code. The endpoint index comes live from the adapter (so it always
 * reflects the page); favorites/recents are persisted per project and cached in
 * memory so `search`/`getFavorites`/`getRecents` stay synchronous and fast
 * (< 50 ms even on large specs). Never mutates requests.
 */
export class ProductivityService {
  private readonly adapter: SwaggerAdapter
  private readonly storage: StorageService
  private readonly projectId: string
  private readonly bus: EventBus | undefined
  private readonly now: () => number
  private readonly maxRecents: number
  private readonly baseUrl: string

  private favorites = new Map<string, FavoriteEntry>()
  private recents: RecentEntry[] = []

  constructor(options: ProductivityServiceOptions) {
    this.adapter = options.adapter
    this.storage = options.storage
    this.projectId = options.projectId
    this.bus = options.bus
    this.now = options.now ?? (() => Date.now())
    this.maxRecents = options.maxRecents ?? DEFAULT_MAX_RECENTS
    this.baseUrl = options.baseUrl ?? (typeof location !== 'undefined' ? location.origin : '')
  }

  private favKey(): string {
    return projectKey(this.projectId, 'productivity', 'favorites')
  }
  private recentKey(): string {
    return projectKey(this.projectId, 'productivity', 'recents')
  }

  /** Load persisted favorites/recents into memory. Call once before use. */
  async init(): Promise<void> {
    const [favs, recents] = await Promise.all([
      this.storage.getData<FavoriteEntry[]>(this.favKey()),
      this.storage.getData<RecentEntry[]>(this.recentKey()),
    ])
    if (favs.ok && favs.value) this.favorites = new Map(favs.value.map((f) => [f.endpointId, f]))
    if (recents.ok && recents.value) this.recents = recents.value
  }

  private decorate(e: EndpointInfo): EndpointListItem {
    return { ...e, favorite: this.favorites.has(e.endpointId) }
  }

  /**
   * Search the endpoint index (favorites first). Empty query returns all;
   * `method` (e.g. "get"/"post") optionally restricts to one HTTP method.
   */
  search(query: string, method?: string): EndpointListItem[] {
    const q = query.trim().toLowerCase()
    const m = method?.trim().toLowerCase()
    const matched = this.adapter
      .listEndpoints()
      .map((e) => this.decorate(e))
      .filter((e) => {
        if (m && e.method.toLowerCase() !== m) return false
        if (
          q &&
          !`${e.method} ${e.path} ${e.summary ?? ''} ${e.tag ?? ''}`.toLowerCase().includes(q)
        )
          return false
        return true
      })
    // Stable sort: favorites first, otherwise keep document order.
    return matched
      .map((item, i) => ({ item, i }))
      .sort((a, b) => Number(b.item.favorite) - Number(a.item.favorite) || a.i - b.i)
      .map(({ item }) => item)
  }

  /** Favorited endpoints, most-recently-added first (enriched from the live index). */
  getFavorites(): EndpointListItem[] {
    const index = new Map(this.adapter.listEndpoints().map((e) => [e.endpointId, e]))
    return [...this.favorites.values()]
      .sort((a, b) => b.addedAt - a.addedAt)
      .map((f) => ({
        ...(index.get(f.endpointId) ?? {
          endpointId: f.endpointId,
          method: f.method,
          path: f.path,
        }),
        favorite: true,
      }))
  }

  /** Recently-opened endpoints, most-recent first. */
  getRecents(): EndpointListItem[] {
    const index = new Map(this.adapter.listEndpoints().map((e) => [e.endpointId, e]))
    return this.recents.map((r) => ({
      ...(index.get(r.endpointId) ?? { endpointId: r.endpointId, method: r.method, path: r.path }),
      favorite: this.favorites.has(r.endpointId),
    }))
  }

  isFavorite(endpointId: string): boolean {
    return this.favorites.has(endpointId)
  }

  /** Toggle favorite state; persists and emits FAVORITE_TOGGLED. Returns new state. */
  async toggleFavorite(e: EndpointInfo): Promise<Result<boolean>> {
    const nowFav = !this.favorites.has(e.endpointId)
    if (nowFav) {
      this.favorites.set(e.endpointId, {
        endpointId: e.endpointId,
        method: e.method,
        path: e.path,
        addedAt: this.now(),
      })
    } else {
      this.favorites.delete(e.endpointId)
    }
    const written = await this.storage.set(this.favKey(), [...this.favorites.values()], {
      immediate: true,
    })
    if (!written.ok) return written
    this.bus?.publish('FAVORITE_TOGGLED', { endpointId: e.endpointId, favorite: nowFav })
    return ok(nowFav)
  }

  /** Record an endpoint as recently used (dedup + ring-cap); emits RECENT_UPDATED. */
  async recordRecent(e: EndpointInfo): Promise<Result<void>> {
    const entry: RecentEntry = {
      endpointId: e.endpointId,
      method: e.method,
      path: e.path,
      usedAt: this.now(),
    }
    this.recents = [entry, ...this.recents.filter((r) => r.endpointId !== e.endpointId)].slice(
      0,
      this.maxRecents,
    )
    const written = await this.storage.set(this.recentKey(), this.recents, { immediate: true })
    if (!written.ok) return written
    this.bus?.publish('RECENT_UPDATED', { endpointId: e.endpointId })
    return ok(undefined)
  }

  /** Navigate to an endpoint in Swagger and record it as recent. */
  async open(e: EndpointInfo): Promise<Result<void>> {
    await this.recordRecent(e)
    return this.adapter.openEndpoint(e.endpointId)
  }

  /** Assemble the request pieces for code generation (auth + open body + base URL). */
  buildCodeRequest(endpointId: string): CodeGenRequest {
    const found = this.adapter.listEndpoints().find((e) => e.endpointId === endpointId)
    const [method = 'get', path = ''] = endpointId.split(' ')
    const resolved = found ?? { method, path }
    const body = this.adapter.readOpenRequests().find((r) => r.endpointId === endpointId)?.body

    const headers: Record<string, string> = {}
    if (body) headers['Content-Type'] = 'application/json'
    const auth = this.adapter.readAuth()
    if (auth?.token) {
      if (auth.type === 'bearer' || auth.type === 'jwt')
        headers['Authorization'] = `Bearer ${auth.token}`
      else if (auth.type === 'basic') headers['Authorization'] = `Basic ${auth.token}`
      else headers['Authorization'] = auth.token
    }

    return {
      method: resolved.method,
      url: `${this.baseUrl}${resolved.path}`,
      headers,
      body: body || undefined,
    }
  }

  /** Generate a runnable snippet (cURL/Fetch/Axios) for an endpoint. */
  generateCode(lang: CodeLang, endpointId: string): Result<string> {
    return ok(generateCode(lang, this.buildCodeRequest(endpointId)))
  }
}

import { projectKey, type StorageService } from '@/core/storage'
import type {
  NormalizedSpec,
  SpecSnapshot,
  SpecDiffResult,
} from './types'
import { normalizeOpenApiSpec } from './normalizer'
import { diffOpenApiSpecs } from './diff-engine'
import { analyzeSpecImpact } from './impact-analyzer'
import type { Workflow } from '../workflows/types'
import type { RequestTemplate } from '../request/types'

export interface SpecServiceOptions {
  storage: StorageService
  projectId: string
  specUrl?: string
  fetchFn?: typeof fetch
  getWorkflows?: () => Promise<Workflow[]>
  getPresets?: () => Promise<RequestTemplate[]>
  getPinnedEndpoints?: () => Promise<string[]>
}

export class SpecService {
  private readonly storage: StorageService
  private readonly projectId: string
  private readonly specUrl?: string
  private readonly fetchFn: typeof fetch
  private readonly getWorkflows?: () => Promise<Workflow[]>
  private readonly getPresets?: () => Promise<RequestTemplate[]>
  private readonly getPinnedEndpoints?: () => Promise<string[]>

  constructor(options: SpecServiceOptions) {
    this.storage = options.storage
    this.projectId = options.projectId
    this.specUrl = options.specUrl
    this.fetchFn = options.fetchFn ?? (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : (undefined as any))
    this.getWorkflows = options.getWorkflows
    this.getPresets = options.getPresets
    this.getPinnedEndpoints = options.getPinnedEndpoints
  }

  private snapshotKey(): string {
    return projectKey(this.projectId, 'spec', 'snapshot')
  }

  /**
   * Retrieves the current stored baseline snapshot for this project, if any.
   */
  async getStoredSnapshot(): Promise<SpecSnapshot | null> {
    const result = await this.storage.getData<SpecSnapshot>(this.snapshotKey())
    if (result.ok && result.value) {
      return result.value
    }
    return null
  }

  /**
   * Saves a new baseline snapshot in storage.
   */
  async saveBaselineSnapshot(spec: NormalizedSpec, specUrl?: string): Promise<SpecSnapshot> {
    const snapshot: SpecSnapshot = {
      projectId: this.projectId,
      specUrl: specUrl ?? this.specUrl,
      hash: spec.hash,
      normalized: spec,
      updatedAt: Date.now(),
      acceptedAt: Date.now(),
    }

    await this.storage.set(this.snapshotKey(), snapshot, { immediate: true })
    return snapshot
  }

  /**
   * Fetches the live OpenAPI/Swagger specification from the given URL.
   */
  async fetchLiveSpec(targetUrl?: string): Promise<unknown | null> {
    const url = targetUrl ?? this.specUrl
    if (!url || !this.fetchFn) return null

    try {
      const resp = await this.fetchFn(url, {
        headers: { Accept: 'application/json, text/plain, */*' },
      })
      if (!resp.ok) {
        console.warn(`[SpecService] Failed to fetch spec: HTTP ${resp.status}`)
        return null
      }
      const data = await resp.json()
      return data
    } catch (err) {
      console.warn('[SpecService] Network error fetching spec:', err)
      return null
    }
  }

  /**
   * Compares the given raw or live spec against the stored baseline snapshot.
   * If no baseline exists, saves the spec as the initial baseline and returns null.
   */
  async checkSpecForChanges(rawSpec?: unknown): Promise<SpecDiffResult | null> {
    let specData = rawSpec
    if (!specData) {
      specData = await this.fetchLiveSpec()
    }
    if (!specData) return null

    const currentNormalized = normalizeOpenApiSpec(specData)
    const storedSnapshot = await this.getStoredSnapshot()

    if (!storedSnapshot) {
      // First time initialization: store as baseline
      await this.saveBaselineSnapshot(currentNormalized)
      return null
    }

    // Quick hash check
    if (storedSnapshot.hash === currentNormalized.hash) {
      return {
        hasChanges: false,
        hasBreakingChanges: false,
        totalChanges: 0,
        breakingCount: 0,
        warningCount: 0,
        infoCount: 0,
        changes: [],
        impactedResources: [],
        oldHash: storedSnapshot.hash,
        newHash: currentNormalized.hash,
      }
    }

    // Deep contract diff
    const diff = diffOpenApiSpecs(storedSnapshot.normalized, currentNormalized)

    // Analyze impact on workflows and presets if changes exist
    if (diff.hasChanges) {
      const workflows = this.getWorkflows ? await this.getWorkflows().catch(() => []) : []
      const presets = this.getPresets ? await this.getPresets().catch(() => []) : []
      const pinned = this.getPinnedEndpoints ? await this.getPinnedEndpoints().catch(() => []) : []

      diff.impactedResources = analyzeSpecImpact({
        changes: diff.changes,
        workflows,
        presets,
        pinnedEndpoints: pinned,
      })
    }

    return diff
  }

  /**
   * Accepts the new specification as the new baseline snapshot.
   */
  async acceptNewBaseline(newSpec: NormalizedSpec): Promise<SpecSnapshot> {
    return this.saveBaselineSnapshot(newSpec)
  }
}

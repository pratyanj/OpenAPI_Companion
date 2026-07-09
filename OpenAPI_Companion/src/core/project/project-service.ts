import { ok, type Result } from '@/types'
import { stableId } from '@/utils'
import { projectKey, type StorageService } from '@/core/storage'
import type { EventBus } from '@/core/events'
import {
  DEFAULT_ENVIRONMENT_ID,
  type Environment,
  type ProjectInput,
  type ProjectMeta,
} from './types'

export interface ProjectServiceOptions {
  storage: StorageService
  bus?: EventBus
  now?: () => number
}

/**
 * Identifies the OpenAPI project on the current page and ensures its workspace
 * exists (planning/06 FR-001/003, planning/08 §4).
 *
 * The project id is a stable hash of origin + OpenAPI URL + doc type, so a
 * project resolves to the same workspace across refreshes and restarts. Every
 * project is guaranteed a `default` environment (the seam that lets
 * Authentication/Request be built before the Environment Manager — planning/06).
 */
export class ProjectService {
  private readonly storage: StorageService
  private readonly bus: EventBus | undefined
  private readonly now: () => number

  constructor(options: ProjectServiceOptions) {
    this.storage = options.storage
    this.bus = options.bus
    this.now = options.now ?? (() => Date.now())
  }

  static idFor(input: ProjectInput): string {
    return stableId('project', input.origin, input.openApiUrl, input.docType)
  }

  async identify(input: ProjectInput): Promise<Result<ProjectMeta>> {
    const id = ProjectService.idFor(input)
    const key = projectKey(id, 'metadata')

    const existing = await this.storage.get<ProjectMeta>(key)
    // A hard read failure propagates; a corrupt record is recreated below.
    if (!existing.ok && existing.error.code === 'STORAGE_READ') return existing

    let meta: ProjectMeta
    if (existing.ok && existing.value) {
      meta = existing.value.data
    } else {
      meta = {
        id,
        name: this.deriveName(input),
        originUrl: input.origin,
        openApiUrl: input.openApiUrl,
        docType: input.docType,
        createdAt: this.now(),
        lastActiveEnvId: DEFAULT_ENVIRONMENT_ID,
      }
      const written = await this.storage.set(key, meta, { immediate: true })
      if (!written.ok) return written
    }

    const env = await this.ensureDefaultEnvironment(id, input.origin)
    if (!env.ok) return env

    this.bus?.publish('PROJECT_DETECTED', { projectId: id, docType: input.docType })
    return ok(meta)
  }

  async ensureDefaultEnvironment(projectId: string, baseUrl: string): Promise<Result<Environment>> {
    const key = projectKey(projectId, 'environments', DEFAULT_ENVIRONMENT_ID)
    const seeded = await this.storage.getOrSeed<Environment>(key, () => ({
      id: DEFAULT_ENVIRONMENT_ID,
      name: 'Local',
      baseUrl,
      variables: {},
      updatedAt: this.now(),
    }))
    return seeded.ok ? ok(seeded.value.data) : seeded
  }

  private deriveName(input: ProjectInput): string {
    try {
      return new URL(input.openApiUrl, input.origin).host || 'API Project'
    } catch {
      return 'API Project'
    }
  }
}

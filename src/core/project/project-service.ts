import { ok, err, type Result } from '@/types'
import { stableId } from '@/utils'
import { STORAGE_ROOTS } from '@/constants'
import {
  projectKey,
  projectPrefix,
  PROJECT_BINDINGS_KEY,
  type StorageService,
} from '@/core/storage'
import type { EventBus } from '@/core/events'
import {
  DEFAULT_ENVIRONMENT_ID,
  type Environment,
  type ProjectInput,
  type ProjectMeta,
  type CandidateProject,
} from './types'
import { isLocalHost, normalizeLocalOrigin } from '@/utils/doc-url'

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
 * project is guaranteed a `default` environment.
 *
 * Supports project origin aliasing / host linking (e.g. localhost:8008 -> 8009),
 * candidate detection for port switches, and custom project naming.
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

  /**
   * Identifies or resolves the project for the given input.
   * If an origin binding exists (e.g. from linking ports or loopbacks),
   * resolves to the bound project workspace.
   */
  async identify(input: ProjectInput): Promise<Result<ProjectMeta>> {
    // 1. Check explicit origin binding
    const boundId = await this.getBindingForOrigin(input.origin)
    let id = boundId

    // 2. If no binding, check loopback normalization for localhost
    if (!id && isLocalHost(input.origin)) {
      const normalized = normalizeLocalOrigin(input.origin)
      if (normalized !== input.origin) {
        const normBoundId = await this.getBindingForOrigin(normalized)
        if (normBoundId) {
          id = normBoundId
        } else {
          // Check if normalized origin already has a project
          const normInput = { ...input, origin: normalized }
          const normId = ProjectService.idFor(normInput)
          const normMeta = await this.getProjectMeta(normId)
          if (normMeta.ok && normMeta.value) {
            id = normId
          }
        }
      }
    }

    if (!id) {
      id = ProjectService.idFor(input)
    }

    const key = projectKey(id, 'metadata')
    const existing = await this.storage.get<ProjectMeta>(key)
    if (!existing.ok && existing.error.code === 'STORAGE_READ') return existing

    let meta: ProjectMeta
    if (existing.ok && existing.value) {
      meta = existing.value.data
      // If project has no custom name and input provides a spec title, adopt it
      if (input.title && (!meta.name || meta.name === this.deriveName(input))) {
        meta.name = input.title.trim()
        meta.specTitle = input.title.trim()
        await this.storage.set(key, meta, { immediate: true })
      }
    } else {
      let initialName = this.deriveName(input)
      if (input.title && input.title.trim()) {
        initialName = input.title.trim()
      }

      let specPath: string | undefined
      try {
        const parsed = new URL(input.openApiUrl, input.origin)
        if (parsed.pathname && parsed.pathname !== '/') {
          specPath = parsed.pathname
        }
      } catch {
        // ignore
      }

      meta = {
        id,
        name: initialName,
        originUrl: input.origin,
        openApiUrl: input.openApiUrl,
        docType: input.docType,
        createdAt: this.now(),
        lastActiveEnvId: DEFAULT_ENVIRONMENT_ID,
        specTitle: input.title ? input.title.trim() : undefined,
        specPath,
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

  /**
   * Rename a project and notify subscribers.
   * Resilient: If the metadata record was not yet seeded or corrupted, upserts a valid ProjectMeta record.
   */
  async renameProject(projectId: string, newName: string): Promise<Result<ProjectMeta>> {
    const trimmed = newName.trim()
    if (!trimmed) {
      return err({
        code: 'PROJECT_RENAME_ERROR',
        message: 'Project name cannot be empty',
        recoverable: true,
      })
    }

    const key = projectKey(projectId, 'metadata')
    const existing = await this.storage.get<ProjectMeta>(key)

    let meta: ProjectMeta
    if (existing.ok && existing.value) {
      meta = { ...existing.value.data, name: trimmed }
    } else {
      meta = {
        id: projectId,
        name: trimmed,
        originUrl: '',
        openApiUrl: '',
        docType: 'swagger-ui',
        createdAt: this.now(),
        lastActiveEnvId: DEFAULT_ENVIRONMENT_ID,
      }
    }

    const written = await this.storage.set(key, meta, { immediate: true })
    if (!written.ok) return written

    this.bus?.publish('PROJECT_UPDATED', { projectId, name: trimmed })
    return ok(meta)
  }

  /**
   * Find existing candidate projects matching the current input (e.g. previous local port,
   * matching spec path or spec title).
   */
  async findCandidateProjects(
    input: ProjectInput,
    specTitle?: string,
  ): Promise<Result<CandidateProject[]>> {
    // If the origin is already bound/linked to a project, it is not a candidate — suppress suggestions
    const boundId = await this.getBindingForOrigin(input.origin)
    if (boundId) return ok([])

    const allProjectsRes = await this.listAllProjects()
    if (!allProjectsRes.ok) return ok([])

    const currentId = ProjectService.idFor(input)
    const isCurrentLocal = isLocalHost(input.origin)

    let currentSpecPath = ''
    try {
      currentSpecPath = new URL(input.openApiUrl, input.origin).pathname
    } catch {
      // ignore
    }

    const candidates: CandidateProject[] = []
    const normalizedInput = normalizeLocalOrigin(input.origin)

    for (const p of allProjectsRes.value) {
      if (p.id === currentId || p.id === boundId) continue
      if (p.originUrl === input.origin) continue
      if (p.linkedOrigins?.includes(input.origin)) continue
      if (p.linkedOrigins?.some((o) => normalizeLocalOrigin(o) === normalizedInput)) continue
      if (normalizeLocalOrigin(p.originUrl) === normalizedInput) continue

      let candidateSpecPath = ''
      try {
        candidateSpecPath = new URL(p.openApiUrl, p.originUrl).pathname
      } catch {
        // ignore
      }

      const isCandLocal = isLocalHost(p.originUrl)
      const matchesTitle =
        (specTitle && p.name.toLowerCase() === specTitle.toLowerCase()) ||
        (input.title && p.name.toLowerCase() === input.title.toLowerCase())
      const matchesPath =
        currentSpecPath && candidateSpecPath && currentSpecPath === candidateSpecPath
      const matchesLocal = isCurrentLocal && isCandLocal
      const matchesNormalized = normalizeLocalOrigin(p.originUrl) === normalizedInput

      if (matchesTitle || (matchesLocal && (matchesPath || matchesNormalized || isCurrentLocal))) {
        candidates.push(p)
      }
    }

    return ok(candidates)
  }

  /**
   * Link an origin to a target project (creates an alias mapping).
   */
  async linkOriginToProject(origin: string, targetProjectId: string): Promise<Result<void>> {
    const targetMetaRes = await this.getProjectMeta(targetProjectId)
    if (!targetMetaRes.ok) return targetMetaRes

    const bindingsRes = await this.getBindings()
    const bindings = bindingsRes.ok ? bindingsRes.value : {}
    bindings[origin] = targetProjectId

    const written = await this.storage.set(PROJECT_BINDINGS_KEY, bindings, { immediate: true })
    if (!written.ok) return written

    // Update target project's linkedOrigins array
    const meta = targetMetaRes.value
    const origins = new Set(meta.linkedOrigins ?? [])
    origins.add(origin)
    const updatedMeta: ProjectMeta = {
      ...meta,
      linkedOrigins: Array.from(origins),
    }
    await this.storage.set(projectKey(targetProjectId, 'metadata'), updatedMeta, {
      immediate: true,
    })

    this.bus?.publish('PROJECT_LINKED', { origin, targetProjectId })
    return ok(undefined)
  }

  /**
   * Unlinks an origin so it creates/uses its own independent project workspace.
   */
  async unlinkOrigin(origin: string): Promise<Result<void>> {
    const bindingsRes = await this.getBindings()
    if (!bindingsRes.ok) return ok(undefined)

    const bindings = bindingsRes.value
    const targetProjectId = bindings[origin]
    if (!targetProjectId) return ok(undefined)

    delete bindings[origin]
    await this.storage.set(PROJECT_BINDINGS_KEY, bindings, { immediate: true })

    const metaRes = await this.getProjectMeta(targetProjectId)
    if (metaRes.ok) {
      const meta = metaRes.value
      const remaining = (meta.linkedOrigins ?? []).filter((o) => o !== origin)
      const updatedMeta: ProjectMeta = {
        ...meta,
        linkedOrigins: remaining.length > 0 ? remaining : undefined,
      }
      await this.storage.set(projectKey(targetProjectId, 'metadata'), updatedMeta, {
        immediate: true,
      })
    }

    return ok(undefined)
  }

  /**
   * Deep copies all presets, variables, environments, workflows, headers, and collections
   * from sourceProjectId into targetProjectId.
   */
  async copyProjectData(sourceProjectId: string, targetProjectId: string): Promise<Result<number>> {
    const sourcePrefix = projectPrefix(sourceProjectId)
    const keysRes = await this.storage.list(sourcePrefix)
    if (!keysRes.ok) return keysRes

    let copiedCount = 0
    for (const key of keysRes.value) {
      if (key.endsWith('/metadata')) continue // preserve target metadata
      const relativePath = key.slice(sourcePrefix.length)
      const targetKey = `${projectPrefix(targetProjectId)}${relativePath}`
      const item = await this.storage.get(key)
      if (item.ok && item.value) {
        await this.storage.set(targetKey, item.value.data, { immediate: true })
        copiedCount++
      }
    }
    await this.storage.flush()
    return ok(copiedCount)
  }

  /**
   * Lists all registered projects with metadata, preset counts, and variable counts.
   */
  async listAllProjects(): Promise<Result<CandidateProject[]>> {
    const keys = await this.storage.list(`${STORAGE_ROOTS.projects}/`)
    if (!keys.ok) return ok([])

    const ids = new Set<string>()
    for (const k of keys.value) {
      const parts = k.split('/')
      if (parts[1]) ids.add(parts[1])
    }

    const projects: CandidateProject[] = []
    for (const id of ids) {
      const metaRes = await this.getProjectMeta(id)
      if (metaRes.ok && metaRes.value) {
        const m = metaRes.value
        const [presetsRes, varsRes] = await Promise.all([
          this.countPresets(id),
          this.countVariables(id),
        ])
        projects.push({
          id: m.id,
          name: m.name,
          originUrl: m.originUrl,
          openApiUrl: m.openApiUrl,
          linkedOrigins: m.linkedOrigins,
          presetCount: presetsRes.ok ? presetsRes.value : 0,
          variableCount: varsRes.ok ? varsRes.value : 0,
        })
      }
    }

    projects.sort((a, b) => a.name.localeCompare(b.name))
    return ok(projects)
  }

  async getProjectMeta(projectId: string): Promise<Result<ProjectMeta>> {
    const key = projectKey(projectId, 'metadata')
    const result = await this.storage.get<ProjectMeta>(key)
    if (result.ok && result.value) {
      return ok(result.value.data)
    }

    // Fallback: If metadata envelope doesn't exist yet, check if project has stored data
    const prefix = projectPrefix(projectId)
    const listRes = await this.storage.list(prefix)
    if (listRes.ok && listRes.value.length > 0) {
      const syntheticMeta: ProjectMeta = {
        id: projectId,
        name: projectId,
        originUrl: '',
        openApiUrl: '',
        docType: 'swagger-ui',
        createdAt: this.now(),
        lastActiveEnvId: DEFAULT_ENVIRONMENT_ID,
      }
      return ok(syntheticMeta)
    }

    return err({
      code: 'NOT_FOUND',
      message: `Project ${projectId} not found`,
      recoverable: true,
    })
  }

  private async getBindings(): Promise<Result<Record<string, string>>> {
    const res = await this.storage.get<Record<string, string>>(PROJECT_BINDINGS_KEY)
    if (!res.ok) return ok({})
    return ok(res.value?.data ?? {})
  }

  async getBindingForOrigin(origin: string): Promise<string | null> {
    const bindingsRes = await this.getBindings()
    if (!bindingsRes.ok) return null
    if (bindingsRes.value[origin]) return bindingsRes.value[origin]

    // Also check loopback normalization (localhost <-> 127.0.0.1)
    const norm = normalizeLocalOrigin(origin)
    for (const [boundOrigin, boundTargetId] of Object.entries(bindingsRes.value)) {
      if (normalizeLocalOrigin(boundOrigin) === norm) {
        return boundTargetId
      }
    }
    return null
  }

  private async countPresets(projectId: string): Promise<Result<number>> {
    const templatePrefix = projectKey(projectId, 'requests', 'template/')
    const keys = await this.storage.list(templatePrefix)
    return keys.ok ? ok(keys.value.length) : ok(0)
  }

  private async countVariables(projectId: string): Promise<Result<number>> {
    const envPrefix = projectKey(projectId, 'environments')
    const keys = await this.storage.list(envPrefix)
    if (!keys.ok) return ok(0)

    let total = 0
    for (const k of keys.value) {
      const res = await this.storage.get<Environment>(k)
      if (res.ok && res.value?.data?.variables) {
        total += Object.keys(res.value.data.variables).length
      }
    }
    return ok(total)
  }

  private deriveName(input: ProjectInput): string {
    try {
      return new URL(input.openApiUrl, input.origin).host || 'API Project'
    } catch {
      return 'API Project'
    }
  }
}

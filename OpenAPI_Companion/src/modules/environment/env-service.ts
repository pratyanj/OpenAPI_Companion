import { ok, err, type Result, type AppError } from '@/types'
import { projectKey, type StorageService } from '@/core/storage'
import type { EventBus } from '@/core/events'
import { DEFAULT_ENVIRONMENT_ID, type Environment, type ProjectMeta } from '@/core/project'

export interface EnvironmentServiceOptions {
  storage: StorageService
  projectId: string
  bus?: EventBus
  now?: () => number
}

export interface EnvironmentInput {
  name: string
  baseUrl?: string
  variables?: Record<string, string>
  description?: string
}

/** Suggested environments offered in the UI (created on demand, not seeded). */
export const BUILTIN_ENVIRONMENTS: ReadonlyArray<{ id: string; name: string }> = [
  { id: 'local', name: 'Local' },
  { id: 'development', name: 'Development' },
  { id: 'qa', name: 'QA' },
  { id: 'uat', name: 'UAT' },
  { id: 'staging', name: 'Staging' },
  { id: 'production', name: 'Production' },
]

const VAR_PATTERN = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g

const errors = {
  duplicateName: (name: string): AppError => ({
    code: 'ENV_DUPLICATE_NAME',
    message: `An environment named "${name}" already exists`,
    recoverable: true,
  }),
  notFound: (id: string): AppError => ({
    code: 'ENV_NOT_FOUND',
    message: `Environment "${id}" not found`,
    recoverable: true,
  }),
  protectedDefault: (): AppError => ({
    code: 'ENV_PROTECTED',
    message: 'The default environment cannot be deleted',
    recoverable: true,
  }),
}

/** Pure `{{VAR}}` substitution used by DD-032 (Companion-scoped resolution). */
export function substitute(
  text: string,
  variables: Record<string, string>,
): { text: string; missing: string[] } {
  const missing = new Set<string>()
  const resolved = text.replace(VAR_PATTERN, (_match, key: string) => {
    if (key in variables) return variables[key] ?? ''
    missing.add(key)
    return `{{${key}}}`
  })
  return { text: resolved, missing: [...missing] }
}

function slug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

/**
 * Manages a project's environments and the active selection (FR-007/008,
 * FDD-003). Switching publishes `ENVIRONMENT_CHANGED`; Auth/Request re-load for
 * the new environment (via the bus, in the content wiring) — keeping modules
 * decoupled. Every project always has a `default` environment (ProjectService).
 */
export class EnvironmentService {
  private readonly storage: StorageService
  private readonly projectId: string
  private readonly bus: EventBus | undefined
  private readonly now: () => number

  constructor(options: EnvironmentServiceOptions) {
    this.storage = options.storage
    this.projectId = options.projectId
    this.bus = options.bus
    this.now = options.now ?? (() => Date.now())
  }

  private envKey(id: string): string {
    return projectKey(this.projectId, 'environments', id)
  }
  private envPrefix(): string {
    return `${projectKey(this.projectId, 'environments')}/`
  }
  private metaKey(): string {
    return projectKey(this.projectId, 'metadata')
  }

  listBuiltins(): ReadonlyArray<{ id: string; name: string }> {
    return BUILTIN_ENVIRONMENTS
  }

  async list(): Promise<Result<Environment[]>> {
    const keys = await this.storage.list(this.envPrefix())
    if (!keys.ok) return keys
    const environments: Environment[] = []
    for (const key of keys.value) {
      const got = await this.storage.getData<Environment>(key)
      if (got.ok && got.value) environments.push(got.value)
    }
    environments.sort((a, b) => a.name.localeCompare(b.name))
    return ok(environments)
  }

  async get(id: string): Promise<Result<Environment | null>> {
    const got = await this.storage.getData<Environment>(this.envKey(id))
    if (!got.ok) return got.error.code === 'STORAGE_CORRUPT' ? ok(null) : got
    return ok(got.value)
  }

  async getActiveId(): Promise<string> {
    const meta = await this.storage.getData<ProjectMeta>(this.metaKey())
    return meta.ok && meta.value ? meta.value.lastActiveEnvId : DEFAULT_ENVIRONMENT_ID
  }

  async create(input: EnvironmentInput): Promise<Result<Environment>> {
    const name = input.name.trim()
    if (!name) return err(errors.duplicateName('')) // empty name is invalid
    const existing = await this.list()
    if (!existing.ok) return existing
    if (existing.value.some((e) => e.name.toLowerCase() === name.toLowerCase())) {
      return err(errors.duplicateName(name))
    }
    const id = this.uniqueId(slug(name) || 'env', existing.value)
    const environment: Environment = {
      id,
      name,
      baseUrl: input.baseUrl ?? '',
      variables: input.variables ?? {},
      description: input.description,
      updatedAt: this.now(),
    }
    const written = await this.storage.set(this.envKey(id), environment, { immediate: true })
    if (!written.ok) return written
    this.bus?.publish('ENVIRONMENT_CREATED', { environmentId: id })
    return ok(environment)
  }

  async update(id: string, patch: Partial<EnvironmentInput>): Promise<Result<Environment>> {
    const current = await this.get(id)
    if (!current.ok) return current
    if (!current.value) return err(errors.notFound(id))
    const updated: Environment = {
      ...current.value,
      name: patch.name?.trim() ?? current.value.name,
      baseUrl: patch.baseUrl ?? current.value.baseUrl,
      variables: patch.variables ?? current.value.variables,
      description: patch.description ?? current.value.description,
      updatedAt: this.now(),
    }
    const written = await this.storage.set(this.envKey(id), updated, { immediate: true })
    if (!written.ok) return written
    return ok(updated)
  }

  async duplicate(id: string): Promise<Result<Environment>> {
    const source = await this.get(id)
    if (!source.ok) return source
    if (!source.value) return err(errors.notFound(id))
    return this.create({
      name: `${source.value.name} (copy)`,
      baseUrl: source.value.baseUrl,
      variables: { ...source.value.variables },
      description: source.value.description,
    })
  }

  async delete(id: string): Promise<Result<void>> {
    if (id === DEFAULT_ENVIRONMENT_ID) return err(errors.protectedDefault())
    const removed = await this.storage.remove(this.envKey(id))
    if (!removed.ok) return removed
    // If the deleted env was active, fall back to default (EC-016).
    if ((await this.getActiveId()) === id) {
      await this.setActive(DEFAULT_ENVIRONMENT_ID)
      this.bus?.publish('ENVIRONMENT_CHANGED', {
        projectId: this.projectId,
        environmentId: DEFAULT_ENVIRONMENT_ID,
      })
    }
    this.bus?.publish('ENVIRONMENT_DELETED', { environmentId: id })
    return ok(undefined)
  }

  async switch(id: string): Promise<Result<Environment>> {
    const target = await this.get(id)
    if (!target.ok) return target
    if (!target.value) return err(errors.notFound(id))
    const written = await this.setActive(id)
    if (!written.ok) return written
    this.bus?.publish('ENVIRONMENT_CHANGED', { projectId: this.projectId, environmentId: id })
    return ok(target.value)
  }

  async resolve(text: string, id: string): Promise<Result<{ text: string; missing: string[] }>> {
    const env = await this.get(id)
    if (!env.ok) return env
    return ok(substitute(text, env.value?.variables ?? {}))
  }

  /** Persist the active environment for this project WITHOUT emitting. */
  async setActive(id: string): Promise<Result<void>> {
    const meta = await this.storage.getData<ProjectMeta>(this.metaKey())
    if (!meta.ok) return meta
    if (!meta.value) return err(errors.notFound(this.projectId))
    return this.storage.set(
      this.metaKey(),
      { ...meta.value, lastActiveEnvId: id },
      { immediate: true },
    )
  }

  private uniqueId(base: string, existing: Environment[]): string {
    const ids = new Set(existing.map((e) => e.id))
    if (!ids.has(base)) return base
    let n = 2
    while (ids.has(`${base}-${n}`)) n++
    return `${base}-${n}`
  }
}

import { ok, err, type Result, type AppError } from '@/types'
import { projectKey, type StorageService } from '@/core/storage'
import type { EventBus } from '@/core/events'
import { DEFAULT_ENVIRONMENT_ID, type Environment, type ProjectMeta } from '@/core/project'
import type { ExtractionRule, ExtractionRuleInput } from './extraction-rules-types'
import { extractValueByPath } from './json-candidates'

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
  secrets?: string[]
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

import { GENERATORS, type Rng } from '@/modules/fake-data/generators'

export interface SubstituteOptions {
  now?: () => number
  rng?: Rng
}

const VAR_PATTERN = /\{\{\s*([$A-Za-z0-9_]+)\s*\}\}/g

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

function resolveDynamicVariable(key: string, nowFn: () => number, rngFn: Rng): string | null {
  const norm = key.toLowerCase()
  switch (norm) {
    case '$uuid':
    case '$guid':
      return String(GENERATORS.uuid(rngFn))
    case '$timestamp':
      return String(Math.floor(nowFn() / 1000))
    case '$timestampms':
    case '$timestamp_ms':
      return String(nowFn())
    case '$isodate':
    case '$iso_date':
    case '$isotimestamp':
    case '$iso_timestamp':
      return new Date(nowFn()).toISOString()
    case '$date':
      return String(GENERATORS.date(rngFn))
    case '$datetime':
      return String(GENERATORS.datetime(rngFn))
    case '$randomemail':
    case '$random_email':
      return String(GENERATORS.email(rngFn))
    case '$randomname':
    case '$random_name':
    case '$randomfullname':
    case '$random_fullname':
      return String(GENERATORS.fullName(rngFn))
    case '$randomfirstname':
    case '$random_firstname':
      return String(GENERATORS.firstName(rngFn))
    case '$randomlastname':
    case '$random_lastname':
      return String(GENERATORS.lastName(rngFn))
    case '$randomusername':
    case '$random_username':
      return String(GENERATORS.username(rngFn))
    case '$randompassword':
    case '$random_password':
      return String(GENERATORS.password(rngFn))
    case '$randomphone':
    case '$random_phone':
      return String(GENERATORS.phone(rngFn))
    case '$randomint':
    case '$random_int':
    case '$randominteger':
    case '$random_integer':
      return String(GENERATORS.integer(rngFn))
    case '$randomfloat':
    case '$random_float':
    case '$randomdecimal':
    case '$random_decimal':
      return String(GENERATORS.float(rngFn))
    case '$randomboolean':
    case '$random_boolean':
    case '$randombool':
    case '$random_bool':
      return String(GENERATORS.boolean(rngFn))
    case '$randomurl':
    case '$random_url':
      return String(GENERATORS.url(rngFn))
    case '$randomcity':
    case '$random_city':
      return String(GENERATORS.city(rngFn))
    case '$randomcountry':
    case '$random_country':
      return String(GENERATORS.country(rngFn))
    case '$randomaddress':
    case '$random_address':
      return String(GENERATORS.address(rngFn))
    case '$randomcompany':
    case '$random_company':
      return String(GENERATORS.company(rngFn))
    case '$randomipv4':
    case '$random_ipv4':
    case '$randomip':
    case '$random_ip':
      return String(GENERATORS.ipv4(rngFn))
    case '$randomword':
    case '$random_word':
    case '$randomslug':
    case '$random_slug':
      return String(GENERATORS.slug(rngFn))
    case '$randomlorem':
    case '$random_lorem':
      return String(GENERATORS.loremSentence(rngFn))
    default:
      return null
  }
}

/** Pure `{{VAR}}` substitution used by DD-032 (Companion-scoped resolution). */
export function substitute(
  text: string,
  variables: Record<string, string>,
  options?: SubstituteOptions,
): { text: string; missing: string[] } {
  const missing = new Set<string>()
  const nowFn = options?.now ?? (() => Date.now())
  const rngFn = options?.rng ?? Math.random
  const resolved = text.replace(VAR_PATTERN, (_match, key: string) => {
    if (key in variables) return variables[key] ?? ''
    if (key.startsWith('$')) {
      const dynamic = resolveDynamicVariable(key, nowFn, rngFn)
      if (dynamic !== null) return dynamic
    }
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
      secrets: input.secrets ?? [],
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
      secrets: patch.secrets !== undefined ? patch.secrets : (current.value.secrets ?? []),
      description: patch.description ?? current.value.description,
      updatedAt: this.now(),
    }
    const written = await this.storage.set(this.envKey(id), updated, { immediate: true })
    if (!written.ok) return written
    this.bus?.publish('ENVIRONMENT_CHANGED', { projectId: this.projectId, environmentId: id })
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
      secrets: source.value.secrets ? [...source.value.secrets] : [],
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
    return ok(substitute(text, env.value?.variables ?? {}, { now: this.now }))
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

  private rulesKey(): string {
    return projectKey(this.projectId, 'environment', 'extraction-rules')
  }

  async listRules(): Promise<Result<ExtractionRule[]>> {
    const got = await this.storage.getData<ExtractionRule[]>(this.rulesKey())
    if (!got.ok) return got.error.code === 'STORAGE_CORRUPT' ? ok([]) : got
    return ok(got.value ?? [])
  }

  async saveRule(input: ExtractionRuleInput): Promise<Result<ExtractionRule>> {
    const targetVar = input.targetVariable.trim().toUpperCase()
    if (!targetVar) {
      return err({
        code: 'ENV_INVALID_RULE',
        message: 'Target variable name is required',
        recoverable: true,
      })
    }
    const prop = input.property.trim()
    if (!prop) {
      return err({
        code: 'ENV_INVALID_RULE',
        message: 'Property path is required',
        recoverable: true,
      })
    }

    const rulesRes = await this.listRules()
    if (!rulesRes.ok) return rulesRes
    const rules = [...rulesRes.value]

    const existingIdx = rules.findIndex(
      (r) =>
        r.endpointId.toLowerCase() === input.endpointId.toLowerCase() &&
        r.property.toLowerCase() === prop.toLowerCase() &&
        r.targetVariable.toUpperCase() === targetVar,
    )

    let rule: ExtractionRule
    if (existingIdx >= 0) {
      const existing = rules[existingIdx]!
      rule = {
        ...existing,
        ...input,
        id: existing.id,
        targetVariable: targetVar,
        property: prop,
      }
      rules[existingIdx] = rule
    } else {
      rule = {
        id: `rule_${this.now()}_${Math.random().toString(36).slice(2, 7)}`,
        endpointId: input.endpointId,
        source: input.source ?? 'body',
        property: prop,
        targetVariable: targetVar,
        isSecret: Boolean(input.isSecret),
        enabled: input.enabled ?? true,
        createdAt: this.now(),
      }
      rules.push(rule)
    }

    const written = await this.storage.set(this.rulesKey(), rules, { immediate: true })
    if (!written.ok) return written
    this.bus?.publish('EXTRACTION_RULE_SAVED', { projectId: this.projectId, ruleId: rule.id })
    return ok(rule)
  }

  async updateRule(id: string, patch: Partial<ExtractionRule>): Promise<Result<ExtractionRule>> {
    const rulesRes = await this.listRules()
    if (!rulesRes.ok) return rulesRes
    const rules = [...rulesRes.value]
    const idx = rules.findIndex((r) => r.id === id)
    if (idx < 0) {
      return err({
        code: 'ENV_RULE_NOT_FOUND',
        message: `Extraction rule "${id}" not found`,
        recoverable: true,
      })
    }
    const existing = rules[idx]!
    const updated: ExtractionRule = {
      ...existing,
      ...patch,
      id: existing.id,
      ...(patch.targetVariable
        ? { targetVariable: patch.targetVariable.trim().toUpperCase() }
        : {}),
      ...(patch.property ? { property: patch.property.trim() } : {}),
    }
    rules[idx] = updated
    const written = await this.storage.set(this.rulesKey(), rules, { immediate: true })
    if (!written.ok) return written
    this.bus?.publish('EXTRACTION_RULE_SAVED', { projectId: this.projectId, ruleId: id })
    return ok(updated)
  }

  async deleteRule(id: string): Promise<Result<void>> {
    const rulesRes = await this.listRules()
    if (!rulesRes.ok) return rulesRes
    const filtered = rulesRes.value.filter((r) => r.id !== id)
    const written = await this.storage.set(this.rulesKey(), filtered, { immediate: true })
    if (!written.ok) return written
    this.bus?.publish('EXTRACTION_RULE_DELETED', { projectId: this.projectId, ruleId: id })
    return ok(undefined)
  }

  async applyExtraction(
    endpointId: string,
    responseBody: string,
  ): Promise<Result<{ extracted: Array<{ variable: string; value: string }> }>> {
    const rulesRes = await this.listRules()
    if (!rulesRes.ok) return rulesRes
    const matching = rulesRes.value.filter(
      (r) => r.enabled && r.endpointId.toLowerCase() === endpointId.toLowerCase(),
    )
    if (matching.length === 0) return ok({ extracted: [] })

    const extracted: Array<{ variable: string; value: string; isSecret: boolean }> = []
    for (const rule of matching) {
      const val = extractValueByPath(responseBody, rule.property)
      if (val !== null && val !== '') {
        extracted.push({
          variable: rule.targetVariable,
          value: val,
          isSecret: rule.isSecret,
        })
      }
    }

    if (extracted.length === 0) return ok({ extracted: [] })

    const activeId = await this.getActiveId()
    const envRes = await this.get(activeId)
    if (!envRes.ok || !envRes.value) return ok({ extracted: [] })

    const env = envRes.value
    const nextVars = { ...(env.variables ?? {}) }
    const secretSet = new Set(env.secrets ?? [])

    for (const item of extracted) {
      nextVars[item.variable] = item.value
      if (item.isSecret) {
        secretSet.add(item.variable)
      }
      this.bus?.publish('VARIABLE_AUTO_EXTRACTED', {
        projectId: this.projectId,
        variableName: item.variable,
        endpointId,
      })
    }

    await this.update(activeId, {
      variables: nextVars,
      secrets: Array.from(secretSet),
    })

    return ok({
      extracted: extracted.map((e) => ({ variable: e.variable, value: e.value })),
    })
  }

  private uniqueId(base: string, existing: Environment[]): string {
    const ids = new Set(existing.map((e) => e.id))
    if (!ids.has(base)) return base
    let n = 2
    while (ids.has(`${base}-${n}`)) n++
    return `${base}-${n}`
  }
}

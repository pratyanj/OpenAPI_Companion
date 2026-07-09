import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EnvironmentService, substitute } from './env-service'
import { StorageService, projectKey } from '@/core/storage'
import { EventBus } from '@/core/events'
import { createFakeArea } from '@/tests/fake-storage'
import type { Environment, ProjectMeta } from '@/core/project'

const NOW = 1_700_000_000_000
const PROJECT = 'project_test'

async function setup() {
  const storage = new StorageService({ area: createFakeArea(), now: () => NOW })
  const bus = new EventBus()
  // Seed what ProjectService normally creates: metadata + default environment.
  const meta: ProjectMeta = {
    id: PROJECT,
    name: 'Test',
    originUrl: 'https://localhost:8000',
    openApiUrl: 'https://localhost:8000/swagger/',
    docType: 'swagger-ui',
    createdAt: NOW,
    lastActiveEnvId: 'default',
  }
  await storage.set(projectKey(PROJECT, 'metadata'), meta, { immediate: true })
  const def: Environment = {
    id: 'default',
    name: 'Local',
    baseUrl: 'https://localhost:8000',
    variables: {},
    updatedAt: NOW,
  }
  await storage.set(projectKey(PROJECT, 'environments', 'default'), def, { immediate: true })

  const service = new EnvironmentService({ storage, projectId: PROJECT, bus, now: () => NOW })
  return { storage, bus, service }
}

describe('substitute', () => {
  it('replaces known variables', () => {
    expect(substitute('{{BASE_URL}}/users', { BASE_URL: 'http://a' })).toEqual({
      text: 'http://a/users',
      missing: [],
    })
  })
  it('reports missing variables and leaves the placeholder', () => {
    const result = substitute('{{A}}-{{B}}', { A: 'x' })
    expect(result.text).toBe('x-{{B}}')
    expect(result.missing).toEqual(['B'])
  })
})

describe('EnvironmentService', () => {
  beforeEach(() => {
    /* fresh per test */
  })

  it('lists the default environment initially', async () => {
    const { service } = await setup()
    const list = await service.list()
    expect(list.ok && list.value.map((e) => e.id)).toEqual(['default'])
  })

  it('creates an environment with a slug id and emits ENVIRONMENT_CREATED', async () => {
    const { service, bus } = await setup()
    const created = vi.fn()
    bus.subscribe('ENVIRONMENT_CREATED', created)

    const result = await service.create({ name: 'QA Server', baseUrl: 'https://qa.example.com' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.id).toBe('qa-server')
    expect(created).toHaveBeenCalledWith({ environmentId: 'qa-server' })
  })

  it('rejects a duplicate name (EC-018)', async () => {
    const { service } = await setup()
    await service.create({ name: 'QA' })
    const dup = await service.create({ name: 'qa' }) // case-insensitive
    expect(dup.ok).toBe(false)
    if (dup.ok) return
    expect(dup.error.code).toBe('ENV_DUPLICATE_NAME')
  })

  it('switches the active environment and emits ENVIRONMENT_CHANGED', async () => {
    const { service, bus } = await setup()
    const changed = vi.fn()
    bus.subscribe('ENVIRONMENT_CHANGED', changed)
    await service.create({ name: 'QA' })

    const result = await service.switch('qa')
    expect(result.ok).toBe(true)
    expect(await service.getActiveId()).toBe('qa')
    expect(changed).toHaveBeenCalledWith({ projectId: PROJECT, environmentId: 'qa' })
  })

  it('falls back to default when the active environment is deleted (EC-016)', async () => {
    const { service, bus } = await setup()
    const changed = vi.fn()
    const deleted = vi.fn()
    bus.subscribe('ENVIRONMENT_CHANGED', changed)
    bus.subscribe('ENVIRONMENT_DELETED', deleted)
    await service.create({ name: 'QA' })
    await service.switch('qa')

    await service.delete('qa')

    expect(await service.getActiveId()).toBe('default')
    expect(changed).toHaveBeenLastCalledWith({ projectId: PROJECT, environmentId: 'default' })
    expect(deleted).toHaveBeenCalledWith({ environmentId: 'qa' })
  })

  it('refuses to delete the default environment', async () => {
    const { service } = await setup()
    const result = await service.delete('default')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('ENV_PROTECTED')
  })

  it('duplicates an environment', async () => {
    const { service } = await setup()
    await service.create({ name: 'QA', baseUrl: 'https://qa', variables: { TOKEN: 't' } })
    const dup = await service.duplicate('qa')
    expect(dup.ok).toBe(true)
    if (!dup.ok) return
    expect(dup.value.name).toBe('QA (copy)')
    expect(dup.value.variables).toEqual({ TOKEN: 't' })
  })

  it('resolves variables from a stored environment', async () => {
    const { service } = await setup()
    await service.create({ name: 'QA', variables: { BASE_URL: 'https://qa.example.com' } })
    const resolved = await service.resolve('{{BASE_URL}}/health', 'qa')
    expect(resolved.ok && resolved.value.text).toBe('https://qa.example.com/health')
  })
})

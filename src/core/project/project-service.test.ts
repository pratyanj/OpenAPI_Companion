import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ProjectService } from './project-service'
import { StorageService, projectKey } from '@/core/storage'
import { EventBus } from '@/core/events'
import { createFakeArea } from '@/tests/fake-storage'
import type { AsyncStorageArea } from '@/core/storage'

const NOW = 1_700_000_000_000
const input = {
  origin: 'https://localhost:8000',
  openApiUrl: 'https://localhost:8000/openapi.json',
  docType: 'swagger-ui',
}

function setup() {
  const area: AsyncStorageArea = createFakeArea()
  const bus = new EventBus()
  const storage = new StorageService({ area, appVersion: '0.1.0', now: () => NOW })
  const service = new ProjectService({ storage, bus, now: () => NOW })
  return { area, bus, storage, service }
}

describe('ProjectService', () => {
  beforeEach(() => {
    /* fresh per test via setup() */
  })

  it('creates a workspace + default environment and returns stable meta', async () => {
    const { service, storage } = setup()
    const result = await service.identify(input)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.id).toMatch(/^project_[0-9a-f]{8}$/)
    expect(result.value.docType).toBe('swagger-ui')
    expect(result.value.lastActiveEnvId).toBe('default')

    const env = await storage.getData(projectKey(result.value.id, 'environments', 'default'))
    expect(env.ok).toBe(true)
    if (!env.ok) return
    expect(env.value).toMatchObject({ id: 'default', name: 'Local', baseUrl: input.origin })
  })

  it('publishes PROJECT_DETECTED', async () => {
    const { service, bus } = setup()
    const spy = vi.fn()
    bus.subscribe('PROJECT_DETECTED', spy)

    const result = await service.identify(input)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(spy).toHaveBeenCalledWith({ projectId: result.value.id, docType: 'swagger-ui' })
  })

  it('is idempotent — re-identifying loads the existing workspace unchanged', async () => {
    const { service } = setup()
    const first = await service.identify(input)
    const second = await service.identify({ ...input })

    expect(first.ok && second.ok).toBe(true)
    if (!first.ok || !second.ok) return
    expect(second.value.id).toBe(first.value.id)
    expect(second.value.createdAt).toBe(first.value.createdAt)
  })

  it('assigns different ids to different projects', async () => {
    const { service } = setup()
    const a = await service.identify(input)
    const b = await service.identify({
      ...input,
      openApiUrl: 'https://localhost:8000/v2/openapi.json',
    })
    expect(a.ok && b.ok).toBe(true)
    if (!a.ok || !b.ok) return
    expect(a.value.id).not.toBe(b.value.id)
  })

  it('derives a friendly name from the host', async () => {
    const { service } = setup()
    const result = await service.identify(input)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.name).toBe('localhost:8000')
  })

  it('uses spec title as initial name if provided', async () => {
    const { service } = setup()
    const result = await service.identify({ ...input, title: 'Billing Service API' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.name).toBe('Billing Service API')
    expect(result.value.specTitle).toBe('Billing Service API')
  })

  it('renames a project and publishes PROJECT_UPDATED', async () => {
    const { service, bus } = setup()
    const spy = vi.fn()
    bus.subscribe('PROJECT_UPDATED', spy)

    const initial = await service.identify(input)
    expect(initial.ok).toBe(true)
    if (!initial.ok) return

    const renamed = await service.renameProject(initial.value.id, 'My Custom API')
    expect(renamed.ok).toBe(true)
    if (!renamed.ok) return
    expect(renamed.value.name).toBe('My Custom API')
    expect(spy).toHaveBeenCalledWith({ projectId: initial.value.id, name: 'My Custom API' })

    // Re-identifying keeps the custom name
    const reloaded = await service.identify(input)
    expect(reloaded.ok).toBe(true)
    if (!reloaded.ok) return
    expect(reloaded.value.name).toBe('My Custom API')
  })

  it('upserts and renames project even if metadata was not yet in storage', async () => {
    const { service } = setup()
    const renamed = await service.renameProject('project_unseeded_123', 'FastAPI Production')
    expect(renamed.ok).toBe(true)
    if (!renamed.ok) return
    expect(renamed.value.name).toBe('FastAPI Production')
    expect(renamed.value.id).toBe('project_unseeded_123')

    const fetched = await service.getProjectMeta('project_unseeded_123')
    expect(fetched.ok).toBe(true)
    if (!fetched.ok) return
    expect(fetched.value.name).toBe('FastAPI Production')
  })

  it('detects candidate projects on port change (8008 -> 8009)', async () => {
    const { service } = setup()
    // Create project on 8008
    const p1 = await service.identify({
      origin: 'http://localhost:8008',
      openApiUrl: 'http://localhost:8008/openapi.json',
      docType: 'swagger-ui',
      title: 'Store API',
    })
    expect(p1.ok).toBe(true)
    if (!p1.ok) return

    // Now on 8009, search candidates
    const candidatesRes = await service.findCandidateProjects({
      origin: 'http://localhost:8009',
      openApiUrl: 'http://localhost:8009/openapi.json',
      docType: 'swagger-ui',
    })

    expect(candidatesRes.ok).toBe(true)
    if (!candidatesRes.ok) return
    expect(candidatesRes.value.length).toBeGreaterThan(0)
    expect(candidatesRes.value[0]?.name).toBe('Store API')
    expect(candidatesRes.value[0]?.originUrl).toBe('http://localhost:8008')

    // Link 8009 to project 1
    await service.linkOriginToProject('http://localhost:8009', p1.value.id)

    // Searching candidates on 8009 now must return empty (already linked)
    const candidatesAfterLink = await service.findCandidateProjects({
      origin: 'http://localhost:8009',
      openApiUrl: 'http://localhost:8009/openapi.json',
      docType: 'swagger-ui',
    })
    expect(candidatesAfterLink.ok).toBe(true)
    if (!candidatesAfterLink.ok) return
    expect(candidatesAfterLink.value).toHaveLength(0)

    // Also verify loopback normalization (127.0.0.1:8009 resolves to localhost:8009's binding)
    const bound = await service.getBindingForOrigin('http://127.0.0.1:8009')
    expect(bound).toBe(p1.value.id)

    const candidatesLoopback = await service.findCandidateProjects({
      origin: 'http://127.0.0.1:8009',
      openApiUrl: 'http://127.0.0.1:8009/openapi.json',
      docType: 'swagger-ui',
    })
    expect(candidatesLoopback.ok).toBe(true)
    if (!candidatesLoopback.ok) return
    expect(candidatesLoopback.value).toHaveLength(0)
  })

  it('links an origin to another project and resolves to it on identify', async () => {
    const { service, bus } = setup()
    const spy = vi.fn()
    bus.subscribe('PROJECT_LINKED', spy)

    // Project 1 on 8008
    const p1 = await service.identify({
      origin: 'http://localhost:8008',
      openApiUrl: 'http://localhost:8008/openapi.json',
      docType: 'swagger-ui',
      title: 'Store API',
    })
    expect(p1.ok).toBe(true)
    if (!p1.ok) return

    // Link 8009 to project 1
    const linkRes = await service.linkOriginToProject('http://localhost:8009', p1.value.id)
    expect(linkRes.ok).toBe(true)
    expect(spy).toHaveBeenCalledWith({
      origin: 'http://localhost:8009',
      targetProjectId: p1.value.id,
    })

    // When 8009 identifies, it should resolve directly to Project 1!
    const p2 = await service.identify({
      origin: 'http://localhost:8009',
      openApiUrl: 'http://localhost:8009/openapi.json',
      docType: 'swagger-ui',
    })
    expect(p2.ok).toBe(true)
    if (!p2.ok) return
    expect(p2.value.id).toBe(p1.value.id)
    expect(p2.value.name).toBe('Store API')
    expect(p2.value.linkedOrigins).toContain('http://localhost:8009')

    // Unlink 8009
    await service.unlinkOrigin('http://localhost:8009')
    const p3 = await service.identify({
      origin: 'http://localhost:8009',
      openApiUrl: 'http://localhost:8009/openapi.json',
      docType: 'swagger-ui',
    })
    expect(p3.ok).toBe(true)
    if (!p3.ok) return
    expect(p3.value.id).not.toBe(p1.value.id)
  })

  it('copies project data from one project to another', async () => {
    const { service, storage } = setup()
    const p1 = await service.identify({
      origin: 'http://localhost:8008',
      openApiUrl: 'http://localhost:8008/openapi.json',
      docType: 'swagger-ui',
    })
    const p2 = await service.identify({
      origin: 'http://localhost:8010',
      openApiUrl: 'http://localhost:8010/openapi.json',
      docType: 'swagger-ui',
    })
    if (!p1.ok || !p2.ok) return

    // Put a dummy preset in p1
    await storage.set(projectKey(p1.value.id, 'requests', 'template/t1'), { name: 'Preset 1' })

    const copyRes = await service.copyProjectData(p1.value.id, p2.value.id)
    expect(copyRes.ok).toBe(true)
    if (!copyRes.ok) return
    expect(copyRes.value).toBeGreaterThan(0)

    // Verify p2 now has the preset
    const copied = await storage.getData<{ name: string }>(
      projectKey(p2.value.id, 'requests', 'template/t1'),
    )
    expect(copied.ok).toBe(true)
    if (copied.ok) {
      expect(copied.value?.name).toBe('Preset 1')
    }
  })
})

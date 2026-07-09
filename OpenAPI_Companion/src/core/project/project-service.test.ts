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

  it('recreates the workspace if the stored metadata is corrupt', async () => {
    const id = ProjectService.idFor(input)
    const area = createFakeArea({ [projectKey(id, 'metadata')]: 'corrupt-not-an-envelope' })
    const storage = new StorageService({ area, appVersion: '0.1.0', now: () => NOW })
    const service = new ProjectService({ storage, now: () => NOW })

    const result = await service.identify(input)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.id).toBe(id)
  })
})

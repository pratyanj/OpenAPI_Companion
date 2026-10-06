import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SpecService } from './spec-service'
import { StorageService } from '@/core/storage'
import { createFakeArea } from '@/tests/fake-storage'
import { normalizeOpenApiSpec } from './normalizer'
import type { Workflow } from '../workflows/types'
import type { RequestTemplate } from '../request/types'

describe('SpecService', () => {
  let storage: StorageService
  const PROJECT_ID = 'test-proj'

  const specV1 = {
    openapi: '3.0.0',
    info: { title: 'Test API', version: '1.0.0' },
    paths: {
      '/users': {
        get: {
          responses: { '200': { description: 'OK' } },
        },
      },
    },
  }

  const specV2 = {
    openapi: '3.0.0',
    info: { title: 'Test API', version: '2.0.0' },
    paths: {
      '/users': {
        get: {
          parameters: [{ name: 'orgId', in: 'query', required: true }],
          responses: { '200': { description: 'OK' } },
        },
      },
    },
  }

  beforeEach(() => {
    storage = new StorageService({ area: createFakeArea() })
  })

  it('stores initial baseline when no snapshot exists and returns null', async () => {
    const service = new SpecService({
      storage,
      projectId: PROJECT_ID,
    })

    const result = await service.checkSpecForChanges(specV1)
    expect(result).toBeNull()

    const stored = await service.getStoredSnapshot()
    expect(stored).not.toBeNull()
    expect(stored?.projectId).toBe(PROJECT_ID)
    expect(stored?.normalized.title).toBe('Test API')
  })

  it('reports no changes when checking identical spec', async () => {
    const service = new SpecService({
      storage,
      projectId: PROJECT_ID,
    })

    // Establish baseline
    await service.checkSpecForChanges(specV1)

    // Check again
    const result = await service.checkSpecForChanges(specV1)
    expect(result).not.toBeNull()
    expect(result?.hasChanges).toBe(false)
    expect(result?.totalChanges).toBe(0)
  })

  it('detects changes and attaches impacted workflows and presets', async () => {
    const mockWorkflow: Workflow = {
      id: 'wf-1',
      name: 'User Flow',
      mode: 'stop-on-failure',
      createdAt: 100,
      updatedAt: 100,
      steps: [
        {
          id: 's1',
          endpointId: 'get /users',
          name: 'Fetch Users',
          // missing orgId
        },
      ],
    }

    const mockPreset: RequestTemplate = {
      templateId: 't-1',
      name: 'Users Preset',
      endpointId: 'get /users',
      method: 'GET',
      environmentId: 'env-1',
      updatedAt: 100,
    }

    const service = new SpecService({
      storage,
      projectId: PROJECT_ID,
      getWorkflows: async () => [mockWorkflow],
      getPresets: async () => [mockPreset],
    })

    // Establish baseline
    await service.checkSpecForChanges(specV1)

    // Check with updated spec
    const diff = await service.checkSpecForChanges(specV2)
    expect(diff).not.toBeNull()
    expect(diff?.hasChanges).toBe(true)
    expect(diff?.hasBreakingChanges).toBe(true)
    expect(diff?.changes).toHaveLength(1)
    expect(diff?.changes[0]?.type).toBe('param_added')

    // Verify impacted resources were correlated
    expect(diff?.impactedResources.length).toBeGreaterThanOrEqual(2)
    expect(diff?.impactedResources.some((r) => r.type === 'workflow')).toBe(true)
    expect(diff?.impactedResources.some((r) => r.type === 'preset')).toBe(true)
  })

  it('allows accepting new baseline to update snapshot', async () => {
    const service = new SpecService({
      storage,
      projectId: PROJECT_ID,
    })

    await service.checkSpecForChanges(specV1)

    const normalizedV2 = normalizeOpenApiSpec(specV2)
    const updatedSnapshot = await service.acceptNewBaseline(normalizedV2)
    expect(updatedSnapshot.hash).toBe(normalizedV2.hash)

    // Next check with specV2 should report 0 changes
    const diff = await service.checkSpecForChanges(specV2)
    expect(diff?.hasChanges).toBe(false)
  })

  it('fetches remote live spec when provided', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => specV1,
    } as unknown as Response)

    const service = new SpecService({
      storage,
      projectId: PROJECT_ID,
      specUrl: 'https://api.example.com/openapi.json',
      fetchFn: mockFetch,
    })

    const fetched = await service.fetchLiveSpec()
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.example.com/openapi.json',
      expect.any(Object),
    )
    expect(fetched).toEqual(specV1)
  })
})

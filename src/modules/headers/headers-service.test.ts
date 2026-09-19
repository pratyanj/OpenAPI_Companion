import { describe, it, expect, beforeEach } from 'vitest'
import { HeadersService } from './headers-service'
import { StorageService } from '@/core/storage'
import { createFakeArea } from '@/tests/fake-storage'

describe('HeadersService', () => {
  let storage: StorageService
  let service: HeadersService
  const projectId = 'proj_test_123'

  beforeEach(() => {
    storage = new StorageService({ area: createFakeArea() })
    service = new HeadersService({ storage, projectId })
  })

  it('loads empty headers by default', async () => {
    const headers = await service.load()
    expect(headers).toEqual([])
    expect(service.getActiveHeadersRecord()).toEqual({})
  })

  it('adds, retrieves, and persists headers', async () => {
    const res = await service.addHeader({
      name: 'X-Tenant-ID',
      value: 'corp_42',
      enabled: true,
      description: 'Tenant identifier',
    })

    expect(res.ok).toBe(true)
    if (!res.ok) return

    expect(res.value.name).toBe('X-Tenant-ID')
    expect(res.value.value).toBe('corp_42')
    expect(res.value.enabled).toBe(true)

    expect(service.getActiveHeadersRecord()).toEqual({
      'X-Tenant-ID': 'corp_42',
    })

    // Reload in a fresh service instance
    const service2 = new HeadersService({ storage, projectId })
    const loaded = await service2.load()
    expect(loaded.length).toBe(1)
    expect(loaded[0].name).toBe('X-Tenant-ID')
    expect(loaded[0].value).toBe('corp_42')
  })

  it('toggles header state and filters active headers record', async () => {
    const r1 = await service.addHeader({ name: 'X-Debug', value: 'true', enabled: true })
    await service.addHeader({ name: 'X-Trace-ID', value: 'trace_abc', enabled: true })

    expect(Object.keys(service.getActiveHeadersRecord()).length).toBe(2)

    if (r1.ok) {
      await service.toggleHeader(r1.value.id, false)
      expect(service.getActiveHeadersRecord()).toEqual({
        'X-Trace-ID': 'trace_abc',
      })
    }
  })

  it('deletes header successfully', async () => {
    const r1 = await service.addHeader({ name: 'Accept-Language', value: 'es-ES', enabled: true })
    if (r1.ok) {
      expect(service.getHeaders().length).toBe(1)
      await service.deleteHeader(r1.value.id)
      expect(service.getHeaders().length).toBe(0)
      expect(service.getActiveHeadersRecord()).toEqual({})
    }
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AuthenticationService } from './auth-service'
import type { AuthRecord } from './types'
import { StorageService } from '@/core/storage'
import { EventBus } from '@/core/events'
import { ok, type Result } from '@/types'
import type { AuthSnapshot, SwaggerAdapter } from '@/adapters'
import { createFakeArea } from '@/tests/fake-storage'

const NOW = 1_700_000_000_000
const PROJECT = 'project_test'

function mockAdapter(overrides: Partial<SwaggerAdapter> = {}): SwaggerAdapter {
  return {
    detect: () => true,
    version: () => null,
    specUrl: () => null,
    readAuth: () => null,
    writeAuth: (): Result<void> => ok(undefined),
    clearAuth: (): Result<void> => ok(undefined),
    readOpenRequests: () => [],
    writeRequest: (): Result<void> => ok(undefined),
    replay: (): Result<void> => ok(undefined),
    isRequestBodyEmpty: () => true,
    readExecutedResponses: () => [],
    listEndpoints: () => [],
    openEndpoint: (): Result<void> => ok(undefined),
    observe: () => () => {},
    ...overrides,
  }
}

function makeJwt(payload: Record<string, unknown>): string {
  const enc = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '')
  return `${enc({ alg: 'HS256' })}.${enc(payload)}.sig`
}

function setup(adapter: SwaggerAdapter = mockAdapter()) {
  const storage = new StorageService({ area: createFakeArea(), now: () => NOW })
  const bus = new EventBus()
  const service = new AuthenticationService({
    storage,
    adapter,
    projectId: PROJECT,
    bus,
    now: () => NOW,
  })
  return { storage, bus, service }
}

const record = (over: Partial<AuthRecord> = {}): AuthRecord => ({
  type: 'bearer',
  token: 'tok',
  environmentId: 'default',
  updatedAt: NOW,
  ...over,
})

describe('AuthenticationService', () => {
  beforeEach(() => {
    /* fresh per test */
  })

  it('applyToken writes the token into Swagger AND persists it (token refresh)', async () => {
    const writeAuth = vi.fn((): Result<void> => ok(undefined))
    const { service } = setup(mockAdapter({ writeAuth }))
    const jwt = makeJwt({ exp: (NOW + 60_000) / 1000 })

    const result = await service.applyToken('default', jwt, 'bearerAuth')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.type).toBe('jwt') // refined from the JWT shape
    expect(result.value.expiresAt).toBe(NOW + 60_000)
    expect(writeAuth).toHaveBeenCalledWith({ type: 'bearer', token: jwt, schemeName: 'bearerAuth' })

    const current = await service.current('default')
    expect(current.ok && current.value?.token).toBe(jwt)
  })

  it('save persists and publishes AUTH_UPDATED', async () => {
    const { service, bus } = setup()
    const spy = vi.fn()
    bus.subscribe('AUTH_UPDATED', spy)

    const result = await service.save(record())
    expect(result.ok).toBe(true)
    expect(spy).toHaveBeenCalledWith({
      projectId: PROJECT,
      environmentId: 'default',
      type: 'bearer',
    })

    const current = await service.current('default')
    expect(current).toEqual({ ok: true, value: record() })
  })

  it('captureFromSwagger persists the currently authorized credential', async () => {
    const readAuth = (): AuthSnapshot => ({
      type: 'bearer',
      token: 'opaque',
      schemeName: 'bearerAuth',
    })
    const { service } = setup(mockAdapter({ readAuth }))

    const result = await service.captureFromSwagger('default')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toMatchObject({
      type: 'bearer',
      token: 'opaque',
      schemeName: 'bearerAuth',
    })
    expect(result.value?.expiresAt).toBeUndefined()
  })

  it('detects a JWT and records its expiry', async () => {
    const token = makeJwt({ exp: 2_000_000_000 })
    const { service } = setup(mockAdapter({ readAuth: () => ({ type: 'bearer', token }) }))

    const result = await service.captureFromSwagger('default')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value?.type).toBe('jwt')
    expect(result.value?.expiresAt).toBe(2_000_000_000_000)
  })

  it('captureFromSwagger returns null when nothing is authorized', async () => {
    const { service } = setup(mockAdapter({ readAuth: () => null }))
    expect(await service.captureFromSwagger('default')).toEqual({ ok: true, value: null })
  })

  it('validate rejects unsupported / empty / expired and accepts valid', () => {
    const { service } = setup()
    // @ts-expect-error — exercising an unsupported type at runtime
    expect(service.validate(record({ type: 'oauth2' }))).toBe(false)
    expect(service.validate(record({ token: '' }))).toBe(false)
    expect(service.validate(record({ expiresAt: NOW - 1 }))).toBe(false)
    expect(service.validate(record({ expiresAt: NOW + 10_000 }))).toBe(true)
  })

  it('restore injects a valid credential into Swagger and emits AUTH_RESTORED', async () => {
    const writeAuth = vi.fn((): Result<void> => ok(undefined))
    const { service, bus } = setup(mockAdapter({ writeAuth }))
    const restored = vi.fn()
    bus.subscribe('AUTH_RESTORED', restored)
    await service.save(record({ schemeName: 'bearerAuth' }))

    const result = await service.restore('default')
    expect(result.ok).toBe(true)
    expect(writeAuth).toHaveBeenCalledWith({
      type: 'bearer',
      token: 'tok',
      schemeName: 'bearerAuth',
    })
    expect(restored).toHaveBeenCalledWith({ projectId: PROJECT, environmentId: 'default' })
  })

  it('does not restore an expired credential — keeps it and emits AUTH_EXPIRED', async () => {
    const writeAuth = vi.fn((): Result<void> => ok(undefined))
    const { service, bus } = setup(mockAdapter({ writeAuth }))
    const expired = vi.fn()
    bus.subscribe('AUTH_EXPIRED', expired)
    await service.save(record({ expiresAt: NOW - 1 }))

    const result = await service.restore('default')
    expect(result).toEqual({ ok: true, value: null })
    expect(writeAuth).not.toHaveBeenCalled()
    expect(expired).toHaveBeenCalledWith({ projectId: PROJECT, environmentId: 'default' })
    // record is kept, not deleted (EC-008)
    const current = await service.current('default')
    expect(current.ok && current.value).toBeTruthy()
  })

  it('restore returns null when there is nothing stored', async () => {
    const { service } = setup()
    expect(await service.restore('default')).toEqual({ ok: true, value: null })
  })

  it('clear removes the record, de-authorizes Swagger, and emits AUTH_CLEARED', async () => {
    const clearAuth = vi.fn((): Result<void> => ok(undefined))
    const { service, bus } = setup(mockAdapter({ clearAuth }))
    const cleared = vi.fn()
    bus.subscribe('AUTH_CLEARED', cleared)
    await service.save(record())

    const result = await service.clear('default')
    expect(result.ok).toBe(true)
    expect(clearAuth).toHaveBeenCalled()
    expect(cleared).toHaveBeenCalledWith({ projectId: PROJECT, environmentId: 'default' })
    expect(await service.current('default')).toEqual({ ok: true, value: null })
  })

  it('isolates credentials per environment', async () => {
    const { service } = setup()
    await service.save(record({ environmentId: 'prod', token: 'prod-tok' }))
    expect(await service.current('default')).toEqual({ ok: true, value: null })
    const prod = await service.current('prod')
    expect(prod.ok && prod.value?.token).toBe('prod-tok')
  })
})

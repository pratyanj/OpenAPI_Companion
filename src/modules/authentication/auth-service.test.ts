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
    onExecute: () => () => {},
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

  it('auto-refresh flag defaults off, persists on, and emits SETTINGS_UPDATED', async () => {
    const { service, bus } = setup()
    const updated = vi.fn()
    bus.subscribe('SETTINGS_UPDATED', updated)

    expect(await service.isAutoRefreshEnabled()).toBe(false)

    const r = await service.setAutoRefreshEnabled(true)
    expect(r.ok).toBe(true)
    expect(await service.isAutoRefreshEnabled()).toBe(true)
    expect(updated).toHaveBeenCalledWith({ keys: ['auto-refresh-token'] })

    await service.setAutoRefreshEnabled(false)
    expect(await service.isAutoRefreshEnabled()).toBe(false)
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

// Named credential vault (PO: "store multiple tokens with their name so they
// don't need to change authorization every time they change account").
describe('AuthenticationService credential vault', () => {
  it('saves what Swagger currently holds under a name, and lists it', async () => {
    const { service } = setup(
      mockAdapter({ readAuth: () => ({ type: 'bearer', token: 'ADMIN_1' }) }),
    )

    const saved = await service.saveAs('Admin', 'default')
    expect(saved.ok && saved.value.name).toBe('Admin')
    expect(saved.ok && saved.value.token).toBe('ADMIN_1')

    const list = await service.listSaved()
    expect(list.ok && list.value.map((c) => c.name)).toEqual(['Admin'])
  })

  it('refuses a blank name and refuses when nothing is authorized', async () => {
    const { service } = setup(mockAdapter({ readAuth: () => ({ type: 'bearer', token: 'T' }) }))
    expect((await service.saveAs('   ', 'default')).ok).toBe(false)

    const { service: empty } = setup(mockAdapter({ readAuth: () => null }))
    expect((await empty.saveAs('Admin', 'default')).ok).toBe(false)
  })

  it('falls back to the stored record when Swagger is not readable yet', async () => {
    const { service } = setup(mockAdapter({ readAuth: () => null }))
    await service.save({
      type: 'bearer',
      token: 'FROM_STORE',
      environmentId: 'default',
      updatedAt: 0,
    })
    const saved = await service.saveAs('Manager', 'default')
    expect(saved.ok && saved.value.token).toBe('FROM_STORE')
  })

  it('re-saving the same name updates that entry instead of duplicating it', async () => {
    const adapter = mockAdapter({ readAuth: () => ({ type: 'bearer', token: 'FIRST' }) })
    const { service } = setup(adapter)
    await service.saveAs('Admin', 'default')

    adapter.readAuth = () => ({ type: 'bearer', token: 'SECOND' })
    await service.saveAs('Admin', 'default')

    const list = await service.listSaved()
    expect(list.ok && list.value).toHaveLength(1)
    expect(list.ok && list.value[0]?.token).toBe('SECOND')
  })

  // The point of the feature: switching accounts must actually authorize Swagger,
  // not just record a preference.
  it('using a saved credential injects it into Swagger and becomes the active record', async () => {
    const written: unknown[] = []
    const adapter = mockAdapter({
      readAuth: () => ({ type: 'bearer', token: 'ADMIN_1', schemeName: 'bearerAuth' }),
      writeAuth: (auth) => {
        written.push(auth)
        return ok(undefined)
      },
    })
    const { service } = setup(adapter)
    const saved = await service.saveAs('Admin', 'default')
    if (!saved.ok) throw new Error('save failed')

    const used = await service.activateSaved(saved.value.id, 'default')
    expect(used.ok && used.value.token).toBe('ADMIN_1')
    expect(written).toEqual([{ type: 'bearer', token: 'ADMIN_1', schemeName: 'bearerAuth' }])

    const active = await service.current('default')
    expect(active.ok && active.value?.token).toBe('ADMIN_1')
  })

  it('reports a missing credential rather than clearing auth', async () => {
    const { service } = setup(mockAdapter())
    expect((await service.activateSaved('cred_nope', 'default')).ok).toBe(false)
  })

  it('deletes a saved credential', async () => {
    const { service } = setup(mockAdapter({ readAuth: () => ({ type: 'bearer', token: 'T' }) }))
    const saved = await service.saveAs('Admin', 'default')
    if (!saved.ok) throw new Error('save failed')

    expect((await service.deleteSaved(saved.value.id)).ok).toBe(true)
    const list = await service.listSaved()
    expect(list.ok && list.value).toEqual([])
  })

  // Regression: the active credential was inferred by comparing tokens, which
  // stopped matching whenever Swagger handed the token back in another form — so
  // refresh reported "no credentials saved" for an account that had them.
  it('remembers which credential is in use, independently of the token value', async () => {
    const adapter = mockAdapter({ readAuth: () => ({ type: 'bearer', token: 'DEV_1' }) })
    const { service } = setup(adapter)

    const dev = await service.saveAs('dev', 'default')
    if (!dev.ok) throw new Error('save failed')
    await service.setLogin(dev.value.id, { username: 'dev@acme.io', password: 'p1' })

    // Swagger now reports a differently-formatted token (scheme prefix), and the
    // stored record is updated from the page — token equality would fail here.
    await service.save({
      type: 'bearer',
      token: 'Bearer DEV_1',
      environmentId: 'default',
      updatedAt: 0,
    })

    const login = await service.activeLogin('default')
    expect(login).toMatchObject({ credentialId: dev.value.id, username: 'dev@acme.io' })
    expect(await service.activeCredentialName('default')).toBe('dev')
  })

  it('refreshing one credential leaves the others untouched', async () => {
    const adapter = mockAdapter({ readAuth: () => ({ type: 'bearer', token: 'DEV_1' }) })
    const { service } = setup(adapter)
    const dev = await service.saveAs('dev', 'default')
    adapter.readAuth = () => ({ type: 'bearer', token: 'ADMIN_1' })
    const admin = await service.saveAs('admin', 'default')
    if (!dev.ok || !admin.ok) throw new Error('save failed')

    await service.updateSavedToken(admin.value.id, 'ADMIN_2')

    const saved = await service.listSaved()
    if (!saved.ok) throw new Error('list failed')
    const byName = new Map(saved.value.map((c) => [c.name, c.token]))
    expect(byName.get('admin')).toBe('ADMIN_2')
    expect(byName.get('dev')).toBe('DEV_1') // untouched
  })

  // apiKey schemes carry the token as "Bearer <jwt>" — the prefix is part of the
  // value the API checks. A refreshed token is raw, so the prefix must be kept or
  // the re-authorized request 401s all over again.
  describe('Bearer prefix', () => {
    const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjk5OTk5OTk5OTl9.sig'

    it('re-applies the previous token’s Bearer prefix on refresh', async () => {
      const written: string[] = []
      const adapter = mockAdapter({
        readAuth: () => ({ type: 'apiKey', token: `Bearer ${JWT}`, schemeName: 'Bearer' }),
        writeAuth: (auth) => {
          written.push(auth.token)
          return ok(undefined)
        },
      })
      const { service } = setup(adapter)
      // The stored credential was captured as "Bearer <jwt>".
      await service.captureFromSwagger('default')

      // Refresh hands back a RAW token from the login response.
      const applied = await service.applyToken('default', JWT, 'Bearer')
      expect(applied.ok && applied.value.token).toBe(`Bearer ${JWT}`)
      // …and that's what was written into Swagger, not the bare jwt.
      expect(written.at(-1)).toBe(`Bearer ${JWT}`)
    })

    it('does not add a prefix when the scheme never used one', async () => {
      const adapter = mockAdapter({
        readAuth: () => ({ type: 'bearer', token: JWT }),
      })
      const { service } = setup(adapter)
      await service.captureFromSwagger('default')
      const applied = await service.applyToken('default', JWT)
      expect(applied.ok && applied.value.token).toBe(JWT) // Swagger adds Bearer itself
    })

    it('still reads the JWT expiry through a Bearer prefix', async () => {
      const adapter = mockAdapter({
        readAuth: () => ({ type: 'apiKey', token: `Bearer ${JWT}`, schemeName: 'Bearer' }),
      })
      const { service } = setup(adapter)
      const captured = await service.captureFromSwagger('default')
      // exp: 9999999999 (seconds) → ms
      expect(captured.ok && captured.value?.expiresAt).toBe(9_999_999_999_000)
    })

    it('forces the prefix on when the toggle is enabled, off when disabled', async () => {
      const written: string[] = []
      const adapter = mockAdapter({
        readAuth: () => ({ type: 'apiKey', token: JWT, schemeName: 'Bearer' }),
        writeAuth: (auth) => {
          written.push(auth.token)
          return ok(undefined)
        },
      })
      const { service } = setup(adapter)

      // Toggle OFF → applied token is raw, even though the scheme could take Bearer.
      await service.setBearerPrefixEnabled('default', false)
      const off = await service.applyToken('default', JWT, 'Bearer')
      expect(off.ok && off.value.token).toBe(JWT)

      // Toggle ON → applied token carries the prefix.
      await service.setBearerPrefixEnabled('default', true)
      const on = await service.applyToken('default', JWT, 'Bearer')
      expect(on.ok && on.value.token).toBe(`Bearer ${JWT}`)
    })

    it('re-applies the token in use the moment the toggle changes', async () => {
      const written: string[] = []
      const adapter = mockAdapter({
        readAuth: () => ({ type: 'apiKey', token: `Bearer ${JWT}`, schemeName: 'Bearer' }),
        writeAuth: (auth) => {
          written.push(auth.token)
          return ok(undefined)
        },
      })
      const { service } = setup(adapter)
      await service.captureFromSwagger('default') // stored as "Bearer <jwt>"

      await service.setBearerPrefixEnabled('default', false)
      // No refresh needed: the current token was re-applied raw straight away.
      expect(written.at(-1)).toBe(JWT)
      const current = await service.current('default')
      expect(current.ok && current.value?.token).toBe(JWT)
    })

    it('defaults the toggle to what the current token uses', async () => {
      const withPrefix = setup(
        mockAdapter({ readAuth: () => ({ type: 'apiKey', token: `Bearer ${JWT}` }) }),
      )
      await withPrefix.service.captureFromSwagger('default')
      expect(await withPrefix.service.isBearerPrefixEnabled('default')).toBe(true)

      const raw = setup(mockAdapter({ readAuth: () => ({ type: 'jwt', token: JWT }) }))
      await raw.service.captureFromSwagger('default')
      expect(await raw.service.isBearerPrefixEnabled('default')).toBe(false)
    })

    it('gives an added account the same prefix its siblings use', async () => {
      const adapter = mockAdapter({
        readAuth: () => ({ type: 'apiKey', token: `Bearer DEV_JWT`, schemeName: 'Bearer' }),
      })
      const { service } = setup(adapter)
      await service.saveAs('dev', 'default') // saves "Bearer DEV_JWT"

      const added = await service.addCredential('admin', JWT, 'default')
      expect(added.ok && added.value.token).toBe(`Bearer ${JWT}`)
      expect(added.ok && added.value.schemeName).toBe('Bearer')
    })

    it('clears active credential link when applying a custom/unrelated token', async () => {
      const adapter = mockAdapter({ readAuth: () => ({ type: 'bearer', token: 'DEV_TOKEN' }) })
      const { service } = setup(adapter)
      const saved = await service.saveAs('dev', 'default')
      if (!saved.ok) throw new Error('save failed')

      await service.activateSaved(saved.value.id, 'default')
      expect(await service.activeCredentialName('default')).toBe('dev')

      // Now apply an unrelated custom token (e.g. from a pasted cURL)
      const applied = await service.applyToken('default', 'CUSTOM_CURL_TOKEN')
      expect(applied.ok).toBe(true)

      // Active credential name should now be null (not dev!)
      expect(await service.activeCredentialName('default')).toBeNull()

      // activeLogin should return null rather than falling back to dev
      expect(await service.activeLogin('default')).toBeNull()
    })

    it('links active credential when applying a token that matches a saved account', async () => {
      const adapter = mockAdapter({ readAuth: () => ({ type: 'bearer', token: 'DEV_TOKEN' }) })
      const { service } = setup(adapter)
      const dev = await service.saveAs('dev', 'default')
      if (!dev.ok) throw new Error('save failed')

      // Apply dev's token directly
      await service.applyToken('default', 'DEV_TOKEN')
      expect(await service.activeCredentialName('default')).toBe('dev')
    })
  })
})

import { describe, it, expect, vi } from 'vitest'
import { ok, type Result } from '@/types'
import { EventBus } from '@/core/events'
import type { ExecutedResponse, SwaggerAdapter } from '@/adapters'
import {
  TokenRefreshService,
  extractToken,
  type RefreshAuthApi,
  type RefreshTemplateApi,
  type TemplateLike,
} from './token-refresh'

const NOW = 1_000_000

function mockAdapter(responses: () => ExecutedResponse[]): SwaggerAdapter {
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
    readExecutedResponses: responses,
    listEndpoints: () => [],
    openEndpoint: (): Result<void> => ok(undefined),
    observe: () => () => {},
  }
}

const loginTemplate: TemplateLike = {
  templateId: 'tpl1',
  name: 'QA login',
  endpointId: 'post /auth/login',
  environmentId: 'qa',
}

function mockAuth(
  expiresAt: number | undefined,
  applyToken = vi.fn(async () => ok({})),
): RefreshAuthApi & { applyToken: ReturnType<typeof vi.fn> } {
  return {
    current: vi.fn(async () =>
      ok(expiresAt === -1 ? null : { token: 'OLD', schemeName: 'bearerAuth', expiresAt }),
    ),
    applyToken,
  }
}

function mockTemplates(
  templates: TemplateLike[],
  applyTemplate = vi.fn(async (): Promise<Result<void>> => ok(undefined)),
): RefreshTemplateApi & { applyTemplate: ReturnType<typeof vi.fn> } {
  return {
    listTemplates: vi.fn(async () => ok(templates)),
    applyTemplate,
  }
}

function makeService(opts: {
  responses?: () => ExecutedResponse[]
  auth: RefreshAuthApi
  templates: RefreshTemplateApi
  bus?: EventBus
}) {
  return new TokenRefreshService({
    adapter: mockAdapter(opts.responses ?? (() => [])),
    auth: opts.auth,
    templates: opts.templates,
    bus: opts.bus,
    now: () => NOW,
    pollMs: 100,
    timeoutMs: 500,
    setTimeoutFn: (fn) => fn(),
  })
}

describe('extractToken', () => {
  it('finds tokens by common key names, preferring specific ones', () => {
    expect(extractToken({ access_token: 'A'.repeat(20), token: 'B'.repeat(20) })).toBe(
      'A'.repeat(20),
    )
    expect(extractToken({ token: 'T'.repeat(20) })).toBe('T'.repeat(20))
  })

  it('searches nested objects and arrays', () => {
    expect(extractToken({ data: { auth: { accessToken: 'N'.repeat(20) } } })).toBe('N'.repeat(20))
    expect(extractToken({ results: [{ jwt: 'J'.repeat(20) }] })).toBe('J'.repeat(20))
  })

  it('ignores short/non-string values and returns null when absent', () => {
    expect(extractToken({ token: 'short' })).toBeNull()
    expect(extractToken({ token: 12345 })).toBeNull()
    expect(extractToken({ user: 'x' })).toBeNull()
  })
})

describe('TokenRefreshService.findLoginTemplate', () => {
  it('matches login-like names/endpoints, preferring the current environment', async () => {
    const devLogin: TemplateLike = {
      ...loginTemplate,
      templateId: 'tpl2',
      name: 'DEV login',
      environmentId: 'dev',
    }
    const other: TemplateLike = {
      templateId: 'x',
      name: 'Create user',
      endpointId: 'post /users',
      environmentId: 'qa',
    }
    const service = makeService({
      auth: mockAuth(0),
      templates: mockTemplates([other, devLogin, loginTemplate]),
    })
    expect((await service.findLoginTemplate('qa'))?.templateId).toBe('tpl1')
    expect((await service.findLoginTemplate('dev'))?.templateId).toBe('tpl2')
    // No env match → falls back to the first login-like template.
    expect((await service.findLoginTemplate('prod'))?.templateId).toBe('tpl2')
  })

  it('returns null when nothing looks like a login request', async () => {
    const service = makeService({
      auth: mockAuth(0),
      templates: mockTemplates([
        { templateId: 'x', name: 'Create user', endpointId: 'post /users', environmentId: 'qa' },
      ]),
    })
    expect(await service.findLoginTemplate('qa')).toBeNull()
  })
})

describe('TokenRefreshService.refreshIfExpired', () => {
  const FRESH = 'FRESH_TOKEN_VALUE_123'

  it('runs the login template, extracts the token, and applies it', async () => {
    // The login response "renders" only after applyTemplate ran.
    let executed = false
    const responses = (): ExecutedResponse[] =>
      executed
        ? [
            {
              endpointId: 'post /auth/login',
              method: 'post',
              endpoint: '/auth/login',
              status: 200,
              responseBody: JSON.stringify({ data: { access_token: FRESH } }),
            },
          ]
        : []
    const applyTemplate = vi.fn(async (): Promise<Result<void>> => {
      executed = true
      return ok(undefined)
    })
    const auth = mockAuth(NOW - 1) // expired
    const bus = new EventBus()
    const toast = vi.fn()
    bus.subscribe('NOTIFY', toast)
    const service = makeService({
      responses,
      auth,
      templates: mockTemplates([loginTemplate], applyTemplate),
      bus,
    })

    const result = await service.refreshIfExpired('qa')
    expect(result).toEqual({ ok: true, value: true })
    expect(applyTemplate).toHaveBeenCalledWith('tpl1')
    expect(auth.applyToken).toHaveBeenCalledWith('qa', FRESH, 'bearerAuth')
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ kind: 'success' }))
  })

  it('ignores a stale login response already rendered before the refresh', async () => {
    // The same response exists before AND after — must not be treated as new.
    const stale: ExecutedResponse = {
      endpointId: 'post /auth/login',
      method: 'post',
      endpoint: '/auth/login',
      status: 200,
      responseBody: JSON.stringify({ access_token: 'STALE_TOKEN_VALUE_1' }),
    }
    const auth = mockAuth(NOW - 1)
    const service = makeService({
      responses: () => [stale],
      auth,
      templates: mockTemplates([loginTemplate]),
    })

    const result = await service.refreshIfExpired('qa')
    expect(result).toEqual({ ok: true, value: false })
    expect(auth.applyToken).not.toHaveBeenCalled()
  })

  it('does nothing when the token is still valid', async () => {
    const auth = mockAuth(NOW + 60_000)
    const templates = mockTemplates([loginTemplate])
    const service = makeService({ auth, templates })

    expect(await service.refreshIfExpired('qa')).toEqual({ ok: true, value: false })
    expect(templates.applyTemplate).not.toHaveBeenCalled()
  })

  it('does nothing without a stored credential or without a login template', async () => {
    const noCred = makeService({ auth: mockAuth(-1), templates: mockTemplates([loginTemplate]) })
    expect(await noCred.refreshIfExpired('qa')).toEqual({ ok: true, value: false })

    const noTemplate = makeService({ auth: mockAuth(NOW - 1), templates: mockTemplates([]) })
    expect(await noTemplate.refreshIfExpired('qa')).toEqual({ ok: true, value: false })
  })

  it('warns when the login response carries no token', async () => {
    let executed = false
    const responses = (): ExecutedResponse[] =>
      executed
        ? [
            {
              endpointId: 'post /auth/login',
              method: 'post',
              endpoint: '/auth/login',
              status: 200,
              responseBody: '{"message":"ok"}',
            },
          ]
        : []
    const applyTemplate = vi.fn(async (): Promise<Result<void>> => {
      executed = true
      return ok(undefined)
    })
    const bus = new EventBus()
    const toast = vi.fn()
    bus.subscribe('NOTIFY', toast)
    const auth = mockAuth(NOW - 1)
    const service = makeService({
      responses,
      auth,
      templates: mockTemplates([loginTemplate], applyTemplate),
      bus,
    })

    const result = await service.refreshIfExpired('qa')
    expect(result).toEqual({ ok: true, value: false })
    expect(auth.applyToken).not.toHaveBeenCalled()
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ kind: 'warning' }))
  })
})

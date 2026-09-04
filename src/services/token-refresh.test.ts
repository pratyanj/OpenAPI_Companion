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
    onExecute: () => () => {},
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
  applyToken = vi.fn(async (_e: string, t: string) => ok({ token: t })),
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
  enabled?: () => boolean
  cooldownMs?: number
}) {
  return new TokenRefreshService({
    adapter: mockAdapter(opts.responses ?? (() => [])),
    auth: opts.auth,
    templates: opts.templates,
    bus: opts.bus,
    enabled: opts.enabled,
    cooldownMs: opts.cooldownMs ?? 0,
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

  it('does nothing when the feature is disabled', async () => {
    const auth = mockAuth(NOW - 1) // expired
    const templates = mockTemplates([loginTemplate])
    const service = makeService({ auth, templates, enabled: () => false })
    expect(await service.refreshIfExpired('qa')).toEqual({ ok: true, value: false })
    expect(templates.applyTemplate).not.toHaveBeenCalled()
  })
})

const NEW_TOKEN = 'NEW_TOKEN_VALUE_456'

/** Login response that renders only after applyTemplate ran. */
function loginResponses(executedRef: { done: boolean }, before: ExecutedResponse[] = []) {
  return (): ExecutedResponse[] =>
    executedRef.done
      ? [
          ...before,
          {
            endpointId: 'post /auth/login',
            method: 'post',
            endpoint: '/auth/login',
            status: 200,
            responseBody: JSON.stringify({ access_token: NEW_TOKEN }),
          },
        ]
      : before
}

describe('TokenRefreshService — 401/403 response trigger', () => {
  const unauthorized: ExecutedResponse = {
    endpointId: 'get /site-surveys',
    method: 'get',
    endpoint: '/site-surveys',
    status: 401,
    responseBody: '{"detail":"token expired"}',
  }

  it('refreshes on a new 401 even for an opaque token (no exp)', async () => {
    const ref = { done: false }
    const applyTemplate = vi.fn(async (): Promise<Result<void>> => {
      ref.done = true
      return ok(undefined)
    })
    const auth = mockAuth(undefined) // opaque token: no expiresAt at all
    const service = makeService({
      responses: loginResponses(ref, [unauthorized]),
      auth,
      templates: mockTemplates([loginTemplate], applyTemplate),
    })

    const result = await service.noticeResponses('qa')
    expect(result).toEqual({ ok: true, value: true })
    expect(applyTemplate).toHaveBeenCalledWith('tpl1')
    expect(auth.applyToken).toHaveBeenCalledWith('qa', NEW_TOKEN, 'bearerAuth')
  })

  it('ignores non-4xx responses and does not double-fire on the same 401', async () => {
    const ref = { done: false }
    const auth = mockAuth(undefined)
    const service = makeService({
      responses: loginResponses(ref, [unauthorized]),
      auth,
      templates: mockTemplates([loginTemplate]),
    })
    await service.noticeResponses('qa') // handles the 401 once
    const second = service.noticeResponses('qa') // same signature → ignored
    expect(second).toBeUndefined()
  })

  it('does nothing on 401 when disabled', () => {
    const service = makeService({
      responses: () => [unauthorized],
      auth: mockAuth(undefined),
      templates: mockTemplates([loginTemplate]),
      enabled: () => false,
    })
    expect(service.noticeResponses('qa')).toBeUndefined()
  })

  it('honors the cooldown between attempts (breaks login-failure loops)', async () => {
    const auth = mockAuth(NOW - 1)
    const templates = mockTemplates([loginTemplate])
    // Large cooldown + constant clock → the second attempt is always within it.
    const service = makeService({ auth, templates, cooldownMs: 60_000 })

    await service.refreshIfExpired('qa') // first attempt runs (finds no token → ok(false))
    templates.applyTemplate.mockClear()
    await service.refreshIfExpired('qa') // within cooldown → skipped
    expect(templates.applyTemplate).not.toHaveBeenCalled()
  })

  // Regression: this returned false and said nothing, so an enabled toggle looked
  // broken when the real problem was a missing prerequisite.
  it('warns once when the token is expired but no login request is saved', async () => {
    const bus = new EventBus()
    const notes: unknown[] = []
    bus.subscribe('NOTIFY', (p) => notes.push(p))
    const service = new TokenRefreshService({
      adapter: mockAdapter(() => []),
      auth: {
        current: async () => ok({ token: 'OLD', expiresAt: NOW - 1000 }),
        applyToken: async (_e, t) => ok({ token: t }),
      },
      templates: { listTemplates: async () => ok([]), applyTemplate: async () => ok(undefined) },
      bus,
      now: () => NOW,
      cooldownMs: 0,
    })

    expect(await service.refreshIfExpired('default')).toEqual({ ok: true, value: false })
    expect(notes).toHaveLength(1)
    expect(notes[0]).toMatchObject({ kind: 'warning' })

    // Repeated DOM churn must not spam the same warning.
    await service.refreshIfExpired('default')
    expect(notes).toHaveLength(1)
  })

  // The real-world shape that failed: token nested under data.tokens, and a body
  // that arrived with Swagger's "Download" label glued to the front.
  it('extracts a nested access_token, even from a body with a stray prefix', async () => {
    const LOGIN = 'post /auth/login'
    const body = JSON.stringify({
      success: true,
      data: {
        user: { id: '36a0db17', email: 'dhruv@gmc.com' },
        tokens: {
          access_token: 'eyJhbGciOi.PAYLOAD.SIG',
          refresh_token: 'r',
          token_type: 'bearer',
        },
      },
    })

    // Nothing rendered until the login actually runs — the service only accepts a
    // response that appeared AFTER it applied the template.
    let responses: ExecutedResponse[] = []
    let applied: string | null = null

    const service = new TokenRefreshService({
      adapter: mockAdapter(() => responses),
      auth: {
        current: async () => ok({ token: 'OLD', expiresAt: NOW - 1000, schemeName: 'Bearer' }),
        applyToken: async (_env, token) => {
          applied = token
          return ok({ token })
        },
      },
      templates: {
        listTemplates: async () =>
          ok([{ templateId: 't1', name: 'DEV', endpointId: LOGIN, environmentId: 'default' }]),
        applyTemplate: async () => {
          responses = [
            {
              endpointId: LOGIN,
              method: 'post',
              endpoint: '/auth/login',
              status: 200,
              responseBody: `Download${body}`,
            },
          ]
          return ok(undefined)
        },
      },
      now: () => NOW,
      cooldownMs: 0,
      setTimeoutFn: (fn) => {
        fn()
        return 0
      },
    })

    expect(await service.refreshIfExpired('default')).toEqual({ ok: true, value: true })
    expect(applied).toBe('eyJhbGciOi.PAYLOAD.SIG')
  })

  // With several tokens saved, a shared login template would refresh the WRONG
  // account. The credential in use carries its own login, so it wins — and only
  // that credential's stored token is rewritten.
  it('signs in with the active token’s own credentials and updates only that token', async () => {
    const LOGIN = 'post /auth/login'
    let applied: string | null = null
    let replayedBody: string | undefined
    const updated: Array<[string, string]> = []
    let responses: ExecutedResponse[] = []

    const service = new TokenRefreshService({
      adapter: {
        ...mockAdapter(() => responses),
        listEndpoints: () => [
          { endpointId: 'get /users', method: 'get', path: '/users' },
          { endpointId: LOGIN, method: 'post', path: '/auth/login' },
        ],
        // The endpoint was last called with an extra field — it must survive.
        readOpenRequests: () => [
          {
            endpointId: LOGIN,
            method: 'post',
            body: '{"email":"old@acme.io","password":"old","tenant":"acme"}',
          },
        ],
        replay: (_id, body) => {
          replayedBody = body
          responses = [
            {
              endpointId: LOGIN,
              method: 'post',
              endpoint: '/auth/login',
              status: 200,
              responseBody: '{"data":{"tokens":{"access_token":"ADMIN_NEW"}}}',
            },
          ]
          return ok(undefined)
        },
      },
      auth: {
        current: async () => ok({ token: 'ADMIN_OLD', expiresAt: NOW - 1000 }),
        applyToken: async (_env, token) => {
          applied = token
          return ok({ token })
        },
      },
      // A matching template exists and must be ignored in favour of the account's
      // own credentials.
      templates: {
        listTemplates: async () =>
          ok([
            {
              templateId: 't1',
              name: 'DEV login',
              endpointId: LOGIN,
              environmentId: 'default',
            },
          ]),
        applyTemplate: async () => {
          throw new Error('must not re-run the shared template')
        },
      },
      vault: {
        activeLogin: async () => ({
          credentialId: 'cred_admin',
          username: 'admin@acme.io',
          password: 'secret',
        }),
        updateSavedToken: async (id, token) => {
          updated.push([id, token])
          return ok(undefined)
        },
      },
      now: () => NOW,
      cooldownMs: 0,
      setTimeoutFn: (fn) => {
        fn()
        return 0
      },
    })

    expect(await service.refreshIfExpired('default')).toEqual({ ok: true, value: true })
    expect(applied).toBe('ADMIN_NEW')
    // Credentials swapped in, `tenant` preserved — no URL or field names needed.
    expect(JSON.parse(replayedBody ?? '{}')).toEqual({
      email: 'admin@acme.io',
      password: 'secret',
      tenant: 'acme',
    })
    // Exactly one saved token rewritten: the one that was signed in.
    expect(updated).toEqual([['cred_admin', 'ADMIN_NEW']])
  })

  it('says so when the API exposes no login endpoint to sign in with', async () => {
    const notes: unknown[] = []
    const bus = new EventBus()
    bus.subscribe('NOTIFY', (p) => notes.push(p))
    const service = new TokenRefreshService({
      adapter: { ...mockAdapter(() => []), listEndpoints: () => [] },
      auth: {
        current: async () => ok({ token: 'OLD', expiresAt: NOW - 1000 }),
        applyToken: async (_e, t) => ok({ token: t }),
      },
      templates: { listTemplates: async () => ok([]), applyTemplate: async () => ok(undefined) },
      vault: {
        activeLogin: async () => ({ credentialId: 'c1', username: 'u', password: 'p' }),
        updateSavedToken: async () => ok(undefined),
      },
      bus,
      now: () => NOW,
      cooldownMs: 0,
    })

    expect(await service.refreshIfExpired('default')).toEqual({ ok: true, value: false })
    expect(notes[0]).toMatchObject({ kind: 'warning' })
  })
})
// Regression: matching on `auth` alone picked POST /auth/forgot-password and sent
// the saved password there, which emails the user. Selection must be strict, and
// must refuse to guess rather than hit a destructive endpoint.
describe('TokenRefreshService login endpoint selection', () => {
  const endpointsOf = (paths: Array<[string, string]>) =>
    paths.map(([method, path]) => ({ endpointId: `${method} ${path}`, method, path }))

  const service = (paths: Array<[string, string]>) =>
    new TokenRefreshService({
      adapter: { ...mockAdapter(() => []), listEndpoints: () => endpointsOf(paths) },
      auth: { current: async () => ok(null), applyToken: async (_e, t) => ok({ token: t }) },
      templates: { listTemplates: async () => ok([]), applyTemplate: async () => ok(undefined) },
      now: () => NOW,
    })

  it('picks the real sign-in over other auth endpoints, whatever the order', () => {
    // forgot-password listed FIRST — the order that produced the bug.
    expect(
      service([
        ['post', '/auth/forgot-password'],
        ['post', '/auth/login'],
        ['post', '/auth/logout'],
      ]).findLoginEndpoint(),
    ).toBe('post /auth/login')

    expect(
      service([
        ['post', '/auth/register'],
        ['post', '/api/v1/signin'],
      ]).findLoginEndpoint(),
    ).toBe('post /api/v1/signin')
  })

  it('refuses to guess when there is no sign-in endpoint', () => {
    for (const paths of [
      [['post', '/auth/forgot-password']],
      [['post', '/auth/reset-password']],
      [['post', '/auth/register']],
      [['post', '/auth/refresh']],
      [['post', '/auth/verify-otp']],
      [['post', '/users']],
      [],
    ] as Array<Array<[string, string]>>) {
      expect(service(paths).findLoginEndpoint()).toBeNull()
    }
  })

  it('ignores GET endpoints and non-sign-in summaries', () => {
    expect(service([['get', '/auth/login']]).findLoginEndpoint()).toBeNull()
  })
})

// "Add account": sign in with credentials and hand back the token, without
// disturbing whatever is currently authorized.
describe('TokenRefreshService.signIn', () => {
  const LOGIN = 'post /auth/login'

  it('returns the token issued by the login response', async () => {
    let responses: ExecutedResponse[] = []
    const service = new TokenRefreshService({
      adapter: {
        ...mockAdapter(() => responses),
        listEndpoints: () => [{ endpointId: LOGIN, method: 'post', path: '/auth/login' }],
        replay: () => {
          responses = [
            {
              endpointId: LOGIN,
              method: 'post',
              endpoint: '/auth/login',
              status: 200,
              responseBody: '{"data":{"tokens":{"access_token":"NEW_ADMIN"}}}',
            },
          ]
          return ok(undefined)
        },
      },
      auth: {
        current: async () => ok(null),
        applyToken: async (): Promise<Result<{ token: string }>> => {
          throw new Error('adding an account must not change what is authorized')
        },
      },
      templates: { listTemplates: async () => ok([]), applyTemplate: async () => ok(undefined) },
      now: () => NOW,
      setTimeoutFn: (fn) => {
        fn()
        return 0
      },
    })

    expect(await service.signIn({ username: 'admin@acme.io', password: 'p' })).toEqual({
      ok: true,
      value: 'NEW_ADMIN',
    })
    // And it's visible in the activity log.
    expect(service.recentActivity()[0]).toMatchObject({ outcome: 'success' })
  })

  it('fails clearly when the API has no sign-in endpoint', async () => {
    const service = new TokenRefreshService({
      adapter: { ...mockAdapter(() => []), listEndpoints: () => [] },
      auth: { current: async () => ok(null), applyToken: async (_e, t) => ok({ token: t }) },
      templates: { listTemplates: async () => ok([]), applyTemplate: async () => ok(undefined) },
      now: () => NOW,
    })
    const result = await service.signIn({ username: 'u', password: 'p' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('AUTH_NO_LOGIN_ENDPOINT')
  })

  // The manual "Refresh now" button must run even with the toggle OFF — it exists
  // to test the flow on demand. It was gated by enabled() and did nothing.
  it('refreshNow runs even when auto-refresh is disabled', async () => {
    const LOGIN = 'post /auth/login'
    let applied: string | null = null
    let responses: ExecutedResponse[] = []
    const service = new TokenRefreshService({
      adapter: {
        ...mockAdapter(() => responses),
        listEndpoints: () => [{ endpointId: LOGIN, method: 'post', path: '/auth/login' }],
        replay: () => {
          responses = [
            {
              endpointId: LOGIN,
              method: 'post',
              endpoint: '/auth/login',
              status: 200,
              responseBody: '{"data":{"tokens":{"access_token":"FRESH_TOKEN_9999"}}}',
            },
          ]
          return ok(undefined)
        },
      },
      auth: {
        current: async () => ok({ token: 'OLD' }),
        applyToken: async (_e, t) => {
          applied = t
          return ok({ token: t })
        },
      },
      templates: { listTemplates: async () => ok([]), applyTemplate: async () => ok(undefined) },
      vault: {
        activeLogin: async () => ({ credentialId: 'c1', username: 'u@x.com', password: 'p' }),
        updateSavedToken: async () => ok(undefined),
      },
      enabled: () => false, // toggle OFF
      now: () => NOW,
      setTimeoutFn: (fn) => {
        fn()
        return 0
      },
    })

    expect(await service.refreshNow('default')).toEqual({ ok: true, value: true })
    expect(applied).toBe('FRESH_TOKEN_9999')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Auto-retry after 401 refresh
// ─────────────────────────────────────────────────────────────────────────────

describe('TokenRefreshService — auto-retry after successful refresh', () => {
  const LOGIN = 'post /auth/login'
  const FAILING = 'get /projects'
  const NEW_TOKEN_RETRY = 'eyJhbGciOi.PAYLOAD.RETRY'

  /** Failing 401 response — what triggers noticeResponses() to act. */
  const failing401: ExecutedResponse = {
    endpointId: FAILING,
    method: 'get',
    endpoint: '/projects',
    status: 401,
    responseBody: '{"detail":"Unauthorized"}',
  }

  /**
   * An adapter that:
   * - starts with the failing 401 (so noticeResponses can detect it)
   * - switches to the login 200 once loginDone is set
   * - records all replay() calls
   */
  function replayTracker(loginDoneRef: { value: boolean }) {
    const calls: Array<{ id: string; body: string | undefined }> = []
    const adapter: SwaggerAdapter = {
      ...mockAdapter(() =>
        loginDoneRef.value
          ? [
              {
                endpointId: LOGIN,
                method: 'post',
                endpoint: '/auth/login',
                status: 200,
                responseBody: JSON.stringify({ access_token: NEW_TOKEN_RETRY }),
              },
            ]
          : [failing401],
      ),
      listEndpoints: () => [
        { endpointId: LOGIN, method: 'post', path: '/auth/login' },
        { endpointId: FAILING, method: 'get', path: '/projects' },
      ],
      readOpenRequests: () => [{ endpointId: FAILING, method: 'get', body: '{}' }],
      replay: (id, body) => {
        calls.push({ id, body })
        return ok(undefined)
      },
    }
    return { adapter, calls }
  }

  it('replays the failing endpoint after a successful credential-based refresh', async () => {
    const loginDoneRef = { value: false }
    const { adapter, calls } = replayTracker(loginDoneRef)

    const service = new TokenRefreshService({
      adapter,
      auth: {
        current: async () => ok({ token: 'OLD', expiresAt: NOW - 1000, schemeName: 'bearerAuth' }),
        applyToken: async (_e, t) => ok({ token: t }),
      },
      templates: { listTemplates: async () => ok([]), applyTemplate: async () => ok(undefined) },
      vault: {
        activeLogin: async () => ({
          credentialId: 'c1',
          username: 'user@test.com',
          password: 'pw',
        }),
        updateSavedToken: async () => ok(undefined),
      },
      now: () => NOW,
      cooldownMs: 0,
      setTimeoutFn: (fn) => {
        loginDoneRef.value = true
        fn()
        return 0
      },
    })

    await service.noticeResponses('default')

    // replay() is called once for the login (via adapter.replay inside loginWithCredentials),
    // and once for the failing endpoint retry.
    expect(calls.some((c) => c.id === FAILING)).toBe(true)
  })

  it('replays the failing endpoint after a successful template-based refresh', async () => {
    const loginDoneRef = { value: false }
    const { adapter, calls } = replayTracker(loginDoneRef)

    const service = new TokenRefreshService({
      adapter,
      auth: {
        current: async () => ok({ token: 'OLD', expiresAt: NOW - 1000, schemeName: 'bearerAuth' }),
        applyToken: async (_e, t) => ok({ token: t }),
      },
      templates: {
        listTemplates: async () =>
          ok([{ templateId: 't1', name: 'login', endpointId: LOGIN, environmentId: 'default' }]),
        applyTemplate: async () => {
          loginDoneRef.value = true
          return ok(undefined)
        },
      },
      now: () => NOW,
      cooldownMs: 0,
      setTimeoutFn: (fn) => {
        fn()
        return 0
      },
    })

    await service.noticeResponses('default')

    expect(calls.some((c) => c.id === FAILING)).toBe(true)
  })

  it('skips the retry when retryRequest returns false', async () => {
    const loginDoneRef = { value: false }
    const { adapter, calls } = replayTracker(loginDoneRef)

    const service = new TokenRefreshService({
      adapter,
      auth: {
        current: async () => ok({ token: 'OLD', expiresAt: NOW - 1000, schemeName: 'bearerAuth' }),
        applyToken: async (_e, t) => ok({ token: t }),
      },
      templates: {
        listTemplates: async () =>
          ok([{ templateId: 't1', name: 'login', endpointId: LOGIN, environmentId: 'default' }]),
        applyTemplate: async () => {
          loginDoneRef.value = true
          return ok(undefined)
        },
      },
      retryRequest: () => false, // ← opt out
      now: () => NOW,
      cooldownMs: 0,
      setTimeoutFn: (fn) => {
        fn()
        return 0
      },
    })

    await service.noticeResponses('default')

    // The failing endpoint must NOT appear in replay calls.
    expect(calls.some((c) => c.id === FAILING)).toBe(false)
  })

  it('does NOT retry when the refresh itself fails to find a token', async () => {
    // Login endpoint returns a 200 with no token — awaitLoginToken times out.
    const adapter: SwaggerAdapter = {
      ...mockAdapter(() => [
        failing401,
        {
          endpointId: LOGIN,
          method: 'post',
          endpoint: '/auth/login',
          status: 200,
          responseBody: '{}',
        },
      ]),
      listEndpoints: () => [
        { endpointId: LOGIN, method: 'post', path: '/auth/login' },
        { endpointId: FAILING, method: 'get', path: '/projects' },
      ],
      readOpenRequests: () => [{ endpointId: FAILING, method: 'get', body: '{}' }],
      replay: () => ok(undefined),
    }
    const replayCalls: string[] = []
    const trackedAdapter = {
      ...adapter,
      replay: (id: string, _body?: string) => {
        replayCalls.push(id)
        return ok(undefined)
      },
    }

    const service = new TokenRefreshService({
      adapter: trackedAdapter,
      auth: {
        current: async () => ok({ token: 'OLD', expiresAt: NOW - 1000 }),
        applyToken: async (_e, t) => ok({ token: t }),
      },
      templates: {
        listTemplates: async () =>
          ok([{ templateId: 't1', name: 'login', endpointId: LOGIN, environmentId: 'default' }]),
        applyTemplate: async () => ok(undefined),
      },
      now: () => NOW,
      cooldownMs: 0,
      setTimeoutFn: (fn) => {
        fn()
        return 0
      },
    })

    await service.noticeResponses('default')

    // The failing endpoint must NOT be retried (the login token was absent).
    expect(replayCalls.filter((id) => id === FAILING)).toHaveLength(0)
  })

  it('publishes REQUEST_RETRIED after a successful retry', async () => {
    const loginDoneRef = { value: false }
    const bus = new EventBus()
    const retried: unknown[] = []
    bus.subscribe('REQUEST_RETRIED', (p) => retried.push(p))

    const { adapter } = replayTracker(loginDoneRef)

    const service = new TokenRefreshService({
      adapter,
      auth: {
        current: async () => ok({ token: 'OLD', expiresAt: NOW - 1000 }),
        applyToken: async (_e, t) => ok({ token: t }),
      },
      templates: {
        listTemplates: async () =>
          ok([{ templateId: 't1', name: 'login', endpointId: LOGIN, environmentId: 'default' }]),
        applyTemplate: async () => {
          loginDoneRef.value = true
          return ok(undefined)
        },
      },
      bus,
      now: () => NOW,
      cooldownMs: 0,
      setTimeoutFn: (fn) => {
        fn()
        return 0
      },
    })

    await service.noticeResponses('default')

    expect(retried).toHaveLength(1)
    expect(retried[0]).toMatchObject({ endpointId: FAILING, triggeredBy: 'token-refresh' })
  })
})

describe('TokenRefreshService — findLoginEndpoint and credentials-based refresh', () => {
  it('prioritizes user-configured login endpoint override', () => {
    const service = new TokenRefreshService({
      adapter: {
        listEndpoints: () => [
          { endpointId: 'post /auth/login', method: 'post', path: '/auth/login' },
          { endpointId: 'post /custom/auth', method: 'post', path: '/custom/auth' },
        ],
        readOpenRequests: () => [],
        readExecutedResponses: () => [],
        replay: () => ok(undefined),
      } as unknown as SwaggerAdapter,
      auth: { current: async () => ok(null), applyToken: async () => ok({ token: '' }) },
      templates: { listTemplates: async () => ok([]), applyTemplate: async () => ok(undefined) },
      configuredLoginEndpoint: () => 'post /custom/auth',
    })

    expect(service.findLoginEndpoint()).toBe('post /custom/auth')
  })

  it('detects Tier A and Tier B login and oauth endpoints', () => {
    const oauthService = new TokenRefreshService({
      adapter: {
        listEndpoints: () => [
          { endpointId: 'post /oauth/token', method: 'post', path: '/oauth/token' },
          { endpointId: 'get /users', method: 'get', path: '/users' },
        ],
        readOpenRequests: () => [],
        readExecutedResponses: () => [],
        replay: () => ok(undefined),
      } as unknown as SwaggerAdapter,
      auth: { current: async () => ok(null), applyToken: async () => ok({ token: '' }) },
      templates: { listTemplates: async () => ok([]), applyTemplate: async () => ok(undefined) },
    })

    expect(oauthService.findLoginEndpoint()).toBe('post /oauth/token')

    const jwtService = new TokenRefreshService({
      adapter: {
        listEndpoints: () => [
          { endpointId: 'post /api/auth/jwt/create', method: 'post', path: '/api/auth/jwt/create' },
        ],
        readOpenRequests: () => [],
        readExecutedResponses: () => [],
        replay: () => ok(undefined),
      } as unknown as SwaggerAdapter,
      auth: { current: async () => ok(null), applyToken: async () => ok({ token: '' }) },
      templates: { listTemplates: async () => ok([]), applyTemplate: async () => ok(undefined) },
    })

    expect(jwtService.findLoginEndpoint()).toBe('post /api/auth/jwt/create')
  })

  it('never picks dangerous endpoints (forgot-password, register, logout, reset)', () => {
    const service = new TokenRefreshService({
      adapter: {
        listEndpoints: () => [
          { endpointId: 'post /auth/forgot-password', method: 'post', path: '/auth/forgot-password' },
          { endpointId: 'post /auth/register', method: 'post', path: '/auth/register' },
          { endpointId: 'post /auth/logout', method: 'post', path: '/auth/logout' },
          { endpointId: 'post /auth/reset-password', method: 'post', path: '/auth/reset-password' },
        ],
        readOpenRequests: () => [],
        readExecutedResponses: () => [],
        replay: () => ok(undefined),
      } as unknown as SwaggerAdapter,
      auth: { current: async () => ok(null), applyToken: async () => ok({ token: '' }) },
      templates: { listTemplates: async () => ok([]), applyTemplate: async () => ok(undefined) },
    })

    expect(service.findLoginEndpoint()).toBeNull()
  })

  it('directly logs in with credentials on refreshNow when Swagger has no token but credentials exist', async () => {
    let playedEndpoint: string | null = null
    let executed = false
    const service = new TokenRefreshService({
      adapter: {
        listEndpoints: () => [
          { endpointId: 'post /auth/login', method: 'post', path: '/auth/login' },
        ],
        readOpenRequests: () => [],
        readExecutedResponses: () =>
          executed
            ? [
                {
                  endpointId: 'post /auth/login',
                  method: 'post',
                  endpoint: '/auth/login',
                  status: 200,
                  responseBody: JSON.stringify({ token: 'NEW_LOGGED_IN_TOKEN_123' }),
                },
              ]
            : [],
        replay: (id: string) => {
          playedEndpoint = id
          executed = true
          return ok(undefined)
        },
      } as unknown as SwaggerAdapter,
      auth: {
        current: async () => ok(null), // no token currently authorized in Swagger
        applyToken: async (_env, t) => ok({ token: t }),
      },
      templates: {
        listTemplates: async () => ok([]), // no saved request template
        applyTemplate: async () => ok(undefined),
      },
      vault: {
        activeLogin: async () => ({
          credentialId: 'c1',
          username: 'admin@acme.io',
          password: 'secretpassword',
        }),
        updateSavedToken: async () => ok(undefined),
      },
      setTimeoutFn: (fn) => {
        fn()
        return 0
      },
    })

    const refreshed = await service.refreshNow('default')
    expect(refreshed).toEqual({ ok: true, value: true })
    expect(playedEndpoint).toBe('post /auth/login')
  })
})


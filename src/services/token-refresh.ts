import { ok, err, type Result } from '@/types'
import type { EventBus } from '@/core/events'
import type { SwaggerAdapter } from '@/adapters'

/**
 * Auto token refresh: when the stored credential is EXPIRED and the user has a
 * saved login request template, run that login request and capture the fresh
 * token from its response — so an expired token heals itself without the
 * developer re-authenticating by hand.
 *
 * Lives in the shared services layer and depends only on NARROW structural
 * interfaces of the auth/request services (modules stay decoupled). Triggered
 * from the content script on AUTH_EXPIRED / after restore. Never runs
 * concurrently with itself, and does nothing unless BOTH conditions hold
 * (expired credential + a recognizable login template).
 */

/** What we need from AuthenticationService. */
export interface RefreshAuthApi {
  current(environmentId: string): Promise<Result<AuthRecordLike | null>>
  applyToken(
    environmentId: string,
    token: string,
    schemeName?: string,
  ): Promise<Result<{ token: string }>>
}

/** Login attached to a saved credential, plus which credential it belongs to. */
export interface SavedLoginLike {
  credentialId: string
  username: string
  password: string
}

/** What we need from the credential vault. */
export interface RefreshVaultApi {
  /** Login for the credential currently in use, or null. */
  activeLogin(environmentId: string): Promise<SavedLoginLike | null>
  /** Store a freshly issued token on that one credential. */
  updateSavedToken(credentialId: string, token: string): Promise<Result<unknown>>
}

/** What we need from RequestService. */
export interface RefreshTemplateApi {
  listTemplates(): Promise<Result<TemplateLike[]>>
  applyTemplate(templateId: string): Promise<Result<void>>
}

export interface AuthRecordLike {
  token: string
  schemeName?: string
  expiresAt?: number
}

export interface TemplateLike {
  templateId: string
  name: string
  endpointId: string
  environmentId: string
}

/**
 * Parse a response body that may carry decoration from Swagger's own UI (its
 * Download / Copy controls render inside the body wrapper on some versions). We
 * strip that at the DOM boundary, but retry from the first brace here so one
 * stray label can't cost the user a token.
 */
function parseJsonLoose(body: string): unknown {
  try {
    return JSON.parse(body)
  } catch {
    const start = body.search(/[[{]/)
    if (start <= 0) throw new Error('not JSON')
    return JSON.parse(body.slice(start))
  }
}

/** One step of a refresh attempt, shown in the Auth panel so the flow is visible. */
export interface RefreshLogEntry {
  at: number
  outcome: 'triggered' | 'skipped' | 'success' | 'failed'
  message: string
}

const MAX_LOG = 12

export interface TokenRefreshOptions {
  adapter: SwaggerAdapter
  auth: RefreshAuthApi
  templates: RefreshTemplateApi
  /** Optional credential vault — its stored login is preferred over a template. */
  vault?: RefreshVaultApi
  bus?: EventBus
  now?: () => number
  /** Feature gate — refresh only runs when this returns true (default: always). */
  enabled?: () => boolean
  /** Optional manually configured login endpoint (from user selection or settings). */
  configuredLoginEndpoint?: () => string | null
  /** Whether to replay the failing request after a successful refresh (default: true). */
  retryRequest?: () => boolean
  /** Minimum gap between refresh attempts, to break login-failure loops (ms). */
  cooldownMs?: number
  /** Poll interval while waiting for the login response (ms). */
  pollMs?: number
  /** Give up waiting for the login response after this long (ms). */
  timeoutMs?: number
  /** Injectable for tests. */
  setTimeoutFn?: (fn: () => void, ms: number) => unknown
}

/** Template names/endpoints that identify a login request. */
const LOGIN_RE = /log[-_ ]?in|sign[-_ ]?in|authenticate|auth\b|token/i

/**
 * Endpoints that must NEVER be called with saved credentials, even though their
 * paths look auth-related. Guessing here has real consequences: a loose match on
 * `auth` once fired `POST /auth/forgot-password`, which emails the user.
 */
const DANGEROUS_PATH_RE =
  /(?:forgot[-_ ]?password|reset[-_ ]?password|change[-_ ]?password|update[-_ ]?password|register|sign[-_ ]?up|signup|log[-_ ]?out|sign[-_ ]?out|logout|refresh|verify|confirm|activate|resend|invite|otp|2fa|mfa)/i

/** Response fields commonly carrying the fresh token, most-specific first. */
const TOKEN_KEYS = [
  'access_token',
  'accessToken',
  'id_token',
  'idToken',
  'auth_token',
  'authToken',
  'jwt',
  'token',
  'bearer',
]

/** Depth-first search a parsed JSON response for a token-looking string. */
export function extractToken(value: unknown, depth = 0): string | null {
  if (depth > 6 || value == null) return null
  if (typeof value !== 'object') return null
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractToken(item, depth + 1)
      if (found) return found
    }
    return null
  }
  const record = value as Record<string, unknown>
  for (const key of TOKEN_KEYS) {
    const candidate = record[key]
    if (typeof candidate === 'string' && candidate.length > 8) return candidate
  }
  for (const nested of Object.values(record)) {
    const found = extractToken(nested, depth + 1)
    if (found) return found
  }
  return null
}

export class TokenRefreshService {
  private readonly adapter: SwaggerAdapter
  private readonly auth: RefreshAuthApi
  private readonly templates: RefreshTemplateApi
  private readonly vault: RefreshVaultApi | undefined
  private readonly bus: EventBus | undefined
  private readonly now: () => number
  private readonly pollMs: number
  private readonly timeoutMs: number
  private readonly schedule: (fn: () => void, ms: number) => unknown
  private readonly enabled: () => boolean
  private readonly retryRequest: () => boolean
  private readonly cooldownMs: number
  private readonly configuredLoginEndpoint?: () => string | null
  private running = false
  private lastAttempt = 0
  /** Warn once per missing-template streak, not on every DOM mutation. */
  private warnedNoTemplate = false
  /** Signatures of already-handled auth-failure responses (dedup across mutations). */
  private readonly seenFailures = new Set<string>()
  private readonly log: RefreshLogEntry[] = []

  constructor(options: TokenRefreshOptions) {
    this.adapter = options.adapter
    this.auth = options.auth
    this.templates = options.templates
    this.vault = options.vault
    this.bus = options.bus
    this.now = options.now ?? (() => Date.now())
    this.enabled = options.enabled ?? (() => true)
    this.configuredLoginEndpoint = options.configuredLoginEndpoint
    this.retryRequest = options.retryRequest ?? (() => true)
    this.cooldownMs = options.cooldownMs ?? 15_000
    this.pollMs = options.pollMs ?? 400
    this.timeoutMs = options.timeoutMs ?? 12_000
    this.schedule = options.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms))
  }

  /** The saved login template for this environment (same-env first, else any). */
  /**
   * Sign in with the given credentials and return the freshly issued token,
   * without touching what's currently authorized. Used both by auto-refresh and
   * by "add an account", which needs the token to store against a new name.
   */
  async signIn(login: { username: string; password: string }): Promise<Result<string>> {
    const endpointId = this.findLoginEndpoint()
    if (!endpointId) {
      this.note('failed', 'No sign-in endpoint found in this API')
      return err({
        code: 'AUTH_NO_LOGIN_ENDPOINT',
        message: 'No sign-in endpoint could be identified in this API.',
        recoverable: true,
      })
    }

    const before = new Map(
      this.adapter
        .readExecutedResponses()
        .map((r) => [r.endpointId, `${r.status}:${r.responseBody ?? ''}`]),
    )
    this.note('triggered', `Signing in as ${login.username} via ${endpointId}`)

    const replayed = this.adapter.replay(
      endpointId,
      this.buildLoginBody(endpointId, { ...login, credentialId: '' }),
    )
    if (!replayed.ok) {
      this.note('failed', `Could not run ${endpointId}: ${replayed.error.message}`)
      return replayed
    }

    const token = await this.awaitLoginToken(endpointId, before)
    if (!token) {
      this.note('failed', 'Sign-in ran but no token was found in the response')
      return err({
        code: 'AUTH_NO_TOKEN_IN_RESPONSE',
        message: 'Signed in, but no token was found in the response.',
        recoverable: true,
      })
    }
    this.note('success', `Signed in as ${login.username} (${token.slice(-6)})`)
    return ok(token)
  }

  /** Most recent activity first — what fired, what was skipped, and why. */
  recentActivity(): RefreshLogEntry[] {
    return [...this.log].reverse()
  }

  private note(outcome: RefreshLogEntry['outcome'], message: string): void {
    this.log.push({ at: this.now(), outcome, message })
    if (this.log.length > MAX_LOG) this.log.shift()
  }

  /**
   * Run the refresh now, ignoring the cooldown — the "test it" path, so the user
   * can watch the flow instead of waiting for a token to expire.
   */
  async refreshNow(environmentId: string): Promise<Result<boolean>> {
    this.lastAttempt = 0
    this.seenFailures.clear()
    this.note('triggered', 'Manual refresh requested')
    // `manual` so it runs even with the toggle off and ignores the cooldown —
    // this button exists precisely to test the flow on demand.
    return this.maybeRefresh(environmentId, true, true)
  }

  async findLoginTemplate(environmentId: string): Promise<TemplateLike | null> {
    const listed = await this.templates.listTemplates()
    if (!listed.ok) return null
    const logins = listed.value.filter(
      (t) =>
        (LOGIN_RE.test(t.name) || LOGIN_RE.test(t.endpointId)) &&
        // Never re-run a saved forgot-password / register / logout request.
        !DANGEROUS_PATH_RE.test(t.name) &&
        !DANGEROUS_PATH_RE.test(t.endpointId),
    )
    return logins.find((t) => t.environmentId === environmentId) ?? logins[0] ?? null
  }

  /**
   * On-load / env-switch trigger: refresh only when the stored JWT is expired.
   * (Opaque tokens have no expiry to read — those are caught by the 401 path.)
   */
  refreshIfExpired(environmentId: string): Promise<Result<boolean>> {
    return this.maybeRefresh(environmentId, false)
  }

  /**
   * Response-watch trigger: call whenever executed responses change. A NEW
   * 401/403 is the real-world "token died" signal (works for JWT AND opaque
   * tokens), so it force-refreshes regardless of any `exp`. Deduped per response
   * and rate-limited by the cooldown so a failing login can't loop.
   */
  noticeResponses(environmentId: string): Promise<Result<boolean>> | undefined {
    if (!this.enabled()) return undefined
    for (const res of this.adapter.readExecutedResponses()) {
      if (res.status !== 401 && res.status !== 403) continue
      const sig = `${res.endpointId}:${res.status}:${res.responseBody ?? ''}`
      if (this.seenFailures.has(sig)) continue
      if (this.seenFailures.size > 50) this.seenFailures.clear()
      this.seenFailures.add(sig)
      return this.maybeRefresh(environmentId, true).then((refreshed) => {
        if (refreshed.ok && refreshed.value && this.retryRequest()) {
          const req = this.adapter.readOpenRequests().find((r) => r.endpointId === res.endpointId)
          this.adapter.replay(res.endpointId, req?.body)
          this.bus?.publish('REQUEST_RETRIED', {
            endpointId: res.endpointId,
            triggeredBy: 'token-refresh',
          })
        }
        return refreshed
      })
    }
    return undefined
  }

  /**
   * Run the saved login request, read the fresh token from its response, and
   * apply + persist it. `force` skips the `exp` check (used by the 401 path,
   * where the server already told us the token is dead). Resolves true when a
   * fresh token was stored. Guarded by: enabled, not-running, cooldown, a stored
   * credential, and a recognizable login template.
   */
  /**
   * Sign this account back in using only the saved email + password.
   *
   * Runs through Swagger itself (fill the login operation, press Execute) rather
   * than composing a URL: Swagger already knows the server and base path, so the
   * user never has to supply them. The body reuses whatever shape that endpoint
   * was last called with, so extra fields the API needs survive — only the
   * username / password values are swapped in.
   */
  private async loginWithCredentials(
    environmentId: string,
    login: SavedLoginLike,
    schemeName?: string,
  ): Promise<Result<boolean>> {
    const endpointId = this.findLoginEndpoint()
    if (!endpointId) {
      this.note('failed', 'No sign-in endpoint found in this API')
      this.bus?.publish('NOTIFY', {
        kind: 'warning',
        message: 'Token expired, but no login endpoint was found in this API to sign in with.',
      })
      return ok(false)
    }

    const before = new Map(
      this.adapter
        .readExecutedResponses()
        .map((r) => [r.endpointId, `${r.status}:${r.responseBody ?? ''}`]),
    )

    this.note('triggered', `Signing in as ${login.username} via ${endpointId}`)
    const replayed = this.adapter.replay(endpointId, this.buildLoginBody(endpointId, login))
    if (!replayed.ok) {
      this.note('failed', `Could not run ${endpointId}: ${replayed.error.message}`)
      return replayed
    }

    const token = await this.awaitLoginToken(endpointId, before)
    if (!token) {
      this.note('failed', 'Sign-in ran but no token was found in the response')
      this.bus?.publish('NOTIFY', {
        kind: 'warning',
        message: 'Signed in with the saved credentials but found no token in the response.',
      })
      return ok(false)
    }

    const applied = await this.auth.applyToken(environmentId, token, schemeName)
    if (!applied.ok) return applied
    // Persist the value actually applied to Swagger (with any `Bearer ` prefix),
    // so re-selecting this account later authorizes with the working format.
    // Only THIS credential is rewritten — the other saved tokens are untouched.
    await this.vault?.updateSavedToken(login.credentialId, applied.value.token)
    this.note('success', `New token stored and applied (${token.slice(-6)})`)
    this.bus?.publish('NOTIFY', {
      kind: 'success',
      message: 'Token expired — signed in again with this account’s saved credentials.',
    })
    return ok(true)
  }

  /**
   * The API's own sign-in operation, from user configuration, templates, or Swagger spec.
   */
  findLoginEndpoint(): string | null {
    // 1. User-configured login endpoint takes highest precedence
    const configured = this.configuredLoginEndpoint?.()
    if (configured) {
      const exists = this.adapter.listEndpoints().some((e) => e.endpointId === configured)
      if (exists) return configured
    }

    const endpoints = this.adapter.listEndpoints()

    // 2. Dangerous endpoints that must NEVER be called automatically with user credentials
    const safePosts = endpoints.filter(
      (e) => e.method.toLowerCase() === 'post' && !DANGEROUS_PATH_RE.test(e.path),
    )

    // Tier A: Unmistakable sign-in paths where the last segment is login / signin / token / authenticate / auth / session
    const tierA = safePosts.find((e) =>
      /(?:^|\/)(?:log[-_ ]?in|sign[-_ ]?in|signin|login|token|authenticate|auth|session|sessions)\/?$/i.test(
        e.path,
      ),
    )
    if (tierA) return tierA.endpointId

    // Tier B: OAuth token, connect token, or JWT creation endpoints (/oauth/token, /oauth2/token, /connect/token, /api/token, /auth/jwt/create, /access-token)
    const tierB = safePosts.find((e) =>
      /(?:oauth2?\/token|connect\/token|jwt\/create|token\/login|auth\/token|access[-_ ]?token)/i.test(
        e.path,
      ),
    )
    if (tierB) return tierB.endpointId

    // Tier C: Path has login / signin / authenticate anywhere
    const tierC = safePosts.find((e) => /log[-_ ]?in|sign[-_ ]?in|authenticate/i.test(e.path))
    if (tierC) return tierC.endpointId

    // Tier D: Summary/description says log in, sign in, authenticate, or obtain token
    const tierD = safePosts.find((e) =>
      /(?:log[-_ ]?in|sign[-_ ]?in|authenticate|obtain (?:access )?token|user login)/i.test(
        e.summary ?? '',
      ),
    )
    if (tierD) return tierD.endpointId

    // Tier E: Tag is Auth / Authentication / Login / Session and path mentions auth or token
    const tierE = safePosts.find(
      (e) =>
        /(?:auth|login|session)/i.test(e.tag ?? '') &&
        /(?:auth|token|login|session)/i.test(e.path),
    )
    if (tierE) return tierE.endpointId

    return null
  }

  /**
   * Login body carrying the saved credentials. Starts from previous calls, Swagger DOM defaults,
   * or a smart fallback, replacing username and password fields.
   */
  private buildLoginBody(endpointId: string, login: SavedLoginLike): string {
    const previous = this.adapter.readOpenRequests().find((r) => r.endpointId === endpointId)?.body
    let templateBody: string | undefined = previous

    if (!templateBody && this.adapter.getEndpointSwaggerDefaults) {
      templateBody = this.adapter.getEndpointSwaggerDefaults(endpointId)?.exampleBody
    }

    if (templateBody) {
      try {
        const parsed = JSON.parse(templateBody) as Record<string, unknown>
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const body = { ...parsed }
          for (const key of Object.keys(body)) {
            if (/pass/i.test(key)) body[key] = login.password
            else if (/mail|user|login|phone|account|identifier/i.test(key)) body[key] = login.username
          }
          return JSON.stringify(body)
        }
      } catch {
        /* not JSON — fall through to default */
      }
    }
    return JSON.stringify({ email: login.username, password: login.password })
  }

  private async maybeRefresh(
    environmentId: string,
    force: boolean,
    manual = false,
  ): Promise<Result<boolean>> {
    if (!manual && !this.enabled()) {
      this.note('skipped', 'Auto-refresh is turned off')
      return ok(false)
    }
    if (this.running) return ok(false)
    if (!manual && this.now() - this.lastAttempt < this.cooldownMs) {
      this.note('skipped', 'Just tried — waiting for the cooldown before retrying')
      return ok(false)
    }

    const got = await this.auth.current(environmentId)
    if (!got.ok || !got.value) {
      // If manual refresh or token expired and an account with credentials exists, sign in directly
      const stored = await this.vault?.activeLogin(environmentId)
      if (stored) {
        this.running = true
        this.lastAttempt = this.now()
        try {
          return await this.loginWithCredentials(environmentId, stored)
        } finally {
          this.running = false
        }
      }
      this.note('skipped', 'Nothing is authorized, so there is no token to refresh')
      return ok(false)
    }
    const record = got.value
    if (!force && (record.expiresAt == null || record.expiresAt > this.now())) return ok(false)

    // Per-account first: the credential in use may carry its own login, which is
    // the only way to refresh the RIGHT account when several tokens are saved.
    const stored = await this.vault?.activeLogin(environmentId)
    if (stored) {
      this.running = true
      this.lastAttempt = this.now()
      try {
        return await this.loginWithCredentials(environmentId, stored, record.schemeName)
      } finally {
        this.running = false
      }
    }

    const login = await this.findLoginTemplate(environmentId)
    if (!login) {
      // The feature can't work without a login request to re-run. Saying nothing
      // here made an enabled toggle look broken — especially now that "Saved
      // tokens" exists, which is a different thing entirely.
      this.note(
        'skipped',
        'No credentials saved for the token in use, and no saved login request to run',
      )
      if (!this.warnedNoTemplate) {
        this.warnedNoTemplate = true
        this.bus?.publish('NOTIFY', {
          kind: 'warning',
          message:
            'Token expired, but no saved login request was found. Open the login endpoint in Swagger, then save it from the Requests tab.',
        })
      }
      return ok(false)
    }
    this.warnedNoTemplate = false

    this.running = true
    this.lastAttempt = this.now()
    try {
      // Signatures of already-rendered responses, so we only accept a NEW one.
      const before = new Map(
        this.adapter
          .readExecutedResponses()
          .map((r) => [r.endpointId, `${r.status}:${r.responseBody ?? ''}`]),
      )

      const applied = await this.templates.applyTemplate(login.templateId)
      if (!applied.ok) return applied

      const token = await this.awaitLoginToken(login.endpointId, before)
      if (!token) {
        this.bus?.publish('NOTIFY', {
          kind: 'warning',
          message:
            'Token expired — ran the saved login request but found no token in its response.',
        })
        return ok(false)
      }

      const stored = await this.auth.applyToken(environmentId, token, record.schemeName)
      if (!stored.ok) return stored
      this.bus?.publish('NOTIFY', {
        kind: 'success',
        message: 'Token expired — refreshed automatically via your saved login request.',
      })
      return ok(true)
    } finally {
      this.running = false
    }
  }

  /** Poll the rendered responses until the login endpoint shows a NEW 2xx one. */
  private awaitLoginToken(endpointId: string, before: Map<string, string>): Promise<string | null> {
    return new Promise((resolve) => {
      let waited = 0
      const tick = (): void => {
        for (const res of this.adapter.readExecutedResponses()) {
          if (res.endpointId !== endpointId) continue
          const signature = `${res.status}:${res.responseBody ?? ''}`
          if (before.get(endpointId) === signature) continue // stale render
          if (res.status < 200 || res.status >= 300 || !res.responseBody) continue
          try {
            const token = extractToken(parseJsonLoose(res.responseBody))
            if (token) {
              resolve(token)
              return
            }
          } catch {
            // Non-JSON response — keep waiting.
          }
        }
        waited += this.pollMs
        if (waited > this.timeoutMs) resolve(null)
        else this.schedule(tick, this.pollMs)
      }
      tick()
    })
  }
}

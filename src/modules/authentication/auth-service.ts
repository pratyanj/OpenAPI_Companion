import { ok, err, type Result, type AppError, type Unsubscribe } from '@/types'
import { projectKey, settingsKey, type StorageService } from '@/core/storage'
import { stableId } from '@/utils'
import type { EventBus } from '@/core/events'
import type { SwaggerAdapter, AuthSnapshot } from '@/adapters'
import { decodeJwtExpiryMs, isJwt } from '@/utils'
import {
  SUPPORTED_AUTH_TYPES,
  type AuthRecord,
  type AuthType,
  type SavedCredential,
  type SavedLogin,
} from './types'

export interface AuthenticationServiceOptions {
  storage: StorageService
  adapter: SwaggerAdapter
  projectId: string
  bus?: EventBus
  now?: () => number
}

const authWriteError = (cause?: unknown): AppError => ({
  code: 'AUTH_WRITE',
  message: 'Failed to persist authentication',
  recoverable: true,
  cause,
})

/** The `Bearer ` prefix on a token value, preserving its exact spacing/case, or ''. */
function bearerPrefixOf(token: string): string {
  return token.match(/^bearer\s+/i)?.[0] ?? ''
}

/** Token with any leading `Bearer ` removed — the raw credential. */
function stripBearer(token: string): string {
  return token.replace(/^bearer\s+/i, '')
}

/** Apply `prefix` to `token` without doubling it (token may already carry one). */
function withBearerPrefix(token: string, prefix: string): string {
  return `${prefix}${stripBearer(token)}`
}

/** Global (cross-project) feature flag for auto token refresh. */
const AUTO_REFRESH_KEY = settingsKey('auto-refresh-token')

/**
 * Persists authorization entered in Swagger and auto-restores it per project +
 * environment (FR-004, FDD-001). The highest-impact feature (DD-015).
 *
 * - Reads/writes Swagger only through the injected `SwaggerAdapter` (never the
 *   DOM directly). Tokens are never logged (security §1.9).
 * - Restoring never re-authorizes with an expired/invalid credential; an expired
 *   record is kept (not deleted) so the user can see & replace it (EC-008).
 */
export class AuthenticationService {
  private readonly storage: StorageService
  private readonly adapter: SwaggerAdapter
  private readonly projectId: string
  private readonly bus: EventBus | undefined
  private readonly now: () => number
  private readonly autoRefreshIntervalMs = 60_000 // Check every minute
  private autoRefreshTimer: ReturnType<typeof setTimeout> | null = null
  private readonly refreshAheadMs = 5 * 60 * 1000 // Refresh 5 minutes before expiry

  constructor(options: AuthenticationServiceOptions) {
    this.storage = options.storage
    this.adapter = options.adapter
    this.projectId = options.projectId
    this.bus = options.bus
    this.now = options.now ?? (() => Date.now())

    // Start auto-refresh scheduler if enabled
    void this.startAutoRefreshScheduler()

    // Listen for settings changes to restart/stop scheduler
    if (this.bus) {
      this.bus.subscribe('SETTINGS_UPDATED', this.handleSettingsUpdated.bind(this))
    }
  }

  private key(environmentId: string): string {
    return projectKey(this.projectId, 'authentication', environmentId)
  }

  /** Named credentials live per PROJECT, independent of the active environment. */
  private vaultKey(id: string): string {
    return projectKey(this.projectId, 'auth-vault', id)
  }

  private vaultPrefix(): string {
    return projectKey(this.projectId, 'auth-vault', '')
  }

  /**
   * Which saved credential is in use, per environment.
   *
   * Recorded explicitly rather than inferred by comparing tokens: Swagger can
   * hand a token back in a slightly different form (scheme prefixes, apiKey
   * values), and the auth watcher rewrites the active record from the page — so
   * token equality silently stopped matching, and refresh fell back to "no
   * credentials found".
   */
  private activeCredentialKey(environmentId: string): string {
    return projectKey(this.projectId, 'auth-active-credential', environmentId)
  }

  /** Global opt-in for auto token refresh (default off). */
  async isAutoRefreshEnabled(): Promise<boolean> {
    const got = await this.storage.getData<boolean>(AUTO_REFRESH_KEY)
    return got.ok && got.value === true
  }

  async setAutoRefreshEnabled(enabled: boolean): Promise<Result<void>> {
    const written = await this.storage.set(AUTO_REFRESH_KEY, enabled, { immediate: true })
    if (!written.ok) return written
    this.bus?.publish('SETTINGS_UPDATED', { keys: ['auto-refresh-token'] })
    return ok(undefined)
  }

  async current(environmentId: string): Promise<Result<AuthRecord | null>> {
    const got = await this.storage.getData<AuthRecord>(this.key(environmentId))
    if (!got.ok) return got.error.code === 'STORAGE_CORRUPT' ? ok(null) : got
    return ok(got.value)
  }

  async save(auth: AuthRecord): Promise<Result<void>> {
    const written = await this.storage.set(this.key(auth.environmentId), auth, { immediate: true })
    if (!written.ok) return err(authWriteError(written.error.cause))
    this.bus?.publish('AUTH_UPDATED', {
      projectId: this.projectId,
      environmentId: auth.environmentId,
      type: auth.type,
    })
    return ok(undefined)
  }

  /** Read whatever is currently authorized in Swagger and persist it. */
  async captureFromSwagger(environmentId: string): Promise<Result<AuthRecord | null>> {
    const snapshot = this.adapter.readAuth()
    if (!snapshot?.token) return ok(null)
    const type = this.refineType(snapshot)
    const record: AuthRecord = {
      type,
      token: snapshot.token,
      schemeName: snapshot.schemeName,
      environmentId,
      updatedAt: this.now(),
      expiresAt: this.expiryOf(snapshot.token) ?? undefined,
    }
    const saved = await this.save(record)
    return saved.ok ? ok(record) : saved
  }

  /**
   * Write a fresh token into Swagger AND persist it (the token-refresh path).
   * Reuses the scheme of the previous credential when provided.
   */
  async applyToken(
    environmentId: string,
    token: string,
    schemeName?: string,
  ): Promise<Result<AuthRecord>> {
    // Keep the CREDENTIAL KIND of what's already stored. Forcing 'bearer' broke
    // apiKey schemes: the MAIN-world bridge routes apiKey through
    // `preauthorizeApiKey` and everything else through `authActions.authorize`,
    // so a refreshed apiKey token written as a bearer never lands in Swagger.
    const existing = await this.current(environmentId)
    const previous = existing.ok ? existing.value : null
    const kind: AuthSnapshot['type'] =
      previous?.type === 'jwt' ? 'bearer' : (previous?.type ?? 'bearer')
    const scheme = schemeName ?? previous?.schemeName

    // Format per the project's Bearer preference (defaults to inference), so
    // apiKey schemes that expect "Authorization: Bearer <jwt>" keep working while
    // the user can also force a raw token.
    const applied = withBearerPrefix(token, await this.bearerPrefix(environmentId))

    const snapshot: AuthSnapshot = { type: kind, token: applied, schemeName: scheme }
    const record: AuthRecord = {
      type: this.refineType(snapshot),
      token: applied,
      schemeName: scheme,
      environmentId,
      updatedAt: this.now(),
      expiresAt: this.expiryOf(applied) ?? undefined,
    }
    const injected = this.adapter.writeAuth(this.toSnapshot(record))
    if (!injected.ok) return injected
    const saved = await this.save(record)
    return saved.ok ? ok(record) : saved
  }

  validate(auth: AuthRecord): boolean {
    if (!SUPPORTED_AUTH_TYPES.includes(auth.type)) return false
    if (!auth.token) return false
    if (auth.expiresAt != null && auth.expiresAt <= this.now()) return false
    return true
  }

  /** Inject the stored credential back into Swagger on page load (< 100 ms). */
  async restore(environmentId: string): Promise<Result<AuthRecord | null>> {
    const got = await this.current(environmentId)
    if (!got.ok) return got
    const record = got.value
    if (!record) return ok(null)

    if (!this.validate(record)) {
      if (record.expiresAt != null && record.expiresAt <= this.now()) {
        this.bus?.publish('AUTH_EXPIRED', { projectId: this.projectId, environmentId })
      }
      return ok(null) // keep the stored record (EC-008), just don't restore it
    }

    const injected = this.adapter.writeAuth(this.toSnapshot(record))
    if (!injected.ok) return injected

    await this.storage.set(
      this.key(environmentId),
      { ...record, lastUsed: this.now() },
      {
        immediate: true,
      },
    )
    this.bus?.publish('AUTH_RESTORED', { projectId: this.projectId, environmentId })
    return ok(record)
  }

  /**
   * Poll Swagger and persist authorization when it changes (the auto-save path).
   * Swagger stores auth in its Redux store with no public change event across
   * versions, so a light poll is the robust MVP trigger. Returns an unsubscribe.
   */
  watch(environmentId: string, intervalMs = 1500): Unsubscribe {
    let lastToken: string | null = null
    let ready = false

    void this.current(environmentId).then((current) => {
      lastToken = current.ok && current.value ? current.value.token : null
      ready = true
    })

    const tick = async (): Promise<void> => {
      if (!ready) return
      const token = this.adapter.readAuth()?.token ?? null
      if (token && token !== lastToken) {
        lastToken = token
        await this.captureFromSwagger(environmentId)
      }
    }

    const timer = setInterval(() => void tick(), intervalMs)
    return () => clearInterval(timer)
  }

  async clear(environmentId: string): Promise<Result<void>> {
    const removed = await this.storage.remove(this.key(environmentId))
    if (!removed.ok) return removed
    this.adapter.clearAuth() // best-effort de-authorize in Swagger
    this.bus?.publish('AUTH_CLEARED', { projectId: this.projectId, environmentId })
    return ok(undefined)
  }

  private toSnapshot(record: AuthRecord): AuthSnapshot {
    const type = record.type === 'jwt' ? 'bearer' : record.type
    return { type, token: record.token, schemeName: record.schemeName }
  }

  private refineType(snapshot: AuthSnapshot): AuthType {
    if (snapshot.type === 'bearer' && isJwt(stripBearer(snapshot.token))) return 'jwt'
    return snapshot.type
  }

  private expiryOf(token: string): number | null {
    // apiKey schemes store "Bearer <jwt>"; decode the JWT itself, not the prefix.
    const raw = stripBearer(token)
    return isJwt(raw) ? decodeJwtExpiryMs(raw) : null
  }

  /** Per-project preference: prepend `Bearer ` to applied tokens, or send raw. */
  private bearerPrefixKey(): string {
    return projectKey(this.projectId, 'settings', 'bearer-prefix')
  }

  /**
   * Whether applied tokens should carry the `Bearer ` prefix.
   *
   * Some schemes (typically apiKey on the `Authorization` header) need
   * `Authorization: Bearer <jwt>`; others want the raw token. The user can force
   * either from the Auth panel; until they do, it's inferred from whatever token
   * is currently authorized / saved, so existing setups keep working.
   */
  async isBearerPrefixEnabled(environmentId: string): Promise<boolean> {
    const stored = await this.storage.getData<boolean>(this.bearerPrefixKey())
    if (stored.ok && typeof stored.value === 'boolean') return stored.value
    return (await this.inferBearerPrefix(environmentId)) !== ''
  }

  /**
   * Set the preference and re-apply the token in use in the chosen format, so
   * Swagger's Authorize updates immediately — not only on the next refresh.
   */
  async setBearerPrefixEnabled(environmentId: string, enabled: boolean): Promise<Result<void>> {
    const written = await this.storage.set(this.bearerPrefixKey(), enabled, { immediate: true })
    if (!written.ok) return written
    const current = await this.current(environmentId)
    if (current.ok && current.value?.token) {
      // applyToken reads the flag we just stored, so this re-formats the value.
      await this.applyToken(
        environmentId,
        stripBearer(current.value.token),
        current.value.schemeName,
      )
    }
    return ok(undefined)
  }

  /** The prefix to apply, per the stored preference (default: inferred). */
  private async bearerPrefix(environmentId: string): Promise<string> {
    return (await this.isBearerPrefixEnabled(environmentId)) ? 'Bearer ' : ''
  }

  /** Infer the prefix from what's currently authorized / saved (the default). */
  private async inferBearerPrefix(environmentId: string): Promise<string> {
    const current = await this.current(environmentId)
    if (current.ok && current.value?.token) return bearerPrefixOf(current.value.token)
    const saved = await this.listSaved()
    if (saved.ok) {
      const withPrefix = saved.value.find((c) => bearerPrefixOf(c.token) !== '')
      if (withPrefix) return bearerPrefixOf(withPrefix.token)
    }
    return ''
  }

  // --- Named credential vault ------------------------------------------------

  /** Saved credentials for this project, newest first. */
  async listSaved(): Promise<Result<SavedCredential[]>> {
    const keys = await this.storage.list(this.vaultPrefix())
    if (!keys.ok) return keys
    const saved: SavedCredential[] = []
    for (const key of keys.value) {
      const got = await this.storage.getData<SavedCredential>(key)
      if (got.ok && got.value) saved.push(got.value)
    }
    saved.sort((a, b) => b.createdAt - a.createdAt)
    return ok(saved)
  }

  /**
   * Save the credential currently authorized in Swagger under `name`. Falls back
   * to the environment's stored record when Swagger's own state isn't readable
   * (e.g. the page hasn't finished loading its spec).
   *
   * The id is derived from the name, so saving the same name twice updates that
   * entry instead of quietly creating a second one with identical labels.
   */
  async saveAs(name: string, environmentId: string): Promise<Result<SavedCredential>> {
    const label = name.trim()
    if (!label) return err(authWriteError(new Error('A name is required')))

    const snapshot = this.adapter.readAuth()
    let type: AuthType
    let token: string
    let schemeName: string | undefined

    if (snapshot?.token) {
      type = this.refineType(snapshot)
      token = snapshot.token
      schemeName = snapshot.schemeName
    } else {
      const active = await this.current(environmentId)
      if (!active.ok) return active
      if (!active.value?.token) {
        return err(authWriteError(new Error('Nothing is authorized yet')))
      }
      type = active.value.type
      token = active.value.token
      schemeName = active.value.schemeName
    }

    const credential: SavedCredential = {
      id: stableId('cred', this.projectId, label),
      name: label,
      type,
      token,
      schemeName,
      createdAt: this.now(),
      expiresAt: this.expiryOf(token) ?? undefined,
    }
    const written = await this.storage.set(this.vaultKey(credential.id), credential, {
      immediate: true,
    })
    if (!written.ok) return err(authWriteError(written.error.cause))
    // Saving the live token under a name also identifies the account in use.
    await this.storage.set(this.activeCredentialKey(environmentId), credential.id, {
      immediate: true,
    })
    return ok(credential)
  }

  /** Make a saved credential the active one: inject it into Swagger and persist. */
  async activateSaved(id: string, environmentId: string): Promise<Result<AuthRecord>> {
    const got = await this.storage.getData<SavedCredential>(this.vaultKey(id))
    if (!got.ok) return got
    if (!got.value) return err(authWriteError(new Error(`No saved credential ${id}`)))
    const credential = got.value

    // Normalize to the current Bearer preference when authorizing, so switching
    // accounts always applies the format the user chose.
    const applied = withBearerPrefix(credential.token, await this.bearerPrefix(environmentId))
    const record: AuthRecord = {
      type: credential.type,
      token: applied,
      schemeName: credential.schemeName,
      environmentId,
      updatedAt: this.now(),
      expiresAt: this.expiryOf(applied) ?? undefined,
    }
    const injected = this.adapter.writeAuth(this.toSnapshot(record))
    if (!injected.ok) return injected
    const saved = await this.save(record)
    return saved.ok ? ok(record) : saved
  }

  /**
   * Store a credential obtained by signing in, rather than by reading Swagger's
   * current state — the "add an account" path. Keeps the login attached so the
   * same account can be refreshed later.
   */
  async addCredential(
    name: string,
    token: string,
    environmentId: string,
    login?: SavedLogin,
  ): Promise<Result<SavedCredential>> {
    const label = name.trim()
    if (!label) return err(authWriteError(new Error('A name is required')))
    if (!token) return err(authWriteError(new Error('No token to save')))

    // Add-account never touches Swagger's auth UI, so shape the new credential
    // like the project's existing ones: same type + scheme, and the `Bearer `
    // prefix per the project preference (so "Authorization: Bearer <jwt>" works).
    const saved = await this.listSaved()
    const template = saved.ok ? saved.value[0] : undefined
    const applied = withBearerPrefix(token, await this.bearerPrefix(environmentId))
    const snapshot: AuthSnapshot = {
      type: template?.type ?? 'bearer',
      token: applied,
      schemeName: template?.schemeName,
    }
    const credential: SavedCredential = {
      id: stableId('cred', this.projectId, label),
      name: label,
      type: this.refineType(snapshot),
      token: applied,
      schemeName: template?.schemeName,
      createdAt: this.now(),
      expiresAt: this.expiryOf(applied) ?? undefined,
      ...(login ? { login } : {}),
    }
    const written = await this.storage.set(this.vaultKey(credential.id), credential, {
      immediate: true,
    })
    return written.ok ? ok(credential) : err(authWriteError(written.error.cause))
  }

  /** Attach (or clear) the login used to refresh a saved credential's account. */
  async setLogin(id: string, login: SavedLogin | null): Promise<Result<SavedCredential>> {
    const got = await this.storage.getData<SavedCredential>(this.vaultKey(id))
    if (!got.ok) return got
    if (!got.value) return err(authWriteError(new Error(`No saved credential ${id}`)))
    const updated: SavedCredential = { ...got.value }
    if (login) updated.login = login
    else delete updated.login
    const written = await this.storage.set(this.vaultKey(id), updated, { immediate: true })
    return written.ok ? ok(updated) : err(authWriteError(written.error.cause))
  }

  /**
   * Login details for the credential currently in use, matched by token — so an
   * expired token is refreshed with ITS OWN account, not whichever login happens
   * to be saved. Returns null when the active token isn't in the vault or has no
   * login attached.
   */
  async activeLogin(
    environmentId: string,
  ): Promise<(SavedLogin & { credentialId: string }) | null> {
    const saved = await this.listSaved()
    if (!saved.ok) return null

    const recorded = await this.storage.getData<string>(this.activeCredentialKey(environmentId))
    const byId =
      recorded.ok && recorded.value ? saved.value.find((c) => c.id === recorded.value) : undefined
    if (byId?.login) return { ...byId.login, credentialId: byId.id }

    // Fallback for credentials saved before the active id was tracked.
    const active = await this.current(environmentId)
    if (active.ok && active.value?.token) {
      const cleanActive = active.value.token.replace(/^bearer\s+/i, '').trim()
      const byToken = saved.value.find(
        (c) => c.token.replace(/^bearer\s+/i, '').trim() === cleanActive,
      )
      if (byToken?.login) return { ...byToken.login, credentialId: byToken.id }
    }

    // Fallback if exactly one saved account has credentials
    const withLogin = saved.value.filter((c) => c.login?.username && c.login?.password)
    if (withLogin.length === 1 && withLogin[0]?.login) {
      return { ...withLogin[0].login, credentialId: withLogin[0].id }
    }

    return null
  }

  private configuredLoginEndpointKey(): string {
    return projectKey(this.projectId, 'auth-login-endpoint')
  }

  async getConfiguredLoginEndpoint(): Promise<string | null> {
    const got = await this.storage.getData<string>(this.configuredLoginEndpointKey())
    return got.ok && got.value ? got.value : null
  }

  async setConfiguredLoginEndpoint(endpointId: string | null): Promise<Result<void>> {
    const key = this.configuredLoginEndpointKey()
    if (!endpointId) {
      const removed = await this.storage.remove(key)
      if (removed.ok) {
        this.bus?.publish('SETTINGS_UPDATED', { keys: ['auth-login-endpoint'] })
      }
      return removed
    }
    const written = await this.storage.set(key, endpointId, { immediate: true })
    if (written.ok) {
      this.bus?.publish('SETTINGS_UPDATED', { keys: ['auth-login-endpoint'] })
    }
    return written.ok ? ok(undefined) : written
  }

  /** Name of the credential in use, for display. */
  async activeCredentialName(environmentId: string): Promise<string | null> {
    const recorded = await this.storage.getData<string>(this.activeCredentialKey(environmentId))
    if (!recorded.ok || !recorded.value) return null
    const saved = await this.listSaved()
    if (!saved.ok) return null
    return saved.value.find((c) => c.id === recorded.value)?.name ?? null
  }

  /**
   * Write a freshly issued token onto ONE saved credential — the account that was
   * just signed in. Without this the vault would keep the dead token, so the next
   * expiry couldn't match it back to its login.
   */
  async updateSavedToken(id: string, token: string): Promise<Result<SavedCredential>> {
    const got = await this.storage.getData<SavedCredential>(this.vaultKey(id))
    if (!got.ok) return got
    if (!got.value) return err(authWriteError(new Error(`No saved credential ${id}`)))
    const updated: SavedCredential = {
      ...got.value,
      token,
      expiresAt: this.expiryOf(token) ?? undefined,
    }
    const written = await this.storage.set(this.vaultKey(id), updated, { immediate: true })
    return written.ok ? ok(updated) : err(authWriteError(written.error.cause))
  }

  async deleteSaved(id: string): Promise<Result<void>> {
    const removed = await this.storage.remove(this.vaultKey(id))
    return removed.ok ? ok(undefined) : removed
  }

  /** Start the auto-refresh scheduler that checks for expiring tokens */
  private async startAutoRefreshScheduler(): Promise<void> {
    // Don't start if auto-refresh is disabled
    if (!(await this.isAutoRefreshEnabled())) {
      return
    }

    // Clear any existing timer
    if (this.autoRefreshTimer) {
      clearTimeout(this.autoRefreshTimer)
      this.autoRefreshTimer = null
    }

    // Schedule the first check
    this.autoRefreshTimer = setTimeout(
      () => void this.checkAndRefreshExpiringTokens(),
      this.autoRefreshIntervalMs,
    )
  }

  /** Handle settings updates to restart/stop scheduler based on auto-refresh flag */
  private handleSettingsUpdated(data: { keys: string[] }): void {
    const autoRefreshKey = settingsKey('auto-refresh-token')
    if (data.keys.includes(autoRefreshKey)) {
      void this.startAutoRefreshScheduler() // This will check the flag and restart/stop accordingly
    }
  }

  /** Check for tokens that are about to expire and refresh them */
  private async checkAndRefreshExpiringTokens(): Promise<void> {
    try {
      // Reschedule the next check first (in case this takes a while)
      if (this.autoRefreshTimer) {
        clearTimeout(this.autoRefreshTimer)
      }
      this.autoRefreshTimer = setTimeout(
        () => void this.checkAndRefreshExpiringTokens(),
        this.autoRefreshIntervalMs,
      )

      // Don't proceed if auto-refresh got disabled during this check
      if (!(await this.isAutoRefreshEnabled())) {
        return
      }

      // Get all environments that have authentication data
      const envKeys = await this.storage.list(projectKey(this.projectId, 'authentication', ''))
      if (!envKeys.ok) {
        console.warn('Failed to list authentication keys for auto-refresh:', envKeys.error)
        return
      }

      const now = this.now()
      const refreshThreshold = now + this.refreshAheadMs

      // Check each environment for expiring tokens
      for (const key of envKeys.value) {
        // Extract environmentId from key format: project:{id}:authentication:{environmentId}
        const parts = key.split(':')
        if (parts.length < 4) continue
        const environmentId = parts[3]
        if (typeof environmentId !== 'string') continue

        const authResult = await this.current(environmentId)
        if (!authResult.ok) continue
        const auth = authResult.value
        if (!auth) continue

        // Skip if no expiration time or if already expired (let restore handle expired ones)
        if (!auth.expiresAt || auth.expiresAt <= now) continue

        // Check if token expires within our refresh window
        if (auth.expiresAt <= refreshThreshold) {
          // Try to refresh using the associated login
          await this.refreshTokenUsingLogin(environmentId, auth)
        }
      }
    } catch (error) {
      console.error('Error in auto-refresh scheduler:', error)
    }
  }

  /** Attempt to refresh a token using the saved login credentials */
  private async refreshTokenUsingLogin(
    environmentId: string,
    _currentAuth: AuthRecord,
  ): Promise<void> {
    try {
      // Get the login credentials for the currently active token
      const loginResult = await this.activeLogin(environmentId)
      if (!loginResult) {
        // No login credentials available for this token - can't auto-refresh
        return
      }

      const { username, credentialId } = loginResult

      // Find the login template that matches this credential
      // We'll look for a template that could be used to refresh this specific account
      const savedCredentials = await this.listSaved()
      if (!savedCredentials.ok) return

      // Find the credential that matches our login
      const credential = savedCredentials.value.find((c) => c.id === credentialId)
      if (!credential || !credential.login) return

      // We have a login - now we need to find or create a refresh mechanism
      // For now, we'll notify the user that a token is about to expire
      // In a full implementation, this would call the actual login/refresh endpoint
      this.bus?.publish('NOTIFY', {
        kind: 'warning',
        message: `Token for user "${username}" in environment "${environmentId}" is expiring soon. Please refresh to avoid service interruptions.`,
      })
    } catch (error) {
      console.error(`Failed to refresh token for environment ${environmentId}:`, error)
    }
  }

  /** Stop the auto-refresh scheduler */
  public stopAutoRefreshScheduler(): void {
    if (this.autoRefreshTimer) {
      clearTimeout(this.autoRefreshTimer)
      this.autoRefreshTimer = null
    }
  }
}

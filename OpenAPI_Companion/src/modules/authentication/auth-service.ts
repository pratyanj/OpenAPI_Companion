import { ok, err, type Result, type AppError, type Unsubscribe } from '@/types'
import { projectKey, type StorageService } from '@/core/storage'
import type { EventBus } from '@/core/events'
import type { SwaggerAdapter, AuthSnapshot } from '@/adapters'
import { decodeJwtExpiryMs, isJwt } from '@/utils'
import { SUPPORTED_AUTH_TYPES, type AuthRecord, type AuthType } from './types'

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

  constructor(options: AuthenticationServiceOptions) {
    this.storage = options.storage
    this.adapter = options.adapter
    this.projectId = options.projectId
    this.bus = options.bus
    this.now = options.now ?? (() => Date.now())
  }

  private key(environmentId: string): string {
    return projectKey(this.projectId, 'authentication', environmentId)
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
    const snapshot: AuthSnapshot = { type: 'bearer', token, schemeName }
    const record: AuthRecord = {
      type: this.refineType(snapshot),
      token,
      schemeName,
      environmentId,
      updatedAt: this.now(),
      expiresAt: this.expiryOf(token) ?? undefined,
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
    if (snapshot.type === 'bearer' && isJwt(snapshot.token)) return 'jwt'
    return snapshot.type
  }

  private expiryOf(token: string): number | null {
    return isJwt(token) ? decodeJwtExpiryMs(token) : null
  }
}

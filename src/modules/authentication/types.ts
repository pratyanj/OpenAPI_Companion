/** Authentication domain types (FDD-001, planning/08 §5). */

export type AuthType = 'bearer' | 'jwt' | 'apiKey' | 'basic'

export const SUPPORTED_AUTH_TYPES: readonly AuthType[] = ['bearer', 'jwt', 'apiKey', 'basic']

export interface AuthRecord {
  type: AuthType
  token: string
  /** Swagger security-scheme name — needed to restore into the right scheme. */
  schemeName?: string
  environmentId: string
  updatedAt: number
  lastUsed?: number
  /** Epoch-ms expiry (from a JWT `exp` claim), when known. */
  expiresAt?: number
}

export type AuthStatus = 'none' | 'authorized' | 'expired'

/**
 * A credential saved under a name, so switching accounts (admin / manager /
 * read-only) is one click instead of re-authorizing in Swagger every time.
 * Separate from the active `AuthRecord`: the vault is per project and outlives
 * whichever environment is currently selected.
 */
/**
 * Credentials for re-logging-in a saved token's account.
 *
 * ⚠️ Stored in `chrome.storage.local` in plaintext, like every other value this
 * extension keeps (DD-037). Unlike a token, a password does not expire, so this
 * is deliberately opt-in per credential and is REDACTED from exports/backups
 * (see ImportExportService) — a shared backup file must not leak passwords.
 */
export interface SavedLogin {
  /** Email / username for this account. */
  username: string
  password: string
  /** Optional extra fields required by this API (e.g. force_logout: true, tenant_id, client_id) */
  extraFields?: Record<string, string | number | boolean>
}

export interface SavedCredential {
  id: string
  name: string
  type: AuthType
  token: string
  schemeName?: string
  createdAt: number
  /** Epoch-ms expiry (from a JWT `exp` claim), when known. */
  expiresAt?: number
  /** Optional: how to log this account back in when its token expires. */
  login?: SavedLogin
}

/**
 * Minimal JWT helpers — read the `exp` claim to detect expiry (EC-008)
 * and extract user display metadata.
 * Does NOT verify signatures (client-side, informational only).
 */

/** True if the token has the three dot-separated segments of a JWT. */
export function isJwt(token: string): boolean {
  return token.split('.').length === 3
}

function base64UrlDecode(segment: string): string {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
  return atob(padded)
}

/** Epoch-ms expiry from a JWT's `exp` claim, or null if absent/unparseable. */
export function decodeJwtExpiryMs(token: string): number | null {
  const parts = token.split('.')
  if (parts.length !== 3 || !parts[1]) return null
  try {
    const payload = JSON.parse(base64UrlDecode(parts[1])) as { exp?: unknown }
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null
  } catch {
    return null
  }
}

/** Decodes payload claims from a JWT, or null if invalid/unparseable. */
export function decodeJwtClaims(token: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length !== 3 || !parts[1]) return null
  try {
    const parsed = JSON.parse(base64UrlDecode(parts[1]))
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

export interface UserDisplayInfo {
  name?: string
  role?: string
}

/** Extracts user display name and role from common JWT claims. */
export function extractUserDisplayFromJwt(token: string): UserDisplayInfo | null {
  const claims = decodeJwtClaims(token)
  if (!claims) return null

  let role: string | undefined
  if (typeof claims.role === 'string' && claims.role.trim()) {
    role = claims.role.trim()
  } else if (
    Array.isArray(claims.roles) &&
    typeof claims.roles[0] === 'string' &&
    claims.roles[0].trim()
  ) {
    role = claims.roles[0].trim()
  } else if (
    typeof claims['https://schemas.microsoft.com/ws/2008/06/identity/claims/role'] === 'string'
  ) {
    role = String(claims['https://schemas.microsoft.com/ws/2008/06/identity/claims/role']).trim()
  }

  let name: string | undefined
  if (typeof claims.name === 'string' && claims.name.trim()) {
    name = claims.name.trim()
  } else if (typeof claims.username === 'string' && claims.username.trim()) {
    name = claims.username.trim()
  } else if (typeof claims.preferred_username === 'string' && claims.preferred_username.trim()) {
    name = claims.preferred_username.trim()
  } else if (typeof claims.email === 'string' && claims.email.trim()) {
    name = claims.email.trim()
  } else if (typeof claims.sub === 'string' && claims.sub.trim()) {
    name = claims.sub.trim()
  }

  return name || role ? { name, role } : null
}

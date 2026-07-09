/**
 * Minimal JWT helpers — read the `exp` claim to detect expiry (EC-008).
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

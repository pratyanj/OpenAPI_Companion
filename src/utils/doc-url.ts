/**
 * Stable identity URL for a documentation page: origin + pathname + search,
 * with the hash removed. Swagger UI uses hash-based routing (`#/`,
 * `#/operations-…`), so the hash changes as the user navigates and can differ
 * on refresh — it must NOT be part of the project identity, or saved data gets
 * orphaned under a new id (planning/08 §4, EC-007).
 */
export function docIdentityUrl(href: string): string {
  try {
    const url = new URL(href)
    return `${url.origin}${url.pathname}${url.search}`
  } catch {
    // Fall back to stripping any fragment manually if URL parsing fails.
    return href.split('#')[0] ?? href
  }
}

/** True if `value` is an absolute http(s) URL (safe to navigate to). */
export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/** Returns true for localhost, loopback IPs (127.0.0.0/8, [::1]), 0.0.0.0, private LAN IPs, and .local hostnames. */
export function isLocalHost(hostOrOrigin: string): boolean {
  try {
    let host = hostOrOrigin.toLowerCase().trim()
    if (host.includes('://')) {
      host = new URL(hostOrOrigin).hostname.toLowerCase()
    } else if (host.includes(':')) {
      host = host.split(':')[0] ?? host
    }
    // localhost and .local mDNS
    if (host === 'localhost' || host.endsWith('.local')) return true
    // IPv4 loopback (127.0.0.0/8)
    if (/^127\./.test(host)) return true
    // IPv6 loopback & any
    if (host === '::1' || host === '0.0.0.0' || host === '[::1]') return true
    // Private IP ranges (RFC1918)
    if (/^10\./.test(host)) return true
    if (/^192\.168\./.test(host)) return true
    if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)) return true
    return false
  } catch {
    return false
  }
}

/**
 * Normalizes loopback hostnames (127.0.0.1, 0.0.0.0, ::1) to 'localhost'
 * while preserving protocol and port (e.g. http://127.0.0.1:8008 -> http://localhost:8008).
 */
export function normalizeLocalOrigin(origin: string): string {
  try {
    const url = new URL(origin)
    const host = url.hostname.toLowerCase()
    if (host === '127.0.0.1' || host === '0.0.0.0' || host === '::1' || host === '[::1]') {
      url.hostname = 'localhost'
      return url.origin
    }
    return url.origin
  } catch {
    return origin
  }
}

/** Extracts port number as string, falling back to protocol default if omitted. */
export function extractPort(originOrUrl: string): string | null {
  try {
    const url = new URL(originOrUrl)
    if (url.port) return url.port
    return url.protocol === 'https:' ? '443' : '80'
  } catch {
    return null
  }
}

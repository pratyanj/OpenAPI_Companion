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

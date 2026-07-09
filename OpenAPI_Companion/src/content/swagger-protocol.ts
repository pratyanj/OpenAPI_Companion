/**
 * Shared protocol between the ISOLATED content script (sidebar, has
 * chrome.storage) and the MAIN-world script (has `window.ui`, no chrome.*).
 *
 * Content scripts cannot see the page's `window.ui` (world isolation), so all
 * Swagger auth read/write happens in the MAIN world and is relayed here via
 * `window.postMessage`. This module holds the pure, testable Swagger-internals
 * logic used by the MAIN-world script.
 */
import type { AuthSnapshot } from '@/adapters'

export const BRIDGE_TAG = '__openapi_companion_bridge__'

export interface AuthorizedEntry {
  value?: unknown
  schema?: { type?: string; scheme?: string }
}

/** MAIN → ISOLATED */
export type BridgeInbound =
  | {
      tag: typeof BRIDGE_TAG
      dir: 'from-main'
      type: 'ready'
      specUrl: string | null
      version: string | null
    }
  | { tag: typeof BRIDGE_TAG; dir: 'from-main'; type: 'auth'; snapshot: AuthSnapshot | null }

/** ISOLATED → MAIN */
export type BridgeOutbound =
  | { tag: typeof BRIDGE_TAG; dir: 'to-main'; cmd: 'readAuth' }
  | { tag: typeof BRIDGE_TAG; dir: 'to-main'; cmd: 'writeAuth'; snapshot: AuthSnapshot }
  | { tag: typeof BRIDGE_TAG; dir: 'to-main'; cmd: 'clearAuth' }

export function isInbound(data: unknown): data is BridgeInbound {
  const d = data as Partial<BridgeInbound> | undefined
  return !!d && d.tag === BRIDGE_TAG && d.dir === 'from-main'
}

export function isOutbound(data: unknown): data is BridgeOutbound {
  const d = data as Partial<BridgeOutbound> | undefined
  return !!d && d.tag === BRIDGE_TAG && d.dir === 'to-main'
}

/** Extract the first usable credential from Swagger's `auth.authorized` slice. */
export function extractAuth(
  authorized: Record<string, AuthorizedEntry> | undefined,
): AuthSnapshot | null {
  if (!authorized) return null
  for (const [schemeName, entry] of Object.entries(authorized)) {
    const snapshot = toSnapshot(schemeName, entry)
    if (snapshot?.token) return snapshot
  }
  return null
}

function toSnapshot(schemeName: string, entry: AuthorizedEntry): AuthSnapshot | null {
  const schema = entry.schema ?? {}
  if (schema.type === 'apiKey') {
    return typeof entry.value === 'string'
      ? { type: 'apiKey', token: entry.value, schemeName }
      : null
  }
  if (schema.type === 'http' && schema.scheme === 'basic') {
    const v = entry.value as { username?: string; password?: string } | undefined
    if (v?.username == null) return null
    return { type: 'basic', token: btoa(`${v.username}:${v.password ?? ''}`), schemeName }
  }
  if (schema.type === 'http' && schema.scheme === 'bearer') {
    return typeof entry.value === 'string'
      ? { type: 'bearer', token: entry.value, schemeName }
      : null
  }
  return null // unknown / oauth2 — out of MVP scope
}

/** Build the payload for `window.ui.authActions.authorize(...)`. */
export function buildAuthorizePayload(snapshot: AuthSnapshot): Record<string, unknown> {
  const name = snapshot.schemeName ?? 'Authorization'
  return { [name]: { name, value: valueFor(snapshot), schema: schemaFor(snapshot) } }
}

function valueFor(snapshot: AuthSnapshot): unknown {
  if (snapshot.type === 'basic') {
    const [username = '', password = ''] = atob(snapshot.token).split(':')
    return { username, password }
  }
  return snapshot.token
}

function schemaFor(snapshot: AuthSnapshot): { type: string; scheme?: string } {
  if (snapshot.type === 'apiKey') return { type: 'apiKey' }
  if (snapshot.type === 'basic') return { type: 'http', scheme: 'basic' }
  return { type: 'http', scheme: 'bearer' }
}

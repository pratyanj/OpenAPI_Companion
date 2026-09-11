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
import { substitute } from '@/modules/environment/env-service'

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
  | { tag: typeof BRIDGE_TAG; dir: 'to-main'; cmd: 'syncVariables'; variables: Record<string, string> }

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

/** A security scheme from the API spec (OAS2 `securityDefinitions` / OAS3 `securitySchemes`). */
export interface SchemeDefinition {
  type?: string
  scheme?: string
  name?: string
  in?: string
}

/**
 * The API's security schemes, read from Swagger's serialized state.
 *
 * They live in the SPEC (`securityDefinitions` for OAS2, `components.
 * securitySchemes` for OAS3) — NOT under `auth.definitions`, which is empty in
 * most builds. Reading the wrong slice made every scheme look absent, so writes
 * fell back to the reconstructed http/bearer payload and an apiKey scheme's
 * Authorize box stayed empty. Checks resolved + raw spec, then `auth.definitions`
 * as a last resort, and returns the first non-empty set.
 */
export function securityDefinitionsFrom(state: unknown): Record<string, SchemeDefinition> {
  const s = state as
    | {
        spec?: {
          json?: { securityDefinitions?: unknown; components?: { securitySchemes?: unknown } }
          resolvedSpec?: {
            securityDefinitions?: unknown
            components?: { securitySchemes?: unknown }
          }
        }
        auth?: { definitions?: unknown }
      }
    | undefined
  const candidates = [
    s?.spec?.resolvedSpec?.components?.securitySchemes,
    s?.spec?.resolvedSpec?.securityDefinitions,
    s?.spec?.json?.components?.securitySchemes,
    s?.spec?.json?.securityDefinitions,
    s?.auth?.definitions,
  ]
  for (const raw of candidates) {
    if (!raw || typeof raw !== 'object') continue
    const out: Record<string, SchemeDefinition> = {}
    for (const [name, def] of Object.entries(raw as Record<string, unknown>)) {
      if (def && typeof def === 'object') {
        const d = def as SchemeDefinition
        out[name] = { type: d.type, scheme: d.scheme, name: d.name, in: d.in }
      }
    }
    if (Object.keys(out).length > 0) return out
  }
  return {}
}

/**
 * Choose which of the API's declared security schemes to authorize.
 *
 * Prefers the credential's own scheme name when it's a real definition;
 * otherwise picks a compatible one from the spec. This is what makes a token
 * that arrived without accurate scheme info (from a refreshed login or an added
 * account) still authorize the API's actual scheme.
 */
export function chooseScheme(
  snapshot: AuthSnapshot,
  defs: Record<string, SchemeDefinition>,
): string | undefined {
  const names = Object.keys(defs)
  if (snapshot.schemeName && defs[snapshot.schemeName]) return snapshot.schemeName
  if (snapshot.type === 'basic') {
    const basic = names.find((n) => defs[n]?.scheme === 'basic')
    if (basic) return basic
  }
  if (snapshot.type === 'apiKey') {
    const apiKey = names.find((n) => defs[n]?.type === 'apiKey')
    if (apiKey) return apiKey
  }
  return (
    names.find((n) => defs[n]?.type === 'apiKey') ??
    names.find((n) => defs[n]?.scheme === 'bearer') ??
    names[0] ??
    snapshot.schemeName
  )
}

/** The value Swagger's authorize expects for an HTTP scheme (not apiKey). */
function httpValue(snapshot: AuthSnapshot, def?: SchemeDefinition): unknown {
  if (snapshot.type === 'basic') {
    const [username = '', password = ''] = atob(snapshot.token).split(':')
    return { username, password }
  }
  // Non-basic here (basic returned above). An http-bearer scheme adds "Bearer "
  // itself, so it wants the RAW token; anything else takes the value as-is.
  const scheme = def?.scheme ?? 'bearer'
  if (scheme === 'bearer') return snapshot.token.replace(/^bearer\s+/i, '')
  return snapshot.token
}

/** How a token should be written, resolved against the API's real schemes. */
export type AuthWritePlan =
  | { via: 'apiKey'; name: string; value: string }
  | { via: 'authorize'; payload: Record<string, unknown> }

/**
 * Decide how to apply a credential using the API's ACTUAL security schemes,
 * rather than a shape reconstructed from our stored `type` (which is wrong for
 * apiKey schemes whose value happens to be a JWT — the case that left Swagger's
 * Authorize box empty). apiKey → `preauthorizeApiKey`; http → `authorize` with
 * the real schema. Falls back to the reconstructed payload when the spec's
 * definitions aren't readable yet (the caller retries as the spec loads).
 */
export function planAuthWrite(
  snapshot: AuthSnapshot,
  defs: Record<string, SchemeDefinition>,
): AuthWritePlan {
  const name = chooseScheme(snapshot, defs)
  if (!name) return { via: 'authorize', payload: buildAuthorizePayload(snapshot) }

  const def = defs[name]
  const type = def?.type ?? (snapshot.type === 'apiKey' ? 'apiKey' : 'http')
  if (type === 'apiKey') {
    // apiKey header carries the WHOLE value (e.g. "Bearer <jwt>") as-is.
    return { via: 'apiKey', name, value: snapshot.token }
  }
  return {
    via: 'authorize',
    payload: {
      [name]: { name, value: httpValue(snapshot, def), schema: def ?? schemaFor(snapshot) },
    },
  }
}


/** Pure variable resolver for strings containing {{VAR}} or %7B%7BVAR%7D%7D. */
export function resolveWithVariables(
  text: string,
  variables: Record<string, string>,
): string {
  return substitute(text, variables).text
}

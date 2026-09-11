/**
 * MAIN-world content script — runs in the PAGE's JavaScript world, where
 * Swagger's system object lives (the isolated content script cannot see it).
 * How that object is exposed varies by template — see `swagger-ui-global.ts`
 * (FastAPI's `/docs` uses `const ui`, which is not on `window`).
 *
 * It relays auth state to the isolated sidebar and executes authorize/logout
 * commands, all over `window.postMessage`. It has NO access to chrome.* APIs.
 *
 * Also intercepts outgoing HTTP requests (via window.fetch, XMLHttpRequest, and
 * Swagger's requestInterceptor) to resolve {{variable}} and %7B%7Bvariable%7D%7D
 * placeholders using the active project variables.
 */
import { resolveSwaggerUi, type SwaggerUiGlobal } from './swagger-ui-global'
import {
  BRIDGE_TAG,
  buildAuthorizePayload,
  extractAuth,
  isOutbound,
  securityDefinitionsFrom,
  type AuthorizedEntry,
  type BridgeInbound,
  planAuthWrite,
  type SchemeDefinition,
  resolveWithVariables,
} from './swagger-protocol'

function readAuthorized(): Record<string, AuthorizedEntry> | undefined {
  const json = resolveSwaggerUi()?.getState?.()?.toJS?.() as
    { auth?: { authorized?: Record<string, AuthorizedEntry> } } | undefined
  return json?.auth?.authorized
}

function specUrl(): string | null {
  const configs = resolveSwaggerUi()?.getConfigs?.()
  return configs?.url ?? configs?.urls?.[0]?.url ?? null
}

function version(): string | null {
  for (const script of Array.from(document.querySelectorAll('script[src]'))) {
    const match = (script.getAttribute('src') ?? '').match(/swagger-ui[^/]*?@?(\d+\.\d+\.\d+)/)
    if (match) return match[1] ?? null
  }
  return null
}

function post(message: BridgeInbound): void {
  window.postMessage(message, '*')
}

let lastAuthKey = ' '
function pushAuth(force = false): void {
  const snapshot = extractAuth(readAuthorized())
  const key = JSON.stringify(snapshot)
  if (force || key !== lastAuthKey) {
    lastAuthKey = key
    post({ tag: BRIDGE_TAG, dir: 'from-main', type: 'auth', snapshot })
  }
}

function handshake(): void {
  post({ tag: BRIDGE_TAG, dir: 'from-main', type: 'ready', specUrl: specUrl(), version: version() })
  pushAuth(true)
}

/** The API's declared security schemes, read from Swagger's serialized spec. */
function schemeDefinitions(): Record<string, SchemeDefinition> {
  return securityDefinitionsFrom(resolveSwaggerUi()?.getState?.()?.toJS?.())
}

// Swagger loads its spec asynchronously, so an authorize call can no-op if it
// runs too early. `applyWrite` retries (up to ~6s) until the credential is
// actually reflected in Swagger's auth state.
function applyWrite(snapshot: Parameters<typeof buildAuthorizePayload>[0], attempt = 0): void {
  const swagger: SwaggerUiGlobal | undefined = resolveSwaggerUi()
  const canApiKey = Boolean(swagger?.preauthorizeApiKey)
  const canAuthorize = Boolean(swagger?.authActions?.authorize)

  if (!canApiKey && !canAuthorize) {
    if (attempt < 20) setTimeout(() => applyWrite(snapshot, attempt + 1), 300)
    return
  }

  // Route by the API's REAL scheme (read from the spec), not our stored type —
  // an apiKey scheme holding a JWT must go through preauthorizeApiKey, or Swagger
  // silently ignores the authorize() call and the Authorize box stays empty.
  const defs = schemeDefinitions()
  const plan = planAuthWrite(snapshot, defs)
  if (plan.via === 'apiKey') {
    if (canApiKey) swagger?.preauthorizeApiKey?.(plan.name, plan.value)
    else swagger?.authActions?.authorize?.(buildAuthorizePayload(snapshot))
  } else {
    swagger?.authActions?.authorize?.(plan.payload)
  }
  pushAuth(true)

  // Verify it stuck (the spec's scheme definitions may still be loading); retry
  // until they are, so the correct route is taken once they appear.
  const applied = extractAuth(readAuthorized()) != null
  if (!applied && attempt < 20) {
    setTimeout(() => applyWrite(snapshot, attempt + 1), 300)
  } else {
    console.debug(
      `[OpenAPI Companion] auth write ${applied ? 'applied' : 'gave up'} via ${plan.via}, ` +
        `${Object.keys(defs).length} scheme(s) (attempt ${attempt})`,
    )
  }
}

// ---------------------------------------------------------------------------
// Variable Resolution in Network Requests (fetch, XHR, Swagger requestInterceptor)
// ---------------------------------------------------------------------------

let activeVariables: Record<string, string> = {}

export function getActiveVariables(): Record<string, string> {
  return activeVariables
}

/** Hook into Swagger's configuration requestInterceptor if available. */
function hookSwaggerInterceptor(): void {
  const swagger = resolveSwaggerUi()
  const configs = swagger?.getConfigs?.() as Record<string, unknown> | undefined
  if (configs && !configs.__oacHooked) {
    configs.__oacHooked = true
    const prev = configs.requestInterceptor as ((req: unknown) => unknown) | undefined
    configs.requestInterceptor = (req: unknown): unknown => {
      let modified = req
      if (typeof prev === 'function') {
        try {
          modified = prev(req) ?? req
        } catch (e) {
          console.error('[OpenAPI Companion] prev requestInterceptor error:', e)
        }
      }
      if (modified && typeof modified === 'object') {
        const m = modified as Record<string, unknown>
        if (typeof m.url === 'string') {
          m.url = resolveWithVariables(m.url, activeVariables)
        }
        if (m.headers && typeof m.headers === 'object') {
          const headers = m.headers as Record<string, unknown>
          for (const [k, v] of Object.entries(headers)) {
            if (typeof v === 'string') {
              headers[k] = resolveWithVariables(v, activeVariables)
            }
          }
        }
        if (typeof m.body === 'string') {
          m.body = resolveWithVariables(m.body, activeVariables)
        }
      }
      return modified
    }
  }
}

/** Intercept window.fetch to substitute {{VAR}} in URL, headers, and request body. */
export function hookFetch(): void {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return
  const currentFetch = window.fetch as unknown as { __oacHooked?: boolean }
  if (currentFetch.__oacHooked) return

  const originalFetch = window.fetch
  const wrappedFetch = async function (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    try {
      if (typeof input === 'string') {
        input = resolveWithVariables(input, activeVariables)
      } else if (input instanceof URL) {
        input = new URL(resolveWithVariables(input.toString(), activeVariables))
      }

      if (init) {
        let modifiedHeaders = init.headers
        if (modifiedHeaders) {
          if (typeof Headers !== 'undefined' && modifiedHeaders instanceof Headers) {
            const nextHeaders = new Headers()
            modifiedHeaders.forEach((val, key) => {
              nextHeaders.set(key, resolveWithVariables(val, activeVariables))
            })
            modifiedHeaders = nextHeaders
          } else if (Array.isArray(modifiedHeaders)) {
            modifiedHeaders = modifiedHeaders.map(([k, v]) => [
              k,
              resolveWithVariables(String(v), activeVariables),
            ])
          } else if (typeof modifiedHeaders === 'object') {
            const nextHeaders: Record<string, string> = {}
            for (const [k, v] of Object.entries(modifiedHeaders as Record<string, unknown>)) {
              nextHeaders[k] = typeof v === 'string' ? resolveWithVariables(v, activeVariables) : String(v)
            }
            modifiedHeaders = nextHeaders
          }
        }

        let modifiedBody = init.body
        if (typeof modifiedBody === 'string') {
          modifiedBody = resolveWithVariables(modifiedBody, activeVariables)
        }

        init = {
          ...init,
          headers: modifiedHeaders,
          body: modifiedBody,
        }
      }
    } catch (err) {
      console.warn('[OpenAPI Companion] error resolving variables in fetch:', err)
    }

    return originalFetch.apply(this, [input, init])
  }

  ;(wrappedFetch as unknown as { __oacHooked: boolean }).__oacHooked = true
  window.fetch = wrappedFetch
}

/** Intercept XMLHttpRequest to resolve variables in open(), setRequestHeader(), and send(). */
export function hookXHR(): void {
  if (typeof window === 'undefined' || typeof window.XMLHttpRequest === 'undefined') return
  const proto = XMLHttpRequest.prototype as unknown as {
    __oacHooked?: boolean
    open: (...args: unknown[]) => void
    setRequestHeader: (header: string, value: string) => void
    send: (body?: Document | XMLHttpRequestBodyInit | null) => void
  }
  if (proto.__oacHooked) return
  proto.__oacHooked = true

  const origOpen = proto.open
  proto.open = function (method: unknown, url: unknown, ...rest: unknown[]) {
    const resolvedUrl = typeof url === 'string' ? resolveWithVariables(url, activeVariables) : url
    return origOpen.apply(this, [method, resolvedUrl, ...rest])
  }

  const origSetHeader = proto.setRequestHeader
  proto.setRequestHeader = function (header: string, value: string) {
    const resolvedVal = typeof value === 'string' ? resolveWithVariables(value, activeVariables) : value
    return origSetHeader.apply(this, [header, resolvedVal])
  }

  const origSend = proto.send
  proto.send = function (body?: unknown) {
    if (typeof body === 'string') {
      body = resolveWithVariables(body, activeVariables)
    }
    return origSend.apply(this, [body as Document | XMLHttpRequestBodyInit | null | undefined])
  }
}

// Initialize network hooks immediately
hookFetch()
hookXHR()

window.addEventListener('message', (event: MessageEvent) => {
  if ((event.source && event.source !== window) || !isOutbound(event.data)) return
  const message = event.data

  if (message.cmd === 'writeAuth') {
    applyWrite(message.snapshot)
  } else if (message.cmd === 'clearAuth') {
    const authorized = readAuthorized()
    resolveSwaggerUi()?.authActions?.logout?.(authorized ? Object.keys(authorized) : [])
    pushAuth(true)
  } else if (message.cmd === 'readAuth') {
    handshake()
  } else if (message.cmd === 'syncVariables') {
    activeVariables = { ...(message.variables ?? {}) }
    hookSwaggerInterceptor()
  }
})

// Announce readiness and current auth, then keep the isolated side in sync.
console.debug(
  `[OpenAPI Companion] main-world active; Swagger object ${resolveSwaggerUi() ? 'found' : 'not yet'}`,
)
handshake()
setInterval(() => {
  pushAuth(false)
  hookSwaggerInterceptor()
}, 1000)

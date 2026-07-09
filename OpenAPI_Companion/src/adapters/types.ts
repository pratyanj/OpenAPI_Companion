/**
 * SwaggerAdapter contract — the ONLY code allowed to touch the Swagger DOM
 * (isolates risk R-01). Swagger-UI + future ReDoc/Scalar/RapiDoc adapters
 * implement this. Implementation lands in Sprint 3 (T-01.10..T-01.12).
 * See planning/11_SERVICE_PLAN.md.
 */
import type { Result } from '@/types'

export type Unsubscribe = () => void

export interface AuthSnapshot {
  type: 'bearer' | 'jwt' | 'apiKey' | 'basic'
  token: string
  /** Swagger security-scheme name this credential belongs to (needed to restore). */
  schemeName?: string
}

export interface RequestSnapshot {
  endpointId: string
  method: string
  body?: string
  headers?: Record<string, string>
  query?: Record<string, string>
  path?: Record<string, string>
  contentType?: string
}

export type SwaggerChange =
  | { kind: 'auth'; snapshot: AuthSnapshot }
  | { kind: 'request'; snapshot: RequestSnapshot }
  | { kind: 'execute'; endpointId: string }

/** A single operation discovered on the page (open or not), for search/navigation. */
export interface EndpointInfo {
  /** `"<method> <path>"` — same id shape used across the app. */
  endpointId: string
  method: string
  path: string
  /** Operation summary text, when Swagger renders one. */
  summary?: string
  /** Tag/section the operation is grouped under, when present. */
  tag?: string
}

/** A request that has been executed in Swagger and rendered a live response. */
export interface ExecutedResponse {
  endpointId: string
  method: string
  endpoint: string
  requestBody?: string
  status: number
  responseBody?: string
  durationMs?: number
}

/**
 * The MAIN-world bridge surface the adapter needs. Implemented by SwaggerBridge
 * (isolated world) which relays to `window.ui`. Declared here so `adapters/`
 * has no dependency on `content/`.
 */
export interface AuthBridge {
  getAuth(): AuthSnapshot | null
  writeAuth(auth: AuthSnapshot): void
  clearAuth(): void
  getSpecUrl(): string | null
  getVersion(): string | null
}

export interface SwaggerAdapter {
  detect(): boolean
  version(): string | null
  /** The OpenAPI/Swagger spec URL the page is rendering, if discoverable. */
  specUrl(): string | null
  readAuth(): AuthSnapshot | null
  writeAuth(auth: AuthSnapshot): Result<void>
  clearAuth(): Result<void>
  /** All currently-open "Try it out" operations with their entered values. */
  readOpenRequests(): RequestSnapshot[]
  /** Populate an open operation's fields (never executes it). */
  writeRequest(endpointId: string, data: RequestSnapshot): Result<void>
  /**
   * Navigate to an operation, expand + enable "Try it out", populate the body,
   * and click Execute — a full auto-replay (unlike writeRequest, which only fills).
   */
  replay(endpointId: string, body?: string): Result<void>
  /** True if the operation is open with an empty body — safe to auto-restore. */
  isRequestBodyEmpty(endpointId: string): boolean
  /** Currently-rendered executed responses in open operations (for History). */
  readExecutedResponses(): ExecutedResponse[]
  /** Every operation on the page (open or not), for endpoint search/index. */
  listEndpoints(): EndpointInfo[]
  /** Expand an operation and scroll it into view, without executing it. */
  openEndpoint(endpointId: string): Result<void>
  observe(cb: (change: SwaggerChange) => void): Unsubscribe
}

import { ok, err, type Result, type AppError, type Unsubscribe } from '@/types'
import type {
  AuthBridge,
  AuthSnapshot,
  EndpointInfo,
  ExecutedResponse,
  RequestSnapshot,
  SwaggerAdapter,
  SwaggerChange,
} from '../types'
import { autoExecute, isBodyEmpty, readOpenRequests, writeRequestBody } from './swagger-request-dom'
import { readExecutedResponses } from './swagger-response-dom'
import { listEndpoints, openEndpoint } from './swagger-endpoint-dom'

const noBridge = (op: string): AppError => ({
  code: 'ADAPTER_NO_BRIDGE',
  message: `MAIN-world bridge not available for ${op}`,
  recoverable: true,
})

/**
 * Swagger UI adapter — the ONLY code that represents the Swagger boundary
 * (isolates risk R-01; planning/11 SwaggerAdapter).
 *
 * Detection reads the shared DOM (works in the isolated content-script world).
 * Auth read/write go through the injected `AuthBridge` (SwaggerBridge), because
 * `window.ui` lives in the page's MAIN world and is invisible to content
 * scripts. Request read/write remain stubbed until Sprint 6.
 */
export class SwaggerUiAdapter implements SwaggerAdapter {
  constructor(private readonly bridge?: AuthBridge) {}

  detect(): boolean {
    return Boolean(
      document.querySelector('#swagger-ui') ||
      document.querySelector('.swagger-ui') ||
      document.querySelector('meta[name="swagger-ui"]'),
    )
  }

  version(): string | null {
    const fromBridge = this.bridge?.getVersion()
    if (fromBridge) return fromBridge
    for (const script of Array.from(document.querySelectorAll('script[src]'))) {
      const match = (script.getAttribute('src') ?? '').match(/swagger-ui[^/]*?@?(\d+\.\d+\.\d+)/)
      if (match) return match[1] ?? null
    }
    return null
  }

  specUrl(): string | null {
    return this.bridge?.getSpecUrl() ?? null
  }

  readAuth(): AuthSnapshot | null {
    return this.bridge?.getAuth() ?? null
  }

  writeAuth(auth: AuthSnapshot): Result<void> {
    if (!this.bridge) return err(noBridge('writeAuth'))
    this.bridge.writeAuth(auth)
    return ok(undefined)
  }

  clearAuth(): Result<void> {
    if (!this.bridge) return err(noBridge('clearAuth'))
    this.bridge.clearAuth()
    return ok(undefined)
  }

  readOpenRequests(): RequestSnapshot[] {
    return readOpenRequests()
  }

  writeRequest(endpointId: string, data: RequestSnapshot): Result<void> {
    if (data.body == null) return ok(undefined)
    const done = writeRequestBody(document, endpointId, data.body)
    return done ? ok(undefined) : err(this.notFound(endpointId))
  }

  /**
   * Expand the operation, enable "Try it out", fill the body, then Execute — with
   * no user interaction. Delegates to the polling state machine in
   * `autoExecute` (Swagger re-renders asynchronously between each step).
   */
  replay(endpointId: string, body?: string): Result<void> {
    const started = autoExecute(document, endpointId, { body })
    return started ? ok(undefined) : err(this.notFound(endpointId))
  }

  /** True if the operation is open with an empty body — safe to auto-restore. */
  isRequestBodyEmpty(endpointId: string): boolean {
    return isBodyEmpty(document, endpointId)
  }

  readExecutedResponses(): ExecutedResponse[] {
    return readExecutedResponses(document)
  }

  listEndpoints(): EndpointInfo[] {
    return listEndpoints(document)
  }

  openEndpoint(endpointId: string): Result<void> {
    return openEndpoint(document, endpointId) ? ok(undefined) : err(this.notFound(endpointId))
  }

  private notFound(endpointId: string): AppError {
    return {
      code: 'REQUEST_ENDPOINT_NOT_OPEN',
      message: `No open operation matching "${endpointId}"`,
      recoverable: true,
    }
  }

  observe(cb: (change: SwaggerChange) => void): Unsubscribe {
    const target = document.querySelector('#swagger-ui') ?? document.body
    if (!target || typeof MutationObserver === 'undefined') return () => {}
    const observer = new MutationObserver(() => {
      cb({ kind: 'request', snapshot: { endpointId: 'unknown', method: 'unknown' } })
    })
    observer.observe(target, { childList: true, subtree: true, attributes: true })
    return () => observer.disconnect()
  }
}

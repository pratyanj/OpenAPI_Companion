import type { SwaggerAdapter } from '@/adapters'
import type { StepExecutionPayload } from './types'

/**
 * Executes a single workflow step in the active Swagger page by driving Swagger UI
 * via adapter.replay() and polling until a fresh response appears.
 */
export async function executeWorkflowStep(
  adapter: SwaggerAdapter,
  payload: StepExecutionPayload,
  timeoutMs = 30000,
  pollMs = 100,
  signal?: AbortSignal,
): Promise<{ status?: number; error?: string; success: boolean; responseBody?: string }> {
  if (signal?.aborted) {
    return { success: false, error: 'Execution cancelled' }
  }

  const endpointId = payload.step.endpointId

  // Snapshot recent responses to detect when a fresh one renders
  const before = new Map(
    adapter
      .readExecutedResponses()
      .map((r) => [r.endpointId.toLowerCase(), `${r.status}:${r.responseBody ?? ''}`]),
  )

  const replayed = adapter.replay(
    endpointId,
    payload.resolvedBody,
    payload.resolvedPathParams,
    payload.resolvedQueryParams,
    payload.resolvedHeaders,
  )

  if (!replayed.ok) {
    return {
      success: false,
      error: `Could not trigger execution for "${endpointId}": ${replayed.error.message}`,
    }
  }

  const startTime = Date.now()
  return new Promise((resolve) => {
    let timerId: ReturnType<typeof setTimeout> | null = null

    const cleanup = () => {
      if (timerId) clearTimeout(timerId)
      if (signal) signal.removeEventListener('abort', onAbort)
    }

    const onAbort = () => {
      cleanup()
      resolve({
        success: false,
        error: 'Execution cancelled',
      })
    }

    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true })
    }

    const check = () => {
      if (signal?.aborted) {
        onAbort()
        return
      }

      const currentResponses = adapter.readExecutedResponses()
      for (const res of currentResponses) {
        if (res.endpointId.toLowerCase() !== endpointId.toLowerCase()) continue
        const sig = `${res.status}:${res.responseBody ?? ''}`
        if (before.get(endpointId.toLowerCase()) === sig) continue // still previous response

        cleanup()
        const success = res.status >= 200 && res.status < 400
        resolve({
          status: res.status,
          success,
          responseBody: res.responseBody ?? undefined,
          error: !success ? `HTTP ${res.status}: Request returned an error` : undefined,
        })
        return
      }

      if (Date.now() - startTime > timeoutMs) {
        cleanup()
        resolve({
          success: false,
          error: `Execution timed out waiting for response (${timeoutMs / 1000}s)`,
        })
        return
      }

      timerId = setTimeout(check, pollMs)
    }

    timerId = setTimeout(check, pollMs)
  })
}

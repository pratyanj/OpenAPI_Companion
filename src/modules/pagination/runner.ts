import type {
  PaginationConfig,
  PaginationReport,
  PaginationStepResult,
  PaginationStopReason,
  PaginationProgressCallback,
} from './types'
import { extractRecordsFromResponse } from './extractor'
import { analyzePaginationIntegrity } from './integrity'

export interface PaginationRequestParams {
  endpointId: string
  queryParams: Record<string, string>
  headers?: Record<string, string>
  pathParams?: Record<string, string>
  body?: string
  signal?: AbortSignal
}

export interface PaginationRequestResponse {
  status: number
  responseBody?: string
  durationMs?: number
  error?: string
}

export type PaginationRequestExecutor = (
  params: PaginationRequestParams,
) => Promise<PaginationRequestResponse>

export interface PaginationRunnerOptions {
  onProgress?: PaginationProgressCallback
  signal?: AbortSignal
  delayFn?: (ms: number, signal?: AbortSignal) => Promise<void>
}

const defaultDelay = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(new DOMException('Aborted', 'AbortError'))
      },
      { once: true },
    )
  })

export class PaginationRunner {
  private readonly executor: PaginationRequestExecutor
  private readonly delayFn: (ms: number, signal?: AbortSignal) => Promise<void>

  constructor(
    executor: PaginationRequestExecutor,
    delayFn: (ms: number, signal?: AbortSignal) => Promise<void> = defaultDelay,
  ) {
    this.executor = executor
    this.delayFn = delayFn
  }

  async run(
    config: PaginationConfig,
    options?: PaginationRunnerOptions,
  ): Promise<PaginationReport> {
    const startedAt = Date.now()
    const signal = options?.signal
    const delay = options?.delayFn ?? this.delayFn
    const steps: PaginationStepResult[] = []

    let currentPage = config.initialPage ?? 1
    let currentOffset = config.initialOffset ?? 0
    let currentCursor = config.initialCursor ?? ''

    let stoppedReason: PaginationStopReason = 'max_pages_reached'
    const seenCursors = new Set<string>()
    const seenPayloadSignatures = new Set<string>()

    let totalRecordsCollected = 0

    for (let i = 0; i < config.maxPages; i++) {
      if (signal?.aborted) {
        stoppedReason = 'cancelled'
        break
      }

      // Delay between sequential pages
      if (i > 0 && config.delayMs > 0) {
        try {
          await delay(config.delayMs, signal)
        } catch {
          stoppedReason = 'cancelled'
          break
        }
      }

      if (signal?.aborted) {
        stoppedReason = 'cancelled'
        break
      }

      // Prepare query parameters for this iteration
      const queryParams: Record<string, string> = { ...(config.baseQueryParams ?? {}) }

      if (config.strategy === 'page') {
        const pageKey = config.pageParam || 'page'
        queryParams[pageKey] = String(currentPage)
        if (config.pageSizeParam) {
          queryParams[config.pageSizeParam] = String(config.pageSize)
        }
      } else if (config.strategy === 'offset') {
        const offsetKey = config.offsetParam || 'offset'
        queryParams[offsetKey] = String(currentOffset)
        if (config.pageSizeParam) {
          queryParams[config.pageSizeParam] = String(config.pageSize)
        }
      } else if (config.strategy === 'cursor') {
        if (currentCursor) {
          const cursorKey = config.cursorParam || 'cursor'
          queryParams[cursorKey] = currentCursor
        }
        if (config.pageSizeParam) {
          queryParams[config.pageSizeParam] = String(config.pageSize)
        }
      }

      const stepNumber = i + 1
      const callStart = Date.now()
      let res: PaginationRequestResponse

      try {
        res = await this.executor({
          endpointId: config.endpointId,
          queryParams,
          headers: config.baseHeaders,
          pathParams: config.basePathParams,
          body: config.baseBody,
          signal,
        })
      } catch (err: unknown) {
        const durationMs = Date.now() - callStart
        const errorStep: PaginationStepResult = {
          pageNumber: stepNumber,
          queryParams,
          status: 0,
          durationMs,
          recordsCount: 0,
          records: [],
          error: err instanceof Error ? err.message : 'Network request failed',
        }
        steps.push(errorStep)
        stoppedReason = 'error'
        options?.onProgress?.({
          pageNumber: stepNumber,
          maxPages: config.maxPages,
          recordsCollected: totalRecordsCollected,
          step: errorStep,
        })
        break
      }

      const durationMs = res.durationMs ?? Date.now() - callStart
      const { records, nextCursor } = extractRecordsFromResponse(
        res.responseBody,
        config.cursorPath,
      )

      totalRecordsCollected += records.length

      const stepResult: PaginationStepResult = {
        pageNumber: stepNumber,
        queryParams,
        status: res.status,
        durationMs,
        recordsCount: records.length,
        records,
        cursorValue: nextCursor ?? undefined,
        rawResponse: res.responseBody,
        error: res.error,
      }

      steps.push(stepResult)

      options?.onProgress?.({
        pageNumber: stepNumber,
        maxPages: config.maxPages,
        recordsCollected: totalRecordsCollected,
        step: stepResult,
      })

      // 1. Error check
      if (res.status >= 400 || res.error) {
        stoppedReason = 'error'
        break
      }

      // 2. Empty page
      if (records.length === 0) {
        stoppedReason = 'empty_page'
        break
      }

      // 3. Short page for page & offset strategies (less than requested pageSize)
      if (config.strategy !== 'cursor' && records.length < config.pageSize) {
        stoppedReason = 'short_page'
        break
      }

      // 4. Cursor validation for cursor strategy
      if (config.strategy === 'cursor') {
        if (!nextCursor) {
          stoppedReason = 'cursor_null'
          break
        }
        if (seenCursors.has(nextCursor)) {
          stoppedReason = 'cycle_detected'
          break
        }
        seenCursors.add(nextCursor)
      }

      // 5. Payload cycle / repetition guard (in case API returns identical page repeatedly)
      if (records.length > 0) {
        const payloadSig = JSON.stringify(records)
        if (seenPayloadSignatures.has(payloadSig)) {
          stoppedReason = 'cycle_detected'
          break
        }
        seenPayloadSignatures.add(payloadSig)
      }

      // Advance pointers
      currentPage++
      currentOffset += config.pageSize
      currentCursor = nextCursor ?? ''
    }

    const totalDurationMs = Date.now() - startedAt
    const integrity = analyzePaginationIntegrity(steps, config)

    return {
      config,
      totalPages: steps.length,
      totalRecords: integrity.totalRecordsCount,
      uniqueRecords: integrity.uniqueRecordsCount,
      durationMs: totalDurationMs,
      steps,
      anomalies: integrity.anomalies,
      checks: integrity.checks,
      stoppedReason,
    }
  }
}

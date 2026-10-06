export type PaginationStrategy = 'page' | 'offset' | 'cursor' | 'custom'

export interface PaginationConfig {
  endpointId: string
  strategy: PaginationStrategy
  pageParam?: string
  pageSizeParam?: string
  offsetParam?: string
  cursorParam?: string
  cursorPath?: string
  initialPage?: number
  initialOffset?: number
  initialCursor?: string
  pageSize: number
  maxPages: number
  delayMs: number
  baseQueryParams?: Record<string, string>
  baseHeaders?: Record<string, string>
  basePathParams?: Record<string, string>
  baseBody?: string
}

export interface DetectedPagination {
  strategy: PaginationStrategy
  pageParam?: string
  pageSizeParam?: string
  offsetParam?: string
  cursorParam?: string
  cursorPath?: string
  confidence: 'high' | 'medium' | 'low'
  detectedFrom: string
  suggestedPageSize?: number
  suggestedInitialPage?: number
  suggestedInitialOffset?: number
}

export interface PaginationStepResult {
  pageNumber: number
  queryParams: Record<string, string>
  status: number
  durationMs: number
  recordsCount: number
  records: unknown[]
  cursorValue?: string
  rawResponse?: string
  error?: string
}

export type AnomalyType =
  'duplicate' | 'page_size_mismatch' | 'stale_cursor' | 'empty_page' | 'id_gap' | 'http_error'

export type AnomalySeverity = 'error' | 'warning' | 'info'

export interface PaginationAnomaly {
  type: AnomalyType
  severity: AnomalySeverity
  message: string
  pageNumber?: number
  details?: Record<string, unknown>
}

export interface PaginationChecks {
  duplicatesClean: boolean
  pageSizesValid: boolean
  cursorProgressionValid: boolean
  finalPageDetected: boolean
}

export type PaginationStopReason =
  | 'max_pages_reached'
  | 'empty_page'
  | 'short_page'
  | 'cursor_null'
  | 'cycle_detected'
  | 'error'
  | 'cancelled'

export interface PaginationReport {
  config: PaginationConfig
  totalPages: number
  totalRecords: number
  uniqueRecords: number
  durationMs: number
  steps: PaginationStepResult[]
  anomalies: PaginationAnomaly[]
  checks: PaginationChecks
  stoppedReason: PaginationStopReason
}

export type PaginationProgressCallback = (current: {
  pageNumber: number
  maxPages: number
  recordsCollected: number
  step?: PaginationStepResult
}) => void

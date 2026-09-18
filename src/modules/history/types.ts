/** API History domain types (FR-009/010, FDD-004, planning/08 §5). */

export interface HistoryEntry {
  id: string
  endpointId: string
  method: string
  endpoint: string
  status: number
  durationMs?: number
  timestamp: number
  environmentId: string
}

export interface HistoryRecord extends HistoryEntry {
  requestBody?: string
  responseBody?: string
  queryParams?: Record<string, string>
  pathParams?: Record<string, string>
  headers?: Record<string, string>
  requestUrl?: string
}

export interface HistoryQuery {
  text?: string
  method?: string
  from?: number
  to?: number
}

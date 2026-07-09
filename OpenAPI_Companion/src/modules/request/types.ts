/** Request Manager domain types (FR-005/006, FDD-002, planning/08 §5). */

export interface RequestRecord {
  endpointId: string
  method: string
  environmentId: string
  body?: string
  query?: Record<string, string>
  path?: Record<string, string>
  headers?: Record<string, string>
  contentType?: string
  updatedAt: number
}

export interface RequestTemplate extends RequestRecord {
  templateId: string
  name: string
}

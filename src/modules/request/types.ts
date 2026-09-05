import type { Result } from '@/types'
import type { EndpointInfo, RequestSnapshot } from '@/adapters'

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
  description?: string
}

export interface CustomTemplateInput {
  name: string
  endpointId: string
  method: string
  environmentId: string
  body?: string
  query?: Record<string, string>
  path?: Record<string, string>
  headers?: Record<string, string>
  contentType?: string
}

/** Surface RequestsPanel needs from RequestService (eases testing & bridge decoupling). */
export interface RequestPanelService {
  listTemplates(): Promise<Result<RequestTemplate[]>>
  saveOpenAsTemplate(name: string, environmentId: string): Promise<Result<RequestTemplate | null>>
  createCustomTemplate(input: CustomTemplateInput): Promise<Result<RequestTemplate>>
  updateTemplate(
    id: string,
    updates: Partial<
      Pick<
        RequestTemplate,
        'name' | 'body' | 'query' | 'headers' | 'path' | 'endpointId' | 'method' | 'description'
      >
    >,
  ): Promise<Result<RequestTemplate>>
  deleteTemplate(templateId: string): Promise<Result<void>>
  applyTemplate(templateId: string, environmentId?: string): Promise<Result<void>>
  locateAndFill(templateId: string, environmentId?: string): Promise<Result<void>>
  listEndpoints(): EndpointInfo[]
  getOpenRequests(): RequestSnapshot[]
  getSwaggerDefaults?(endpointId: string): {
    exampleBody?: string
    path?: Record<string, string>
    query?: Record<string, string>
  }
}

export const METHODS = ['ALL', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const
export type MethodFilter = (typeof METHODS)[number]

export interface PresetEditorOpenOptions {
  template?: RequestTemplate | null
  initialEndpointId?: string
  initialBody?: string
  initialName?: string
  initialPath?: Record<string, string>
  initialQuery?: Record<string, string>
}

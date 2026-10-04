export type ChangeSeverity = 'breaking' | 'warning' | 'info'

export type ChangeType =
  | 'endpoint_added'
  | 'endpoint_removed'
  | 'path_param_changed'
  | 'param_added'
  | 'param_removed'
  | 'param_required_changed'
  | 'param_type_changed'
  | 'request_body_required_changed'
  | 'request_body_property_added'
  | 'request_body_property_removed'
  | 'request_body_type_changed'
  | 'response_status_removed'
  | 'response_property_removed'
  | 'response_type_changed'
  | 'enum_changed'

export interface NormalizedParam {
  name: string
  in: 'query' | 'path' | 'header' | 'cookie'
  required: boolean
  type?: string
  format?: string
  enum?: string[]
}

export interface NormalizedSchemaProperty {
  name: string
  type?: string
  format?: string
  required?: boolean
  enum?: string[]
}

export interface NormalizedRequestBody {
  required: boolean
  contentType: string
  properties: Record<string, NormalizedSchemaProperty>
  requiredFields: string[]
}

export interface NormalizedResponse {
  statusCode: string
  description?: string
  properties?: Record<string, NormalizedSchemaProperty>
}

export interface NormalizedOperation {
  endpointId: string // e.g. "get /users/{id}"
  method: string
  path: string
  summary?: string
  tags?: string[]
  params: Record<string, NormalizedParam> // keyed by `${in}:${name}`
  requestBody?: NormalizedRequestBody
  responses: Record<string, NormalizedResponse>
}

export interface NormalizedSpec {
  title?: string
  version?: string
  hash: string
  operations: Record<string, NormalizedOperation> // keyed by endpointId
  timestamp: number
}

export interface SpecSnapshot {
  projectId: string
  specUrl?: string
  hash: string
  normalized: NormalizedSpec
  updatedAt: number
  acceptedAt?: number
}

export interface SpecChangeItem {
  id: string
  type: ChangeType
  severity: ChangeSeverity
  endpointId: string
  method: string
  path: string
  title: string
  description: string
  before?: unknown
  after?: unknown
}

export type ImpactedResourceType = 'workflow' | 'preset' | 'favorite'

export interface ImpactedResource {
  id: string
  type: ImpactedResourceType
  name: string
  endpointId: string
  stepName?: string
  stepIndex?: number
  reason: string
  severity: ChangeSeverity
}

export interface SpecDiffResult {
  hasChanges: boolean
  hasBreakingChanges: boolean
  totalChanges: number
  breakingCount: number
  warningCount: number
  infoCount: number
  changes: SpecChangeItem[]
  impactedResources: ImpactedResource[]
  oldHash?: string
  newHash: string
}

/**
 * Assertion Engine domain types (Phase 1 Testing Foundation).
 */

export type AssertionType =
  'status' | 'header' | 'jsonPath' | 'type' | 'length' | 'contains' | 'responseTime'

export type AssertionOperator =
  | 'equals'
  | 'notEquals'
  | 'is2xx'
  | 'is3xx'
  | 'is4xx'
  | 'is5xx'
  | 'isNot5xx'
  | 'contains'
  | 'notContains'
  | 'exists'
  | 'notExists'
  | 'greaterThan'
  | 'lessThan'
  | 'greaterThanOrEqual'
  | 'lessThanOrEqual'
  | 'matchesRegex'

export interface Assertion {
  id: string
  type: AssertionType
  /** Optional target (header name, or JSONPath expression such as `$.data.id`) */
  target?: string
  operator: AssertionOperator
  expected?: unknown
}

export interface AssertionResult {
  assertionId: string
  type: AssertionType
  target?: string
  operator: AssertionOperator
  expected?: unknown
  actual?: unknown
  passed: boolean
  message?: string
}

export interface AssertionTargetResponse {
  status?: number
  headers?: Record<string, string>
  body?: string
  durationMs?: number
}

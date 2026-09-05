/**
 * Extraction Rules Domain Types (Phase C)
 * Defines automated response-to-variable extraction rules per project.
 */

export interface ExtractionRule {
  /** Unique rule ID (e.g. `rule_1717000000000_1`). */
  id: string
  /** Endpoint identifier (e.g. `post /auth/login`). */
  endpointId: string
  /** Source location in the response. Default: 'body' */
  source?: 'body' | 'header'
  /** JSON dot-path (e.g. `token`, `access_token`, `data.user.id`) or header name. */
  property: string
  /** Target variable name in .env (e.g. `TOKEN`, `USER_ID`). */
  targetVariable: string
  /** Whether the extracted variable should be masked as a secret in .env. */
  isSecret: boolean
  /** Whether this rule is currently active. */
  enabled: boolean
  /** Creation timestamp. */
  createdAt: number
}

export type ExtractionRuleInput = Omit<ExtractionRule, 'id' | 'createdAt'>

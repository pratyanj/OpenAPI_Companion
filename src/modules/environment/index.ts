// Environment Manager (FR-007/008, FDD-003). Multi-environment CRUD + switching.
export { EnvironmentService, substitute, BUILTIN_ENVIRONMENTS } from './env-service'
export type { EnvironmentServiceOptions, EnvironmentInput } from './env-service'
export {
  parseDotEnv,
  serializeDotEnv,
  parsePostmanEnv,
  exportPostmanEnv,
} from './env-parser'
export type { ParsedEnvResult, PostmanEnvFormat, PostmanEnvValue } from './env-parser'
export { EnvironmentsPanel } from './EnvironmentsPanel'
export type { EnvironmentPanelService } from './EnvironmentsPanel'
export { SaveToVariableDialog } from './SaveToVariableDialog'
export type { SaveToVariableDialogProps } from './SaveToVariableDialog'
export { extractJsonCandidates, extractValueByPath } from './json-candidates'
export type { JsonCandidate } from './json-candidates'
export type { ExtractionRule, ExtractionRuleInput } from './extraction-rules-types'

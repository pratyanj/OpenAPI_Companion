/** Fake Data Generator domain types (FDD-005, EPIC-07). */
import type { GeneratorKey, FakeValue } from './generators'

export type { GeneratorKey, FakeValue }

/** One top-level field of the open request, as shown in the panel. */
export interface FieldInfo {
  key: string
  /** Current value rendered for display (primitives stringified by the UI). */
  value: unknown
  /** Detected generator, or null when the field is unsupported (left as-is). */
  generator: GeneratorKey | null
}

export interface FakeDataPreview {
  endpointId: string
  method: string
  fields: FieldInfo[]
}

export interface GenerateResult {
  endpointId: string
  /** How many fields were actually filled. */
  fieldCount: number
}

export interface GenerateOptions {
  /** Replace existing (non-placeholder) values too. Default false — preserve edits. */
  overwrite?: boolean
}

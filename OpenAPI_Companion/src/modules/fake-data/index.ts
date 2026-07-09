// Fake Data Generator (FDD-005, EPIC-07). Realistic offline test data into requests.
export { FakeDataService } from './fake-data-service'
export type { FakeDataServiceOptions } from './fake-data-service'
export { FakeDataPanel } from './FakeDataPanel'
export type { FakeDataPanelService } from './FakeDataPanel'
export { GENERATORS, GENERATOR_KEYS, generate, isGeneratorKey } from './generators'
export type { GeneratorKey, FakeValue, Rng } from './generators'
export { detectGenerator } from './detect'
export type { FakeDataPreview, FieldInfo, GenerateOptions, GenerateResult } from './types'

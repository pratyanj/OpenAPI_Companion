// StorageService + MigrationService — namespaced, envelope-wrapped, batched,
// write-locked persistence (planning/08, 11). Implemented in Sprint 2 (EPIC-01).
export { StorageService } from './storage-service'
export { MigrationService } from './migration-service'
export { chromeLocalArea } from './chrome-area'
export { wrap, isEnvelope } from './envelope'
export {
  metaKey,
  settingsKey,
  backupKey,
  projectKey,
  projectPrefix,
  SCHEMA_VERSION_KEY,
} from './keys'
export type {
  AsyncStorageArea,
  StorageServiceOptions,
  Migration,
  MigrationServiceOptions,
  RawStore,
} from './types'

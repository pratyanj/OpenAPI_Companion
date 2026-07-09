import type { EventBus } from '@/core/events'

/**
 * The subset of a `chrome.storage.StorageArea` the storage layer needs, as an
 * async (promise) interface. `chromeLocalArea()` adapts `chrome.storage.local`;
 * tests inject an in-memory fake. Keeping this an interface is what makes
 * StorageService/MigrationService unit-testable without a browser.
 */
export interface AsyncStorageArea {
  get(keys?: string | string[] | null): Promise<Record<string, unknown>>
  set(items: Record<string, unknown>): Promise<void>
  remove(keys: string | string[]): Promise<void>
  clear(): Promise<void>
  getBytesInUse(keys?: string | string[] | null): Promise<number>
}

export interface StorageServiceOptions {
  area: AsyncStorageArea
  bus?: EventBus
  appVersion?: string
  /** Injectable clock for deterministic timestamps in tests. */
  now?: () => number
  debounceMs?: number
  quotaWarnBytes?: number
}

/** Raw (un-enveloped) store handed to migrations so they can reshape data. */
export interface RawStore {
  getAll(): Promise<Record<string, unknown>>
  get(key: string): Promise<unknown>
  set(items: Record<string, unknown>): Promise<void>
  remove(keys: string[]): Promise<void>
}

/** One step in the migration pipeline (planning/08 §7). */
export interface Migration {
  from: number
  to: number
  migrate: (store: RawStore) => Promise<void>
}

export interface MigrationServiceOptions {
  area: AsyncStorageArea
  bus?: EventBus
  /** Schema version this build targets. Defaults to SCHEMA_VERSION. */
  targetVersion?: number
}

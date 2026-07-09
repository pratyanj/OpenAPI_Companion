/**
 * Global constants. UPPER_SNAKE_CASE per planning/16_CODING_STANDARD.md.
 */
import pkg from '../../package.json'

export const APP_NAME = 'OpenAPI Companion'

/** Single source of truth for the app version (also injected into the manifest). */
export const APP_VERSION: string = pkg.version

/** Fixed permission set (DD-035). Tests assert the manifest matches this. */
export const PERMISSIONS = [
  'storage',
  'activeTab',
  'scripting',
  'unlimitedStorage',
  'downloads',
] as const

/** Current storage schema version (bumped via MigrationService, planning/08 §7). */
export const SCHEMA_VERSION = 1

/**
 * History retention default (DD-031). A PERFORMANCE cap, not a quota wall —
 * `unlimitedStorage` (DD-035) removes the quota ceiling. User-configurable
 * (100–10000, or "No limit") in Settings.
 */
export const MAX_HISTORY_ITEMS = 1000

/** Top-level storage roots (planning/08 §2). */
export const STORAGE_ROOTS = {
  meta: 'meta',
  settings: 'settings',
  projects: 'projects',
  cache: 'cache',
  backups: 'backups',
} as const

/** Storage write debounce (ms) — coalesces rapid writes (planning/08 §10). */
export const DEFAULT_DEBOUNCE_MS = 150

/**
 * Largest request/response body persisted (EC-015). Oversized request bodies
 * are skipped by autosave; oversized history bodies are truncated with a
 * marker. Keeps a single giant payload from bloating storage or the UI.
 */
export const MAX_SAVED_BODY_BYTES = 256 * 1024

/**
 * Soft quota-warning threshold (bytes). With `unlimitedStorage` (DD-035) the
 * real ceiling is disk, so this is a safety net that surfaces
 * STORAGE_QUOTA_WARNING if usage grows unexpectedly large. Default ~8 MB.
 */
export const QUOTA_WARN_BYTES = 8 * 1024 * 1024

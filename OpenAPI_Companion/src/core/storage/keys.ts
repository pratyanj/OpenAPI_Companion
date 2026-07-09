import { STORAGE_ROOTS } from '@/constants'

/**
 * Storage key builders. Keys are flat strings in a hierarchical convention
 * (planning/08 §3): `projects/<projectId>/<module>/<itemId>`, plus the
 * `meta/`, `settings/`, `backups/` roots.
 */

export const metaKey = (name: string): string => `${STORAGE_ROOTS.meta}/${name}`

export const settingsKey = (name: string): string => `${STORAGE_ROOTS.settings}/${name}`

export const backupKey = (id: string): string => `${STORAGE_ROOTS.backups}/${id}`

/** Prefix for all keys belonging to a project (use with `list()`). */
export const projectPrefix = (projectId: string): string =>
  `${STORAGE_ROOTS.projects}/${projectId}/`

export const projectKey = (projectId: string, moduleName: string, itemId?: string): string =>
  itemId
    ? `${STORAGE_ROOTS.projects}/${projectId}/${moduleName}/${itemId}`
    : `${STORAGE_ROOTS.projects}/${projectId}/${moduleName}`

/** Well-known meta marker: the persisted storage schema version. */
export const SCHEMA_VERSION_KEY = metaKey('schema-version')

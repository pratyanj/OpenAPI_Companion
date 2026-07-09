/** Settings & Import/Export domain types (FDD-010, EPIC-09). */

/** User preferences owned by SettingsService (theme is owned by ThemeManager). */
export interface Preferences {
  /** Auto-write a backup to Downloads after data changes. */
  autoBackup: boolean
  /** History retention cap (mirrors MAX_HISTORY_ITEMS default). */
  historyLimit: number
}

export const DEFAULT_PREFERENCES: Preferences = {
  autoBackup: false,
  historyLimit: 1000,
}

/** Per-project storage usage, plus the grand total. */
export interface StorageMetrics {
  totalBytes: number
  projects: { projectId: string; bytes: number }[]
}

/** The on-disk shape of an exported backup file. */
export interface ExportBundle {
  app: string
  appVersion: string
  schemaVersion: number
  exportedAt: number
  /** key → unwrapped payload for every exported entry. */
  entries: Record<string, unknown>
}

/** How to resolve keys that already exist when importing. */
export type ImportMode = 'replace' | 'skip'

/** A non-destructive summary of what an import would do. */
export interface ImportPreview {
  appVersion: string
  schemaVersion: number
  exportedAt: number
  total: number
  /** Entry counts grouped by top-level root (settings/projects/…). */
  byRoot: Record<string, number>
  projectCount: number
  /** True if the bundle carries authentication credentials. */
  containsSecrets: boolean
}

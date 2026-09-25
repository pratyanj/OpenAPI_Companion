/** Settings & Import/Export domain types (FDD-010, EPIC-09). */

/** User preferences for in-page Swagger UI feature toggles. */
export interface SwaggerFeaturePreferences {
  /** 1-Click "Fill Realistic Mock Data" toolbar above body textarea */
  mockData: boolean
  /** 1-Click JSON Formatter & Syntax Validator on request body */
  jsonFormat: boolean
  /** "Re-fill Last Sent Payload" quick history button */
  endpointHistory: boolean
  /** "Save Response Property to Variable" in rendered responses */
  responseVariables: boolean
  /** Active Account & Token Expiry Status Badge below Swagger Authorize */
  authBadge: boolean
  /** Direct {{variable}} autocomplete and resolution inside Swagger inputs */
  variableResolution: boolean
  /** 1-Click Multi-Account & Role Switcher dropdown in Swagger header */
  accountSwitcher: boolean
  /** Real-time keyword filter and expandable/collapsible JSON tree in responses */
  responseJsonSearch: boolean
  /** Multi-language "Copy Code" dropdown (cURL, PowerShell, Fetch, Axios, Python) */
  copyCodeSnippet: boolean
  /** 1-Click export response as .json or RFC 4180 .csv file */
  responseExport: boolean
  /** 1-Click star favorite buttons and top Pinned Operations quick tray */
  pinnedEndpoints: boolean
  /** Paste raw cURL commands to auto-fill operation fields in Swagger UI. Default: true */
  pasteCurl: boolean
  /** Global custom HTTP debug headers injected into all outgoing requests. Default: true */
  globalHeaders: boolean
}

export const DEFAULT_SWAGGER_FEATURES: SwaggerFeaturePreferences = {
  mockData: true,
  jsonFormat: true,
  endpointHistory: true,
  responseVariables: true,
  authBadge: true,
  variableResolution: true,
  accountSwitcher: true,
  responseJsonSearch: true,
  copyCodeSnippet: true,
  responseExport: true,
  pinnedEndpoints: true,
  pasteCurl: true,
  globalHeaders: true,
}

/** User preferences owned by SettingsService (theme is owned by ThemeManager). */
/** Frequency interval for automated backups. */
export type BackupFrequency = 'off' | '30m' | '2h' | '6h' | '12h' | '24h' | 'custom'

/** Scope for backup export: full workspace or current active project. */
export type BackupScope = 'all' | 'current'

import type { ShortcutActionId, ShortcutBinding } from '@/modules/shortcuts/types'
import { DEFAULT_SHORTCUTS } from '@/modules/shortcuts/types'

/** User preferences owned by SettingsService (theme is owned by ThemeManager). */
export interface Preferences {
  /** Auto-write a backup to Downloads on a schedule. */
  autoBackup: boolean
  /** Frequency interval for automated backup. Default: '24h'. */
  autoBackupFrequency: BackupFrequency
  /** Custom interval in minutes (if frequency is 'custom'). Default: 60. */
  autoBackupCustomMinutes?: number
  /** Skip backup if data has not changed since last backup. Default: true. */
  autoBackupSkipUnchanged: boolean
  /** Scope of automated backup: 'all' (all projects + settings) or 'current' (current project). Default: 'all'. */
  autoBackupScope: BackupScope
  /** Timestamp of last automated or manual backup taken. */
  lastBackupAt?: number
  /** Last backup status message (e.g. 'Saved openapi-companion-backup-2026-09-20-1615.json' or 'Skipped: No changes'). */
  lastBackupStatus?: string
  /** Custom subfolder inside the user's Downloads directory. Default: 'OpenAPI-Companion-Backups'. */
  backupFolder?: string
  /** History retention cap (mirrors MAX_HISTORY_ITEMS default). */
  historyLimit: number
  /** In-page Swagger UI feature toggles (all enabled by default). */
  swaggerFeatures: SwaggerFeaturePreferences
  /** Customizable keyboard shortcuts map. */
  shortcuts?: Partial<Record<ShortcutActionId, ShortcutBinding>>
}

export const DEFAULT_BACKUP_FOLDER = 'OpenAPI-Companion-Backups'

export const DEFAULT_PREFERENCES: Preferences = {
  autoBackup: false,
  autoBackupFrequency: '24h',
  autoBackupCustomMinutes: 60,
  autoBackupSkipUnchanged: true,
  autoBackupScope: 'all',
  backupFolder: DEFAULT_BACKUP_FOLDER,
  historyLimit: 1000,
  swaggerFeatures: DEFAULT_SWAGGER_FEATURES,
  shortcuts: DEFAULT_SHORTCUTS,
}

/** Per-project storage usage, plus the grand total. */
export interface ProjectStorageMetric {
  projectId: string
  name?: string
  originUrl?: string
  openApiUrl?: string
  bytes: number
}

/** Per-project storage usage, plus the grand total. */
export interface StorageMetrics {
  totalBytes: number
  projects: ProjectStorageMetric[]
}

/** The on-disk shape of an exported backup file. */
export interface ExportBundle {
  app: string
  appVersion: string
  schemaVersion: number
  exportedAt: number
  /** key -> unwrapped payload for every exported entry. */
  entries: Record<string, unknown>
}

/** How to resolve keys/entities that already exist when importing. */
export type ImportMode = 'replace' | 'skip' | 'merge'

/** Selectable category for granular import. */
export type ImportCategory =
  'presets' | 'environments' | 'workflows' | 'headers' | 'rules' | 'auth' | 'settings' | 'history'

/** Item category count breakdown in import preview. */
export interface ImportPreviewCategoryItem {
  id: ImportCategory
  label: string
  count: number
  defaultSelected: boolean
}

/** A non-destructive summary of what an import would do. */
export interface ImportPreview {
  appVersion: string
  schemaVersion: number
  exportedAt: number
  total: number
  /** Entry counts grouped by top-level root (settings/projects/...). */
  byRoot: Record<string, number>
  projectCount: number
  /** True if the bundle carries authentication credentials. */
  containsSecrets: boolean
  /** True if this preview was decrypted from a passphrase-protected backup. */
  isEncrypted?: boolean
  /** Granular category breakdown for selective import. */
  categories?: ImportPreviewCategoryItem[]
}

/** Snapshot captured immediately before applying an import, enabling 1-click rollback. */
export interface PreImportSnapshot {
  timestamp: number
  mode: ImportMode
  entries: Record<string, unknown>
}

export type { EncryptedCryptoMetadata, EncryptedExportBundle } from '@/utils/crypto-backup'

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
}

/** User preferences owned by SettingsService (theme is owned by ThemeManager). */
export interface Preferences {
  /** Auto-write a backup to Downloads after data changes. */
  autoBackup: boolean
  /** History retention cap (mirrors MAX_HISTORY_ITEMS default). */
  historyLimit: number
  /** In-page Swagger UI feature toggles (all enabled by default). */
  swaggerFeatures: SwaggerFeaturePreferences
}

export const DEFAULT_PREFERENCES: Preferences = {
  autoBackup: false,
  historyLimit: 1000,
  swaggerFeatures: DEFAULT_SWAGGER_FEATURES,
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

/** How to resolve keys that already exist when importing. */
export type ImportMode = 'replace' | 'skip'

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
}

export type { EncryptedCryptoMetadata, EncryptedExportBundle } from '@/utils/crypto-backup'

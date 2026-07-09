/**
 * Event catalog — the typed contract the EventBus enforces
 * (planning/12_EVENT_SYSTEM.md). Modules communicate ONLY through these events;
 * they never import each other. The map grows as feature modules land — adding
 * an event is just a new entry here.
 *
 * Naming: DOMAIN_PASTTENSE. Adapter-origin browser events use a `swagger:` prefix.
 */

/** Minimal import summary shape (unified with ImportExportService in Sprint 13). */
export interface ImportSummary {
  imported: number
  skipped: number
  renamed: number
}

export interface EventPayload {
  // Project
  PROJECT_DETECTED: { projectId: string; docType: string }
  PROJECT_CHANGED: { projectId: string }

  // Authentication
  AUTH_UPDATED: { projectId: string; environmentId: string; type: string }
  AUTH_RESTORED: { projectId: string; environmentId: string }
  AUTH_CLEARED: { projectId: string; environmentId: string }
  AUTH_EXPIRED: { projectId: string; environmentId: string }

  // Request
  REQUEST_CHANGED: { endpointId: string; environmentId: string }
  REQUEST_RESTORED: { endpointId: string; environmentId: string }
  TEMPLATE_SAVED: { templateId: string; endpointId: string }
  TEMPLATE_DELETED: { templateId: string }

  // Environment
  ENVIRONMENT_CHANGED: { projectId: string; environmentId: string }
  ENVIRONMENT_CREATED: { environmentId: string }
  ENVIRONMENT_DELETED: { environmentId: string }

  // History
  HISTORY_RECORDED: { recordId: string; endpointId: string; status: number }
  REQUEST_REPLAYED: { sourceId: string; newRecordId: string }
  HISTORY_CLEARED: { projectId: string }

  // Fake data / productivity
  FAKE_DATA_GENERATED: { endpointId: string; fieldCount: number }
  FAVORITE_TOGGLED: { endpointId: string; favorite: boolean }
  RECENT_UPDATED: { endpointId: string }

  // Settings / storage / data
  SETTINGS_UPDATED: { keys: string[] }
  THEME_CHANGED: { theme: 'light' | 'dark' | 'system' }
  STORAGE_MIGRATED: { from: number; to: number }
  STORAGE_QUOTA_WARNING: { bytesInUse: number; quota: number }
  DATA_IMPORTED: { summary: ImportSummary }
  DATA_EXPORTED: { modules: string[] }
  DATA_BACKED_UP: { modules: string[]; auto: boolean; filename: string }
  DATA_RESET: Record<string, never>

  // Generic toast request
  NOTIFY: { kind: 'success' | 'warning' | 'error'; message: string }
}

export type EventName = keyof EventPayload

export type EventHandler<E extends EventName> = (payload: EventPayload[E]) => void

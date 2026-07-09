# 11 — Service Plan (Internal API Design)

> Internal service interfaces for v1.0. Each service lists **Responsibilities, Methods (signature), Inputs, Outputs, Errors, Events published/consumed.** Services hold all business logic (architecture rule); UI/stores call services; only `StorageService` touches `chrome.storage`; only `SwaggerAdapter` touches the Swagger DOM.
>
> Signatures are TypeScript. All async methods return `Promise<Result<T>>` where `Result<T> = { ok: true; value: T } | { ok: false; error: AppError }` (no thrown errors crossing service boundaries; recovery per `07` §12).

```ts
type Result<T> = { ok: true; value: T } | { ok: false; error: AppError };
interface AppError { code: string; message: string; recoverable: boolean; cause?: unknown; }
```

---

## Core Services

### StorageService
**Responsibilities:** namespaced, envelope-wrapped, batched persistence; quota monitoring; single-writer lock.

| Method | Input | Output | Errors |
|---|---|---|---|
| `get<T>(key)` | `string` | `Result<StorageEnvelope<T> \| null>` | `STORAGE_READ` |
| `set<T>(key, data)` | `string, T` | `Result<void>` | `STORAGE_WRITE`, `QUOTA_EXCEEDED` |
| `remove(key)` | `string` | `Result<void>` | `STORAGE_WRITE` |
| `list(prefix)` | `string` | `Result<string[]>` | `STORAGE_READ` |
| `getBytesInUse(prefix?)` | `string?` | `Result<number>` | `STORAGE_READ` |
| `withLock(projectId, fn)` | `string, ()=>Promise<T>` | `Result<T>` | `LOCK_TIMEOUT` |

**Publishes:** `STORAGE_QUOTA_WARNING`, `STORAGE_MIGRATED` (via MigrationService).

### MigrationService
**Responsibilities:** detect schema version, run ordered migrations, snapshot + rollback.

| Method | Input | Output | Errors |
|---|---|---|---|
| `register(migration)` | `{from,to,migrate}` | `void` | — |
| `migrateIfNeeded()` | — | `Result<{from,to}>` | `MIGRATION_FAILED` (triggers rollback) |
| `snapshot()` / `rollback(id)` | — / `string` | `Result<string>` / `Result<void>` | `BACKUP_FAILED` |

**Publishes:** `STORAGE_MIGRATED`.

### EventBus
**Responsibilities:** typed pub/sub for inter-module communication.

```ts
publish<E extends EventName>(event: E, payload: EventPayload[E]): void;
subscribe<E extends EventName>(event: E, handler: (p: EventPayload[E]) => void): Unsubscribe;
```
Errors: handler exceptions are caught and logged (never break the bus). Catalog: `12_EVENT_SYSTEM.md`.

### ProjectService
**Responsibilities:** detect project, derive stable ID, create/load workspace + default environment.

| Method | Input | Output | Errors |
|---|---|---|---|
| `identify()` | — | `Result<ProjectMeta>` | `NOT_OPENAPI` (EC-005) |
| `load(id)` | `string` | `Result<ProjectMeta>` | `STORAGE_READ` |
| `ensureDefaultEnvironment(id)` | `string` | `Result<Environment>` | `STORAGE_WRITE` |
| `reconcileUrlChange(meta)` | `ProjectMeta` | `Result<ProjectMeta>` | — (EC-007) |

**Publishes:** `PROJECT_DETECTED`, `PROJECT_CHANGED`.

### SwaggerAdapter (interface)
**Responsibilities:** the **only** Swagger-DOM boundary (isolates R-01). Versioned implementations.

```ts
interface SwaggerAdapter {
  detect(): boolean;                                   // EC-005
  version(): string | null;
  readAuth(): AuthSnapshot | null;
  writeAuth(auth: AuthRecord): Result<void>;           // restore; < 100 ms
  readRequest(endpointId: string): RequestSnapshot | null;
  writeRequest(endpointId: string, data: RequestRecord): Result<void>; // never executes
  observe(cb: (e: SwaggerChange) => void): Unsubscribe; // auth/request/execute changes
}
```
Errors: `ADAPTER_UNSUPPORTED_VERSION`, `ADAPTER_DOM_MISSING` (degrade gracefully, EC-008/Swagger DOM change).

### SettingsService
**Responsibilities:** global settings get/set, apply-immediately, defaults, storage metrics, clearing.

| Method | Input | Output | Errors |
|---|---|---|---|
| `get()` / `update(patch)` | — / `Partial<Settings>` | `Result<Settings>` | `STORAGE_*` |
| `storageMetrics()` | — | `Result<{total:number; perProject:Record<string,number>}>` | `STORAGE_READ` |
| `clearProject(id)` / `clearAll()` | `string` / — | `Result<void>` | `STORAGE_WRITE` |
| `reset()` | — | `Result<void>` | `STORAGE_WRITE` |

**Publishes:** `SETTINGS_UPDATED`, `THEME_CHANGED`, `DATA_RESET`.

### ImportExportService
**Responsibilities:** JSON export of selected modules; validated import with preview & duplicate handling.

| Method | Input | Output | Errors |
|---|---|---|---|
| `export(modules)` | `ModuleKey[]` | `Result<Blob>` | `EXPORT_FAILED` |
| `backupToDownloads(modules, opts?)` | `ModuleKey[], {auto?:boolean}` | `Result<{filename:string}>` | `DOWNLOAD_FAILED` |
| `validate(file)` | `File` | `Result<ImportPreview>` | `IMPORT_INVALID` (EC-032), `SCHEMA_TOO_NEW` (EC-034) |
| `import(file, strategy)` | `File, 'replace'\|'merge'\|'rename'\|'cancel'` | `Result<ImportSummary>` | `IMPORT_FAILED` |

**Publishes:** `DATA_EXPORTED`, `DATA_BACKED_UP`, `DATA_IMPORTED`. `backupToDownloads` writes JSON to the user's Downloads folder via `chrome.downloads` (manual or auto-snapshot — DD-039); restore is always an explicit user import (extensions cannot auto-read files). Security: sanitizes, never executes content (EC-045/047); secrets warning applies to backups (DD-037).

---

## Feature Services

### AuthenticationService
**Responsibilities:** persist & restore auth per project+environment (FDD-001).

| Method | Input | Output | Errors |
|---|---|---|---|
| `save(auth)` | `AuthRecord` | `Result<void>` | `AUTH_SAVE` |
| `restore(envId)` | `string` | `Result<AuthRecord\|null>` | `AUTH_INVALID` (EC-009), `AUTH_EXPIRED` (EC-008) |
| `validate(auth)` | `AuthRecord` | `Result<boolean>` | — |
| `clear(envId)` | `string` | `Result<void>` | `AUTH_CLEAR` |
| `onSwaggerAuthChange(snapshot)` | `AuthSnapshot` | `Result<void>` | — |

**Publishes:** `AUTH_UPDATED`, `AUTH_RESTORED`, `AUTH_CLEARED`, `AUTH_EXPIRED`. **Consumes:** `ENVIRONMENT_CHANGED`, `PROJECT_DETECTED`.

### RequestService
**Responsibilities:** auto-save/restore request data; templates (FDD-002).

| Method | Input | Output | Errors |
|---|---|---|---|
| `autosave(endpointId, data)` | `string, RequestRecord` | `Result<void>` | `REQ_SAVE` |
| `restore(endpointId, envId)` | `string, string` | `Result<RequestRecord\|null>` | `REQ_SCHEMA_CHANGED` (partial, EC-012) |
| `saveTemplate(name, data)` | `string, RequestRecord` | `Result<RequestTemplate>` | `TEMPLATE_SAVE` |
| `duplicateTemplate(id)` / `renameTemplate(id,name)` / `deleteTemplate(id)` | ids | `Result<...>` | `TEMPLATE_*` |
| `listTemplates(endpointId)` | `string` | `Result<RequestTemplate[]>` | `STORAGE_READ` |

**Publishes:** `REQUEST_CHANGED`, `REQUEST_RESTORED`, `TEMPLATE_SAVED`, `TEMPLATE_DELETED`. **Consumes:** `ENVIRONMENT_CHANGED`. **Rule:** restore never triggers execution.

### EnvironmentService
**Responsibilities:** environment CRUD, switching, variable resolution (FDD-003).

| Method | Input | Output | Errors |
|---|---|---|---|
| `create(env)` / `update(id,patch)` / `delete(id)` / `duplicate(id)` | env data | `Result<Environment>` | `ENV_DUPLICATE_NAME` (EC-018) |
| `switch(id)` | `string` | `Result<Environment>` | `ENV_INVALID` |
| `resolve(text, envId)` | `string, string` | `Result<{text:string; missing:string[]}>` | — (EC-017) |
| `getActive()` / `listBuiltins()` | — | `Result<Environment>` / `Environment[]` | — |

**Publishes:** `ENVIRONMENT_CHANGED`, `ENVIRONMENT_CREATED`, `ENVIRONMENT_DELETED`. **Switch** orchestrates auth + request re-load (< 200 ms, no page refresh).

### HistoryService
**Responsibilities:** record executions, replay, search/filter (FDD-004).

| Method | Input | Output | Errors |
|---|---|---|---|
| `record(entry)` | `HistoryRecord` | `Result<void>` | `HISTORY_WRITE`, `QUOTA_EXCEEDED` |
| `replay(id)` | `string` | `Result<RequestRecord>` | `ENDPOINT_GONE` (EC-013) |
| `search(query)` | `{text?;method?;from?;to?}` | `Result<HistoryIndexEntry[]>` | — (< 100 ms) |
| `get(id)` | `string` | `Result<HistoryRecord>` | `STORAGE_READ` |
| `deleteEntry(id)` / `clearProject()` | `string` / — | `Result<void>` | `HISTORY_WRITE` |

**Publishes:** `HISTORY_RECORDED`, `REQUEST_REPLAYED`, `HISTORY_CLEARED`. **Consumes:** `swagger:execute` (via adapter). Replay logs a new record; never mutates templates.

### FakeDataService
**Responsibilities:** generate realistic field values offline (FDD-005).

| Method | Input | Output | Errors |
|---|---|---|---|
| `generateField(fieldSpec)` | `{name;type;format?}` | `Result<string\|number\|boolean>` | `UNSUPPORTED_FIELD` (EC-029, fallback) |
| `generateAll(schema, current)` | `Schema, Record<string,unknown>` | `Result<Record<string,unknown>>` | — (preserves manual edits) |
| `detectType(fieldSpec)` | `FieldSpec` | `Result<GeneratorType>` | — (generic fallback EC-030) |

**Publishes:** `FAKE_DATA_GENERATED`. Perf: field < 20 ms, all < 150 ms.

### ProductivityService
**Responsibilities:** endpoint search, favorites, recents, code generation (FDD-009).

| Method | Input | Output | Errors |
|---|---|---|---|
| `buildIndex(spec)` | `OpenAPISpec` | `Result<void>` | — (supports 5,000+) |
| `search(query)` | `string` | `Result<SearchResult[]>` | — (< 50 ms) |
| `toggleFavorite(endpointId)` | `string` | `Result<boolean>` | `STORAGE_WRITE` |
| `recordRecent(endpointId)` | `string` | `Result<void>` | `STORAGE_WRITE` |
| `generateCode(req, target)` | `RequestRecord, 'curl'\|'fetch'\|'axios'` | `Result<string>` | `CODEGEN` (< 30 ms) |

**Publishes:** `FAVORITE_TOGGLED`, `RECENT_UPDATED`. **Consumes:** `HISTORY_RECORDED` (recents).

### NotificationService (shared)
**Responsibilities:** translate `NOTIFY` events to toasts.

| Method | Input | Output |
|---|---|---|
| `notify(kind, message, action?)` | `'success'\|'warning'\|'error', string, Action?` | `void` |

---

## Service ↔ Store ↔ UI contract
- **Service**: pure business logic + storage + adapter + event publishing. Unit-testable in isolation (mock Storage/Adapter).
- **Store (Zustand)**: holds derived/cached state; calls services; subscribes to relevant events to stay fresh. Minimal global state (DD-009).
- **UI (React)**: reads store via hooks; dispatches user intent to services through hooks; no direct storage/adapter access.

## v1.1+ services (designed, not built in v1.0)
`CollectionService` (v1.1), `WorkflowService` (v1.2), `ResponseInspectorService` (v1.3) — FDDs exist; interfaces follow the same pattern and slot in without changing v1.0 services (architecture scalability rule).

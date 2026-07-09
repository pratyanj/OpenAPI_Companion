# 07 — Architecture Plan

> Concrete architecture for v1.0, expanding `docs/11_TECHNICAL_ARCHITECTURE.md` into implementation-ready diagrams and the full repository layout. All diagrams are Mermaid. Respects design decisions DD-007 (modular), DD-008 (MV3), DD-009 (Zustand), DD-010 (React+TS), DD-011 (Tailwind), DD-024 (sidebar-first).

## 1. Layered Architecture

```mermaid
flowchart TD
    subgraph L1["Layer 1 — Browser"]
        BSW[Background Service Worker]
        CScript[Content Script]
        BAPI[(chrome.* APIs)]
    end
    subgraph L2["Layer 2 — Core"]
        Storage[StorageService]
        Migration[MigrationService]
        Bus[EventBus]
        Project[ProjectService]
        Adapter[SwaggerAdapter]
        Settings[SettingsService]
    end
    subgraph L3["Layer 3 — Feature Modules"]
        Auth[AuthenticationService]
        Req[RequestService]
        Env[EnvironmentService]
        Hist[HistoryService]
        Fake[FakeDataService]
        Prod[ProductivityService]
    end
    subgraph L4["Layer 4 — UI (React + Zustand)"]
        Sidebar[Sidebar Shell]
        Panels[Feature Panels]
        Toasts[Notifications]
    end
    CScript --> Adapter
    CScript <--> BSW
    BSW --> Storage
    Storage --> BAPI
    Storage --> Migration
    Project --> Storage
    Auth --> Storage
    Req --> Storage
    Env --> Storage
    Hist --> Storage
    Fake --> Storage
    Prod --> Storage
    Auth & Req & Env & Hist & Fake & Prod --> Bus
    Project --> Bus
    Bus --> Panels
    Sidebar --> Panels
    Panels --> Auth & Req & Env & Hist & Fake & Prod
    Toasts --> Bus
```

**Dependency rules (enforced via ESLint import boundaries):**
- `UI → Service → Storage` allowed; `UI → Storage` **forbidden**.
- Feature modules never import each other; they communicate only through `EventBus`.
- `SwaggerAdapter` is the **only** code allowed to touch Swagger's DOM (isolates R-01).

## 2. Module Dependency Diagram

```mermaid
flowchart LR
    Core(("Core:\nStorage·Events·Project·Adapter")) --> Auth
    Auth --> Req --> Env
    Auth --> Env
    Env --> Hist
    Req --> Hist
    Req --> Fake
    Req --> Prod
    Hist --> Prod
    Core --> Settings
    Settings -.import/export.-> Auth & Req & Env & Hist
```

## 3. Data Flow

```mermaid
sequenceDiagram
    actor U as Developer
    participant SW as Swagger UI
    participant CS as Content Script / Adapter
    participant SV as Feature Service
    participant ST as StorageService
    participant UI as Sidebar (React/Zustand)
    U->>SW: Edit request / authorize
    SW->>CS: DOM mutation observed
    CS->>SV: Normalized change event
    SV->>ST: Debounced write (envelope)
    ST-->>SV: Ack
    SV->>UI: Publish event (EventBus)
    UI-->>U: Update panel / toast
```

Business logic stays in services; the store is a cache of service results; components render store state.

## 4. Storage Flow

```mermaid
flowchart TD
    Svc[Service] --> SS[StorageService]
    SS --> Lock{Project write lock free?}
    Lock -- no --> Queue[Queue + debounce]
    Queue --> Lock
    Lock -- yes --> Batch[Batch & serialize envelope]
    Batch --> CSL[(chrome.storage.local)]
    CSL --> Quota{Near quota?}
    Quota -- yes --> Warn[Emit STORAGE_QUOTA_WARNING]
    Quota -- no --> Done[Resolve]
```

## 5. Event Flow

```mermaid
flowchart LR
    Pub[Publisher service] -->|publish event| Bus[EventBus]
    Bus -->|notify| SubA[Subscriber: panel]
    Bus -->|notify| SubB[Subscriber: dependent service]
    Bus -->|notify| Toasts[Notification system]
```
Full catalog (publishers, subscribers, payloads, lifecycle): `12_EVENT_SYSTEM.md`.

## 6. Authentication Flow

```mermaid
sequenceDiagram
    participant U as Developer
    participant SW as Swagger
    participant AD as SwaggerAdapter
    participant AS as AuthenticationService
    participant ST as StorageService
    Note over U,SW: Save path
    U->>SW: Click Authorize, enter token
    SW->>AD: Authorization state changed
    AD->>AS: onAuthChanged(type, token)
    AS->>AS: validate()
    AS->>ST: save(project, activeEnv, auth)
    AS-->>U: Toast "Authentication stored" (AUTH_UPDATED)
    Note over U,SW: Restore path (on page load)
    SW->>AD: Page ready
    AD->>AS: requestRestore(project, activeEnv)
    AS->>ST: read(auth)
    AS->>AS: validate() (project/env/type/value)
    AS->>AD: injectAuth(token)  %% < 100 ms
    AD->>SW: Set authorized state
    AS-->>U: Toast "Authentication restored" (AUTH_RESTORED)
```

## 7. Initialization Flow

```mermaid
flowchart TD
    Load[Swagger page loads] --> Detect{SwaggerAdapter.detect()}
    Detect -- no --> Idle[Stay dormant — do nothing EC-005]
    Detect -- yes --> PID[ProjectService.identify → project ID]
    PID --> Exists{Workspace exists?}
    Exists -- no --> Create[Create workspace + default environment]
    Exists -- yes --> LoadWS[Load workspace + last-active env]
    Create --> Boot
    LoadWS --> Boot[Load settings + module stores]
    Boot --> Inject[Inject sidebar shell]
    Inject --> Restore[Auth + Request restore for active env]
    Restore --> Ready[Ready — no page-perf impact]
```

## 8. Extension Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Installed
    Installed --> FirstRun: onInstalled → seed defaults (UF-001)
    FirstRun --> Active
    Active --> Updated: onInstalled(reason=update) → MigrationService
    Updated --> Active: migrations OK / rollback on fail (EC-042)
    Active --> Disabled: user disables → Swagger normal (EC-043)
    Disabled --> Active: re-enabled
    Active --> Uninstalled: storage removed by browser
    Uninstalled --> [*]
```

## 9. Browser Lifecycle (MV3 service worker)

```mermaid
stateDiagram-v2
    [*] --> Dormant
    Dormant --> Awake: event (message/alarm/storage)
    Awake --> Working: handle message / persist
    Working --> Dormant: idle timeout (worker suspended)
    note right of Dormant
      No long-lived in-memory state (R-03).
      All state rehydrated from storage on wake.
    end note
```

## 10. Repository / Folder Plan

Every folder, and why it exists (expands `docs/11` + README folder planning):

```text
openapi-companion/
├── .github/                      # CI workflows, PR/issue templates, CODEOWNERS
├── public/                       # static assets copied verbatim into the bundle
├── docs/                         # product/source-of-truth docs (existing)
├── planning/                     # this engineering blueprint
├── src/
│   ├── manifest.json             # MV3 manifest (perms: storage/activeTab/scripting/unlimitedStorage/downloads — DD-035; entries; CSP)
│   ├── background/               # service worker: lifecycle, messaging, migration trigger
│   │   └── index.ts
│   ├── content/                  # content script: detect Swagger, mount sidebar, bridge
│   │   ├── index.ts
│   │   └── bridge.ts             # content↔background messaging
│   ├── sidebar/                  # React entry for the injected sidebar app
│   │   ├── index.tsx
│   │   └── App.tsx
│   ├── popup/                    # toolbar popup (minimal: status + open sidebar)
│   ├── adapters/                 # SwaggerAdapter + future ReDoc/Scalar/RapiDoc adapters
│   │   ├── types.ts
│   │   └── swagger/
│   ├── core/                     # cross-cutting core services
│   │   ├── storage/              # StorageService + MigrationService
│   │   ├── events/               # EventBus + event type map
│   │   ├── project/              # ProjectService
│   │   └── settings/             # SettingsService, ImportExportService
│   ├── modules/                  # feature modules (one folder each, identical shape)
│   │   ├── authentication/
│   │   │   ├── index.ts          # public module API + registration
│   │   │   ├── service.ts        # business logic
│   │   │   ├── store.ts          # Zustand store
│   │   │   ├── types.ts
│   │   │   ├── constants.ts
│   │   │   ├── hooks.ts          # React hooks bridging store/service
│   │   │   ├── utils.ts
│   │   │   └── components/
│   │   ├── request/
│   │   ├── environment/
│   │   ├── history/
│   │   ├── fake-data/
│   │   └── productivity/
│   ├── components/               # shared design-system components (no business logic)
│   ├── hooks/                    # shared React hooks
│   ├── stores/                   # global Zustand stores (project, env, theme, settings)
│   ├── services/                 # shared service utilities (notification, logger)
│   ├── utils/                    # pure helpers
│   ├── constants/                # global constants (keys, limits, shortcut map)
│   ├── types/                    # shared TS types/interfaces & schemas
│   ├── styles/                   # Tailwind base + tokens
│   └── tests/                    # test utilities, fixtures (Swagger version fixtures), e2e
├── package.json
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── README.md
```

| Folder | Why it exists |
|---|---|
| `background/` | MV3 worker: lifecycle hooks, message routing, migration trigger. Stateless (R-03). |
| `content/` | Detect Swagger, inject sidebar, bridge page ↔ extension. No business logic. |
| `sidebar/` `popup/` | React UI entry points. |
| `adapters/` | **Single home for DOM coupling** (R-01); pre-builds multi-tool support seam. |
| `core/` | Shared services every module depends on (storage, events, project, settings). |
| `modules/` | Feature isolation; identical internal shape → predictable, easy to add new modules. |
| `components/` `hooks/` `stores/` `services/` `utils/` `constants/` `types/` `styles/` | Shared, reusable, business-logic-free building blocks. |
| `tests/` | Fixtures (esp. Swagger version fixtures), test utils, Playwright specs. |

## 11. Performance & Scalability Architecture
- **Lazy-load** feature modules and heavy panels (history, large response views).
- **Debounce/batch** all storage writes; **cache** frequently-read project/env in stores.
- **Virtualize** long lists (history, search results, large specs — EC-039/041).
- **Index** endpoints once per project for search (Productivity).
- New modules integrate via folder + registration + events + UI entry only — no edits to existing modules (architecture success criterion).

## 12. Error Handling & Logging
- Every service wraps operations in try/catch with a **recovery strategy** (EC recovery sequence: Detect → Validate → Recover → else Notify + manual recovery).
- Centralized `logger`: verbose in dev, warnings/errors only in prod; **never logs tokens/secrets** (enforced by lint rule + security test).
- Errors never crash the extension; Swagger always remains functional.

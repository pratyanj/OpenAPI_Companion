# 05 — Task Breakdown

> Every feature decomposed into **actionable, story-point-sized engineering tasks** following the canonical vertical-slice pattern:
>
> `Storage Model → Repository/Service → Event wiring → UI → Tests → Docs → Review → Merge`
>
> **No generic tasks.** Each task names concrete artifacts. **Points** use a Fibonacci scale (1, 2, 3, 5, 8) where 1 ≈ ½ day, 8 ≈ a full sprint-week for one engineer. **Task IDs** are `T-<EPIC>.<n>`. Dependencies reference other task IDs. Maps to `04_EPICS.md` and `03_SPRINT_PLAN.md`.

**Legend — Type:** `Infra` build/tooling · `Svc` service/business logic · `Store` Zustand store · `Storage` persistence model · `Adapter` Swagger DOM · `UI` component · `Event` event wiring · `Test` · `Docs` · `Spike` research.

---

## EPIC-00 — Project Setup & Tooling (Sprint 1)

| ID | Task | Type | Pts | Deps | Acceptance |
|---|---|---|---|---|---|
| T-00.1 | **Spike:** validate Vite + MV3 multi-entry bundling (CRXJS) for background/content/sidebar | Spike | 3 | — | Documented working config; sample loads unpacked |
| T-00.2 | Scaffold repo folders per `07_ARCHITECTURE_PLAN.md` (`src/{background,content,sidebar,components,hooks,services,modules,stores,utils,constants,types,styles,tests}`) | Infra | 2 | T-00.1 | Folders + index barrels committed |
| T-00.3 | Author `manifest.json` (MV3) with `storage`, `activeTab`, `scripting`, `unlimitedStorage`, `downloads` (DD-035); content-script match patterns for Swagger | Infra | 2 | T-00.1 | Loads with no warnings; CSP set |
| T-00.4 | Configure TS strict, path aliases, ESLint, Prettier, Tailwind, Zustand | Infra | 3 | T-00.2 | `lint`+`typecheck` pass on empty app |
| T-00.5 | Vitest harness + first unit smoke; Playwright harness + extension-load E2E smoke | Test | 3 | T-00.4 | Both smokes green locally |
| T-00.6 | GitHub Actions: lint → typecheck → test → build; artifact upload | Infra | 3 | T-00.5 | Required check on PRs (see `15_CI_CD.md`) |
| T-00.7 | Repo hygiene: README quickstart, **LICENSE (MIT, DD-036)**, SECURITY.md, CODE_OF_CONDUCT.md, wire CONTRIBUTING, PR/issue templates, CODEOWNERS, branch protection | Docs | 2 | T-00.6 | New-dev path < 15 min |
| T-00.8 | `npm run dev` HMR for sidebar + reload workflow for background/content | Infra | 3 | T-00.3 | Edit-reload loop documented |

---

## EPIC-01 — Core Foundation (Sprints 2–3)

### Storage & Migration
| ID | Task | Type | Pts | Deps | Acceptance |
|---|---|---|---|---|---|
| T-01.1 | Define storage **envelope** type `{schemaVersion,createdVersion,updatedVersion,data}` + key convention `project-id/module/item-id` | Storage | 2 | T-00.4 | Types in `types/storage.ts`; documented in `08` |
| T-01.2 | `StorageService`: get/set/remove/list by namespace; JSON (de)serialize | Svc | 3 | T-01.1 | Unit tests for CRUD round-trip |
| T-01.3 | Debounced + batched write queue; avoid redundant writes | Svc | 3 | T-01.2 | Rapid writes coalesce; perf test |
| T-01.4 | Per-project single-writer lock (multi-tab safety, R-04) | Svc | 3 | T-01.3 | Two-tab concurrent-write test passes |
| T-01.5 | Quota monitor + `STORAGE_QUOTA_WARNING` threshold (EC-019) | Svc | 2 | T-01.2 | Warning emitted near limit (mocked) |
| T-01.6 | `MigrationService`: version detection + ordered migration registry + rollback-on-failure (EC-042, EC-033/034) | Svc | 5 | T-01.2 | `v0→v1` migration test + rollback test |
| T-01.7 | Storage corruption recovery + default-seeding (EC-020, EC-021) | Svc | 3 | T-01.6 | Corrupt store → recovers/seeds defaults |

### Events, Project Detection, Adapter, Plumbing
| ID | Task | Type | Pts | Deps | Acceptance |
|---|---|---|---|---|---|
| T-01.8 | Typed `EventBus` (publish/subscribe/unsubscribe; typed payload map from `12`) | Svc | 3 | T-00.4 | Delivery + unsubscribe unit tests |
| T-01.9 | MV3 background service worker (stateless) + content↔background message bridge | Infra | 5 | T-00.3 | Survives worker suspend/resume; messages round-trip |
| T-01.10 | `SwaggerAdapter` interface (detect/readAuth/writeAuth/readRequest/writeRequest/observe) | Adapter | 2 | T-01.8 | Interface + version-detect stub |
| T-01.11 | **Spike:** Swagger UI auth + request field hooks across Swagger 3.x/4.x/5.x | Spike | 5 | T-01.10 | Documented per-version approach + fixtures |
| T-01.12 | `SwaggerAdapter` Swagger-UI **detection + read** implementation | Adapter | 5 | T-01.11 | Detects Swagger; reads auth/request on fixtures |
| T-01.13 | `ProjectService`: derive stable project ID (`origin+openapi-url+doc-type`), create/load workspace, ensure `default` environment (FR-003) | Svc | 5 | T-01.2, T-01.12 | ID stable across restarts; default env created |
| T-01.14 | Project change/URL-change handling (EC-006, EC-007) | Svc | 3 | T-01.13 | Same project recognized after URL change where possible |
| T-01.15 | Events `PROJECT_DETECTED`/`PROJECT_CHANGED`/`STORAGE_MIGRATED` wiring | Event | 1 | T-01.8, T-01.13 | Events fire with correct payloads |
| T-01.16 | Foundation integration test + migration/isolation suite | Test | 3 | all above | Suite green; isolation verified |
| T-01.17 | Docs: storage schema (`08`), events (`12`), services (`11`) updated | Docs | 2 | T-01.16 | Docs match implementation |

---

## EPIC-02 — UI Shell & Design System (Sprint 3 + ongoing)

| ID | Task | Type | Pts | Deps | Acceptance |
|---|---|---|---|---|---|
| T-02.1 | Sidebar injection into Swagger page; never overlaps Swagger controls; collapse-state persisted | UI | 5 | T-01.9, T-01.13 | Renders on Swagger; collapse persists (UF-002) |
| T-02.2 | Tab navigation shell (Dashboard/Auth/Requests/Env/History/FakeData/Settings) | UI | 3 | T-02.1 | Tabs switch via state (no router, DD) |
| T-02.3 | `ThemeManager` + Tailwind light/dark tokens; instant switch (EC-038) | UI | 3 | T-02.1 | Toggle, no reload; `THEME_CHANGED` fires |
| T-02.4 | Notification/Toast system (success/warning/error, auto-dismiss) (FR-020) | UI | 3 | T-01.8 | Toasts from `NOTIFY` event; a11y live region |
| T-02.5 | Shared components: Button (primary/secondary/danger/icon), Input, Select, Checkbox, Textarea | UI | 5 | T-02.3 | Storybook-style demo + RTL tests |
| T-02.6 | Shared components: Table (sort/filter/search), Dialog/Modal, EmptyState, Badge, Spinner, Tooltip | UI | 5 | T-02.5 | RTL tests; keyboard + ARIA |
| T-02.7 | A11y baseline: focus management, ARIA, Escape-to-close, axe smoke | Test | 3 | T-02.6 | axe passes on shell |
| T-02.8 | Docs: UI plan (`09`), component plan (`10`) | Docs | 2 | T-02.6 | Component tree documented |

---

## EPIC-03 — Authentication Manager (Sprints 4–5)

| ID | Task | Type | Pts | Deps | Acceptance |
|---|---|---|---|---|---|
| T-03.1 | Auth storage model: `{type,token,updatedAt,lastUsed,environment}` under `project/auth/active|profiles` (FDD-001) | Storage | 2 | T-01.1 | Schema + envelope; isolation by project+env |
| T-03.2 | `AuthenticationService.save()` — capture & persist auth for active env; types Bearer/JWT/API Key/Basic | Svc | 3 | T-03.1, T-01.12 | Save unit tests per type |
| T-03.3 | Detect Swagger authorization change via adapter `observe` | Adapter | 3 | T-03.2 | Authorizing in Swagger triggers save |
| T-03.4 | `AuthenticationService.validate()` — pre-restore checks (project/env/type/value readable) | Svc | 2 | T-03.2 | Invalid → not restored |
| T-03.5 | `AuthenticationService.restore()` — inject stored auth into Swagger on load (< 100 ms) | Svc+Adapter | 5 | T-03.4, T-01.12 | Restore E2E (UF-005); perf assert |
| T-03.6 | `AuthenticationService.clear()` — manual removal | Svc | 1 | T-03.2 | Clears active; preserves other data |
| T-03.7 | Auth store (Zustand) + selectors | Store | 2 | T-03.2 | State reflects save/restore/clear |
| T-03.8 | Events `AUTH_UPDATED/RESTORED/CLEARED/EXPIRED` | Event | 1 | T-01.8 | Payloads per `12` |
| T-03.9 | Auth UI: status indicator, masked show/hide, clear button, restore confirmation toast | UI | 3 | T-02.6, T-03.7 | Token masked by default |
| T-03.10 | Edge cases: expired (EC-008), invalid (EC-009), type change (EC-010), logout (EC-011) | Svc | 3 | T-03.5 | No auth loop; clear errors |
| T-03.11 | Tests: persistence-across-refresh E2E, isolation, no-token-logging lint+test, restore-latency | Test | 3 | T-03.10 | All green; latency < 100 ms |
| T-03.12 | Docs: feature spec + changelog + service `11` | Docs | 1 | T-03.11 | Updated |

---

## EPIC-04 — Request Manager (Sprints 6–7)

| ID | Task | Type | Pts | Deps | Acceptance |
|---|---|---|---|---|---|
| T-04.1 | Request storage model: `{body,headers,query,path,contentType,example,updatedAt}` under `project/requests/drafts|templates` keyed by endpoint+env (FDD-002) | Storage | 2 | T-01.1 | Schema + isolation |
| T-04.2 | Adapter: read request fields from Swagger "Try it out" | Adapter | 5 | T-01.12 | Reads body/query/path/headers on fixtures |
| T-04.3 | Adapter: write/populate request fields (no auto-execute) | Adapter | 5 | T-04.2 | Populates without firing request |
| T-04.4 | `RequestService.autosave()` — debounced ≤ 300 ms idle on field change | Svc | 3 | T-04.2 | Debounce test; coalesced writes |
| T-04.5 | `RequestService.restore()` — restore on endpoint open (< 150 ms); partial restore on schema change (EC-012) | Svc | 5 | T-04.3 | Restore E2E (UF-007); partial-restore test |
| T-04.6 | Template CRUD: create/duplicate/rename/delete (FR-006) | Svc | 3 | T-04.1 | No auto-overwrite; persistence test |
| T-04.7 | Request store + selectors | Store | 2 | T-04.4 | State reflects draft/template ops |
| T-04.8 | Events `REQUEST_CHANGED/RESTORED`, `TEMPLATE_SAVED/DELETED` | Event | 1 | T-01.8 | Payloads per `12` |
| T-04.9 | UI: save-status indicator, restore toast, template selector + actions, invalid-field highlight | UI | 5 | T-02.6, T-04.7 | UF-006/007 demoed |
| T-04.10 | Edge cases: endpoint deleted (EC-013), method changed (EC-014), large body (EC-015) | Svc | 3 | T-04.5 | Large payload no-freeze test |
| T-04.11 | Tests: survive-refresh E2E, no-auto-execute, isolation, large-payload perf | Test | 3 | T-04.10 | Green; > 99% restore |
| T-04.12 | Docs: feature spec + changelog + service `11` | Docs | 1 | T-04.11 | Updated |

---

## EPIC-05 — Environment Manager (Sprint 8)

| ID | Task | Type | Pts | Deps | Acceptance |
|---|---|---|---|---|---|
| T-05.1 | Environment storage model: `{name,baseUrl,variables,authRef,prefs,updatedAt}` under `project/environments/*` (FDD-003) | Storage | 2 | T-01.1 | Schema; unique name per project |
| T-05.2 | Implement **Companion-scoped, populate-time** variable substitution per **DD-032** (no outgoing-request rewrite) | Svc | 2 | T-05.1 | Resolved values populate fields; no network interception |
| T-05.3 | `EnvironmentService` CRUD + duplicate + validate (EC-018 duplicate name) | Svc | 3 | T-05.1 | CRUD unit tests |
| T-05.4 | `EnvironmentService.switch()` — set active, re-load env-scoped auth + requests (< 200 ms), no refresh | Svc | 5 | T-05.3, T-03.5, T-04.5 | Switch E2E (UF-009); leakage test |
| T-05.5 | Variable resolver `{{VAR}}`; missing-variable detection (EC-017) | Svc | 3 | T-05.2 | Missing var flagged pre-execution |
| T-05.6 | Built-in suggested environments (Local/Dev/QA/UAT/Staging/Prod) | Svc | 1 | T-05.3 | Seeded on first use |
| T-05.7 | Last-active persistence + restore-after-restart | Svc | 2 | T-05.4 | Survives restart |
| T-05.8 | Env store + selectors | Store | 2 | T-05.3 | Active env reflected |
| T-05.9 | Events `ENVIRONMENT_CHANGED/CREATED/DELETED` | Event | 1 | T-01.8 | Payloads per `12` |
| T-05.10 | UI: selector dropdown, editor form (name/baseUrl/variables), active indicator, validation errors | UI | 5 | T-02.6, T-05.8 | UF-008 demoed |
| T-05.11 | Edge case: active env deleted → fall back to default, keep history (EC-016) | Svc | 2 | T-05.4 | No data loss on delete |
| T-05.12 | Tests: one-click switch E2E, cross-env leakage, variable-resolution | Test | 3 | T-05.11 | Green |
| T-05.13 | Docs: feature spec + changelog + service `11` | Docs | 1 | T-05.12 | Updated |

---

## EPIC-06 — API History (Sprints 9–10)

| ID | Task | Type | Pts | Deps | Acceptance |
|---|---|---|---|---|---|
| T-06.1 | **Spike:** validate **DOM-based response capture** (DD-033) across Swagger 3.x/4.x/5.x fixtures; confirm status/headers/body/timing readable; security-reviewer sign-off | Spike | 3 | T-01.12 | DOM capture proven on fixtures; network observer remains deferred/opt-in |
| T-06.2 | History storage model: request+response+metadata `{method,endpoint,body,query,path,headers,response{body,status,headers,contentType},durationMs,timestamp,env}` (FDD-004); large bodies → `cache/` namespace | Storage | 3 | T-01.1 | Schema; configurable performance cap `MAX_HISTORY_ITEMS` (default 1000, DD-031) |
| T-06.3 | Capture-on-execute via adapter/content bridge (no execution delay) | Adapter+Svc | 5 | T-06.1, T-04.2 | 100% of executions recorded |
| T-06.4 | `HistoryService.record()` + ring-buffer eviction (EC-023) | Svc | 3 | T-06.2 | Oldest evicted at cap |
| T-06.5 | `HistoryService.replay()` (< 200 ms); logs a **new** record; never mutates templates | Svc | 5 | T-06.3, T-04.3 | Replay E2E (UF-012) |
| T-06.6 | Delete entry + clear project history (preserve auth/templates) (EC-025) | Svc | 2 | T-06.4 | Clear leaves other data intact |
| T-06.7 | Search (< 100 ms) + filter (method/date) | Svc | 3 | T-06.4 | Perf test at thousands of entries |
| T-06.8 | History store + lazy/virtualized list (EC-039) | Store+UI | 5 | T-02.6, T-06.4 | List no-freeze at scale |
| T-06.9 | Events `HISTORY_RECORDED`, `REQUEST_REPLAYED`, `HISTORY_CLEARED` | Event | 1 | T-01.8 | Payloads per `12` |
| T-06.10 | UI: history list/timeline, details panel, basic response viewer (status/time/size/headers/pretty JSON) | UI | 5 | T-06.8 | UF-011 demoed |
| T-06.11 | Edge cases: deleted-endpoint replay (EC-013), duplicates (EC-024) | Svc | 2 | T-06.5 | Graceful handling |
| T-06.12 | Tests: record-on-execute E2E, replay-no-mutation, search-perf | Test | 3 | T-06.11 | Green |
| T-06.13 | Docs: feature spec + changelog + service `11` | Docs | 1 | T-06.12 | Updated |

---

## EPIC-07 — Fake Data Generator (Sprint 11)

| ID | Task | Type | Pts | Deps | Acceptance |
|---|---|---|---|---|---|
| T-07.1 | Generator library: 21 generators (name/first/last/username/email/password/uuid/phone/address/city/state/country/postal/date/datetime/boolean/integer/float/decimal/url/company) | Svc | 5 | T-00.4 | Unit tests assert format validity |
| T-07.2 | Field-type detection from OpenAPI schema + field name; generic fallback (EC-030) | Svc | 5 | T-07.1, T-04.2 | Correct type chosen on fixtures |
| T-07.3 | `FakeDataService.generateField()` (< 20 ms) + validation before insertion | Svc | 3 | T-07.2 | Perf + validity tests |
| T-07.4 | `FakeDataService.generateAll()` (< 150 ms) preserving manual edits | Svc | 3 | T-07.3 | Manual-edit-preserved test |
| T-07.5 | Minimal preset storage `fake-data/presets` | Storage | 1 | T-01.1 | Persists user generator prefs |
| T-07.6 | Event `FAKE_DATA_GENERATED` | Event | 1 | T-01.8 | Fires on generate |
| T-07.7 | UI: per-field generate button, regenerate, generate-all, success/fallback messaging | UI | 3 | T-02.6, T-04.9 | UF-010 demoed |
| T-07.8 | Edge cases: unsupported field (EC-029), required field hint (EC-031) | Svc | 2 | T-07.4 | Unsupported unchanged |
| T-07.9 | Tests: generator validity, perf, preserve-edits, E2E | Test | 2 | T-07.8 | Green |
| T-07.10 | Docs: feature spec + changelog + service `11` | Docs | 1 | T-07.9 | Updated |

---

## EPIC-08 — Productivity Tools (Sprint 12)

| ID | Task | Type | Pts | Deps | Acceptance |
|---|---|---|---|---|---|
| T-08.1 | Endpoint indexer over active project's OpenAPI spec (supports 5,000+) | Svc | 5 | T-01.13 | Index build perf test |
| T-08.2 | Search (< 50 ms) across endpoints/requests/templates/history | Svc | 3 | T-08.1, T-06.7 | Perf test at 5,000 endpoints |
| T-08.3 | Favorites CRUD `project/favorites/endpoints` + appear-first ordering | Svc+Storage | 2 | T-01.1 | Persistence test |
| T-08.4 | Recent-APIs tracking (auto-update on access) | Svc | 2 | T-06.3 | Updates on endpoint use |
| T-08.5 | Code generators: cURL / Fetch / Axios (< 30 ms) | Svc | 5 | T-04.2 | Generated code runs on a sample API |
| T-08.6 | Productivity store + selectors | Store | 2 | T-08.2 | State reflects search/fav/recent |
| T-08.7 | Events `FAVORITE_TOGGLED`, `RECENT_UPDATED` | Event | 1 | T-01.8 | Payloads per `12` |
| T-08.8 | UI: search dialog (Ctrl+K), favorites & recent sections, quick actions, copy buttons w/ feedback | UI | 5 | T-02.6, T-08.6 | Search dialog + copy demoed |
| T-08.9 | Edge cases: no-results (EC), large spec (EC-039), small screen/collapsed sidebar (EC-036) | UI | 2 | T-08.8 | Graceful states |
| T-08.10 | Tests: search-perf, code-gen correctness, favorites/recents persistence | Test | 3 | T-08.9 | Green |
| T-08.11 | Docs: feature spec + changelog + service `11` | Docs | 1 | T-08.10 | Updated |

---

## EPIC-09 — Settings & Data Portability (Sprint 13)

| ID | Task | Type | Pts | Deps | Acceptance |
|---|---|---|---|---|---|
| T-09.1 | Settings storage model `settings/{appearance,shortcuts,storage,notifications,privacy,advanced}` (global, outside project) (FDD-010) | Storage | 2 | T-01.1 | Schema; persists across restart |
| T-09.2 | `SettingsService`: get/set, apply-immediately, defaults | Svc | 3 | T-09.1 | Theme/pref changes apply live |
| T-09.3 | Storage metrics (usage per project + total) | Svc | 2 | T-01.5 | Accurate usage shown |
| T-09.4 | Clear per-project / clear-all with confirmation | Svc | 3 | T-09.3 | Confirmed destructive actions |
| T-09.5 | `ImportExportService.export()` — selected modules → JSON (< 500 ms) + secrets warning | Svc | 3 | T-01.2 | Export round-trip valid |
| T-09.5b | **Downloads-folder backup (DD-039):** `backupToDownloads()` via `chrome.downloads` (manual "Export now") + optional auto-snapshot scheduler (periodic/on-change); emits `DATA_BACKED_UP` | Svc | 3 | T-09.5 | JSON file written to Downloads; auto-snapshot toggle works |
| T-09.6 | `ImportExportService.import()` — schema validation + preview + duplicate handling (Replace/Merge/Rename/Cancel) (EC-032…035) | Svc | 5 | T-01.6, T-09.5 | Invalid never overwrites |
| T-09.7 | Reset-to-defaults flow (EC during active session) | Svc | 2 | T-09.2 | Safe reset |
| T-09.8 | Settings store + selectors | Store | 1 | T-09.2 | State reflects settings |
| T-09.9 | Events `SETTINGS_UPDATED`, `THEME_CHANGED`, `DATA_IMPORTED/EXPORTED/RESET` | Event | 1 | T-01.8 | Payloads per `12` |
| T-09.10 | UI: categorized settings (Appearance/Storage/Data/General), confirmation dialogs, file picker, version info | UI | 5 | T-02.6, T-09.8 | UF-015/016/017 demoed |
| T-09.11 | Security: import sanitization, no code execution (EC-045/047) | Svc | 3 | T-09.6 | Malicious-import test rejects safely |
| T-09.12 | Tests: round-trip export→import, import-validation, E2E | Test | 3 | T-09.11 | Green |
| T-09.13 | Docs: feature spec + changelog + service `11` | Docs | 1 | T-09.12 | Updated |

---

## EPIC-10 — Quality, Security & Performance (Sprints 14–15)

| ID | Task | Type | Pts | Deps | Acceptance |
|---|---|---|---|---|---|
| T-10.1 | Edge-case sweep: implement/verify EC-001…EC-048 with tests (group by module) | Test | 8 | all features | Each EC has unit/integration/manual coverage |
| T-10.2 | Performance pass vs NFR targets (restore<100ms, search<50ms, switch<200ms, etc.) + bundle-size budget | Test | 5 | all features | Benchmarks documented & met |
| T-10.3 | Security review per `13_SECURITY_AND_PRIVACY.md` checklist (permissions, logging, validation, isolation, import/export, migration, dep audit) | Test | 5 | all features | Checklist signed off |
| T-10.4 | Accessibility audit (WCAG 2.1 AA): keyboard, ARIA, focus, contrast; fixes | Test+UI | 5 | all UI | axe + manual SR pass |
| T-10.5 | Cross-browser matrix: Chrome/Edge/Brave/Arc/Opera | Test | 5 | all features | All 5 pass smoke + critical flows |
| T-10.6 | Swagger version-matrix tests for `SwaggerAdapter` (R-01) | Test | 3 | T-01.12 | Pass on 3.x/4.x/5.x fixtures |
| T-10.7 | Regression suite assembly + CI integration | Test | 3 | T-10.1 | Suite required in CI |
| T-10.8 | Beta build, distribution, feedback intake, triage & fixes | Infra+Svc | 5 | T-10.7 | Blocker/critical issues resolved |
| T-10.9 | User guide + installation guide | Docs | 3 | T-10.8 | Guides published |

---

## EPIC-11 — Release & Distribution (Sprint 16)

| ID | Task | Type | Pts | Deps | Acceptance |
|---|---|---|---|---|---|
| T-11.1 | Release candidate build + final regression/smoke on all browsers | Infra+Test | 3 | T-10.7 | RC green everywhere |
| T-11.2 | Chrome Web Store package + listing assets (icons/screenshots/copy) + privacy disclosure | Infra+Docs | 5 | T-11.1 | Package validated; assets ready (asset deps PO) |
| T-11.3 | Version `1.0.0` tag; finalize changelog + release notes; GitHub release | Docs | 2 | T-11.1 | Per `19_RELEASE_PLAN.md` |
| T-11.4 | Rollback plan + post-release monitoring (issue templates, crash-report path) | Docs | 2 | T-11.2 | Documented |
| T-11.5 | Submit to store; verify install from store on all browsers | Infra | 3 | T-11.2 | v1.0.0 live & installable |

---

## Summary by Epic

| Epic | Tasks | ~Points | Sprints |
|---|---|---|---|
| EPIC-00 Setup | 8 | 21 | S1 |
| EPIC-01 Foundation | 17 | 47 | S2–S3 |
| EPIC-02 UI Shell | 8 | 29 | S3+ |
| EPIC-03 Authentication | 12 | 29 | S4–S5 |
| EPIC-04 Request Manager | 12 | 38 | S6–S7 |
| EPIC-05 Environment | 13 | 32 | S8 |
| EPIC-06 API History | 13 | 41 | S9–S10 |
| EPIC-07 Fake Data | 10 | 26 | S11 |
| EPIC-08 Productivity | 11 | 31 | S12 |
| EPIC-09 Settings | 14 | 37 | S13 |
| EPIC-10 Quality | 9 | 44 | S14–S15 |
| EPIC-11 Release | 5 | 15 | S16 |
| **Total** | **132** | **~390** | **16** |

> ~390 points across 16 sprints ≈ 24 pts/sprint — consistent with the velocity assumption in `03_SPRINT_PLAN.md` for a 2–3 engineer team. Spikes (T-00.1, T-01.11, T-06.1) front-load the highest-uncertainty work.

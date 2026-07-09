# 03 — Sprint Plan

> 16 two-week sprints take OpenAPI Companion from empty repo to v1.0.0. Each sprint: **Goal, Duration, Dependencies, Deliverables, Acceptance Criteria, Definition of Done.** Maps to phases in `02_PHASE_PLAN.md` and tasks in `05_TASK_BREAKDOWN.md`.
>
> **Cadence:** 2 weeks/sprint. **Velocity assumption:** ~20–26 story points/sprint for a small team (2–3 engineers). Story-point estimates per task live in `05_TASK_BREAKDOWN.md`. **Shared DoD** (applies to every sprint) is defined once at the bottom.

| Sprint | Phase | Theme | Points (target) |
|---|---|---|---|
| S1 | P0 | Project Bootstrap | 21 |
| S2 | P1 | Extension Infrastructure & Storage Engine | 24 |
| S3 | P1 | Event Bus, Project Detection & UI Shell | 23 |
| S4 | P2 | Authentication — core persistence | 21 |
| S5 | P2 | Authentication — restore, edge cases & UI | 20 |
| S6 | P3 | Request Manager — auto-save & restore | 23 |
| S7 | P3 | Request Manager — templates & UI | 21 |
| S8 | P4 | Environment Manager | 24 |
| S9 | P5 | API History — capture, list & replay | 23 |
| S10 | P5 | API History — search, filter & response view | 21 |
| S11 | P6 | Fake Data Generator | 20 |
| S12 | P7 | Productivity Tools | 24 |
| S13 | P8 | Settings & Import/Export | 23 |
| S14 | P9 | Hardening: edge cases, perf, a11y, security | 22 |
| S15 | P9 | Public Beta & bug-fix | 18 |
| S16 | P10 | Release Candidate & v1.0.0 | 18 |

---

## Sprint 1 — Project Bootstrap
- **Goal:** A loadable, CI-gated MV3 extension skeleton.
- **Duration:** 2 weeks. **Dependencies:** none.
- **Deliverables:** repo scaffold; MV3 `manifest.json` (perms: storage, activeTab, scripting, unlimitedStorage, downloads — DD-035); Vite build (background + content + sidebar entries); TS strict, ESLint, Prettier, Tailwind, Zustand; Vitest + Playwright smoke tests; GitHub Actions (lint/typecheck/test/build); CONTRIBUTING, LICENSE (**MIT** — DD-036), SECURITY.md, CODE_OF_CONDUCT.md, PR/issue templates, CODEOWNERS, branch protection. **Spike:** Vite MV3 bundling (CRXJS).
- **Acceptance Criteria:** `npm run build` yields an unpacked extension that loads in Chrome with no console errors; all CI gates green on a PR; new dev reaches running extension in < 15 min.
- **DoD:** shared DoD + CI pipeline merged to `main` and required for PRs.

## Sprint 2 — Extension Infrastructure & Storage Engine
- **Goal:** Background/content plumbing + the storage foundation.
- **Dependencies:** S1.
- **Deliverables:** MV3 background service worker (stateless) + content-script messaging bridge; `StorageService` (namespaced keys, schema-versioned envelopes, debounced/batched writes, per-project write lock, quota monitor); `MigrationService` (version check, registered pipeline, rollback); storage unit tests incl. a `v0→v1` migration.
- **Acceptance Criteria:** storage round-trips objects with envelopes; migration test passes; concurrent writes from two simulated tabs do not corrupt data (R-04 test); worker survives suspend/resume without losing data.
- **DoD:** shared DoD.

## Sprint 3 — Event Bus, Project Detection & UI Shell
- **Goal:** The remaining Foundation pieces; sidebar visible on a Swagger page.
- **Dependencies:** S2.
- **Deliverables:** typed `EventBus`; `ProjectService` (detect Swagger, derive stable project ID, create/load workspace, ensure `default` environment); `SwaggerAdapter` interface + detection/read implementation (write paths stubbed); injected collapsible **Sidebar** with tab nav; theming (light/dark) + `ThemeManager`; **Notification/Toast** system.
- **Acceptance Criteria:** opening Swagger detects project + creates default env + renders sidebar without altering Swagger; event published → subscriber received (unit); disabling extension leaves Swagger fully functional (EC-043); theme toggle works with no reload.
- **DoD:** shared DoD. **Milestone M1 (Foundation Complete).**

## Sprint 4 — Authentication: Core Persistence
- **Goal:** Save authorization entered in Swagger to project+active-environment storage.
- **Dependencies:** S3.
- **Deliverables:** `AuthenticationService` (save/validate; Bearer/JWT/API Key/Basic); `SwaggerAdapter` auth **read** hook; auth store; detect Swagger authorization changes; events `AUTH_UPDATED`.
- **Acceptance Criteria:** authorizing in Swagger persists a masked credential scoped to project+env; tokens never logged (lint rule + test); no cross-project write.
- **DoD:** shared DoD.

## Sprint 5 — Authentication: Restore, Edge Cases & UI
- **Goal:** Auto-restore auth after refresh; full auth UX.
- **Dependencies:** S4.
- **Deliverables:** `SwaggerAdapter` auth **write/restore** hook; restore-on-load flow; auth status indicator, clear button, restore confirmation/toast, masked show/hide; events `AUTH_RESTORED`, `AUTH_CLEARED`, `AUTH_EXPIRED`; edge cases EC-008…EC-011.
- **Acceptance Criteria:** 100% persistence across refresh; restore < 100 ms; expired/invalid token handled without auth loop; logout preserves requests/history/templates.
- **DoD:** shared DoD + E2E for UF-004/UF-005. **Milestone M2 (Authentication Complete).**

## Sprint 6 — Request Manager: Auto-save & Restore
- **Goal:** Persist and restore request fields per endpoint+environment.
- **Dependencies:** S5.
- **Deliverables:** `RequestService` (debounced auto-save ≤ 300 ms idle, restore < 150 ms, partial restore on schema change); `SwaggerAdapter` request read/write; request store; save-status + restore toast; events `REQUEST_CHANGED`, `REQUEST_RESTORED`; edge cases EC-012…EC-015.
- **Acceptance Criteria:** request data survives refresh in > 99% scenarios; restore never auto-executes; large payloads don't freeze UI; no cross-project/env leakage.
- **DoD:** shared DoD.

## Sprint 7 — Request Manager: Templates & UI
- **Goal:** Named, reusable request templates.
- **Dependencies:** S6.
- **Deliverables:** template CRUD (create/duplicate/rename/delete) in `RequestService`; template selector dropdown + actions; invalid-field highlighting; events `TEMPLATE_SAVED`, `TEMPLATE_DELETED`.
- **Acceptance Criteria:** templates persist across sessions; templates never overwrite each other automatically; loading a template populates fields without executing.
- **DoD:** shared DoD + E2E for UF-006/UF-007. **Milestone M3 (Request Persistence Complete).**

## Sprint 8 — Environment Manager
- **Goal:** Multi-environment CRUD + one-click switch + variables.
- **Dependencies:** S7 (and S5).
- **Deliverables:** `EnvironmentService` (CRUD, duplicate, switch < 200 ms, validate, last-active persistence, `{{VAR}}` resolution — **Companion-scoped, populate-time, DD-032**); built-in suggested environments; selector + editor UI + active indicator; events `ENVIRONMENT_CHANGED/CREATED/DELETED`; edge cases EC-016…EC-018; switch re-loads env-scoped auth + requests.
- **Acceptance Criteria:** one-click switch with no refresh, no auth/request leakage across envs; missing variables flagged before execution; environment restores after restart.
- **DoD:** shared DoD + E2E for UF-008/UF-009. **Milestone M4 (Environments Complete).**

## Sprint 9 — API History: Capture, List & Replay
- **Goal:** Auto-record executed requests/responses; replay.
- **Dependencies:** S8.
- **Deliverables:** `HistoryService` (capture on execute, store request+response+metadata, ring-buffer cap, replay < 200 ms, delete entry, clear project); response capture via **DOM observation** behind the adapter (**DD-033**); history list/timeline + replay/delete + details panel; events `HISTORY_RECORDED`, `REQUEST_REPLAYED`, `HISTORY_CLEARED`; edge cases EC-023…EC-025, EC-013.
- **Acceptance Criteria:** 100% of executions recorded with no execution delay; replay logs a new record and doesn't mutate templates; clearing history leaves auth/templates intact.
- **DoD:** shared DoD.

## Sprint 10 — API History: Search, Filter & Response View
- **Goal:** Make large histories usable; show responses.
- **Dependencies:** S9.
- **Deliverables:** search (< 100 ms) + filter (method/date); lazy-loaded/virtualized list; basic response viewer (status/time/size/headers/pretty JSON — full inspector deferred to v1.3); replay-of-deleted-endpoint handling.
- **Acceptance Criteria:** search fast at thousands of entries; list never freezes UI; response metadata visible.
- **DoD:** shared DoD + E2E for UF-011/UF-012. **Milestone M5 (History Complete).**

## Sprint 11 — Fake Data Generator
- **Goal:** One-click realistic field data, offline.
- **Dependencies:** S6 (Request field-population API).
- **Deliverables:** `FakeDataService` (21 generators, schema/name detection, validation), per-field generate + regenerate + "generate all", success/fallback UI; event `FAKE_DATA_GENERATED`; edge cases EC-029…EC-031.
- **Acceptance Criteria:** per-field < 20 ms, full request < 150 ms, no UI freeze; manual edits preserved; unsupported fields unchanged.
- **DoD:** shared DoD + E2E for UF-010. **Milestone M6 (Fake Data Complete).**

## Sprint 12 — Productivity Tools
- **Goal:** Search, favorites, recents, copy-as-code.
- **Dependencies:** S6 + S9.
- **Deliverables:** `ProductivityService` (endpoint index + search < 50 ms, favorites, recents, code gen cURL/Fetch/Axios < 30 ms); search dialog (Ctrl+K), favorites/recent sections, quick actions, copy buttons; events `FAVORITE_TOGGLED`, `RECENT_UPDATED`; edge cases EC-005, EC-036, EC-039.
- **Acceptance Criteria:** search < 50 ms at 5,000 endpoints; sidebar < 100 ms; generated code runs with minimal edits.
- **DoD:** shared DoD. **Milestone M7 (Productivity Complete).**

## Sprint 13 — Settings & Import/Export
- **Goal:** Configuration, storage management, data portability.
- **Dependencies:** S3 + stabilized feature schemas (S4–S12).
- **Deliverables:** `SettingsService` + `ImportExportService` (theme, storage metrics, export < 500 ms, **Downloads-folder backup — manual + optional auto-snapshot via `chrome.downloads` (DD-039)**, import with schema validation + preview + duplicate handling, reset, per-project/all clearing); categorized settings UI + confirmation dialogs + backup controls + export-secrets warning; events `SETTINGS_UPDATED`, `THEME_CHANGED`, `DATA_IMPORTED/EXPORTED/BACKED_UP/RESET`; edge cases EC-032…EC-035.
- **Acceptance Criteria:** theme instant; import validated before applying; invalid import never overwrites; export warns about secrets.
- **DoD:** shared DoD + E2E for UF-015/UF-016/UF-017. **Milestone M8 (Settings Complete — feature-complete MVP).**

## Sprint 14 — Hardening: Edge Cases, Performance, A11y, Security
- **Goal:** Production quality across the board.
- **Dependencies:** S13.
- **Deliverables:** full pass on EC-001…EC-048 with tests; performance pass vs. all NFR targets + bundle-size budget; security review per pre-release checklist (permissions, logging, validation, isolation, import/export, migration, dependency audit); accessibility audit (WCAG 2.1 AA) — keyboard, ARIA, focus, contrast; cross-browser verification (Chrome/Edge/Brave/Arc/Opera).
- **Acceptance Criteria:** zero known critical bugs; all NFR targets met; security checklist signed off; a11y audit passed; works on all 5 browsers.
- **DoD:** shared DoD + regression suite green.

## Sprint 15 — Public Beta & Bug-Fix
- **Goal:** Real-world validation.
- **Dependencies:** S14.
- **Deliverables:** beta build + distribution; user/installation guides; public GitHub repo; feedback intake + triage; fixes for beta-blocking defects (esp. Swagger-version DOM breakage R-01).
- **Acceptance Criteria:** beta feedback triaged; all blocker/critical issues resolved; no open data-loss bugs.
- **DoD:** shared DoD. **Milestone M9 (Beta Complete).**

## Sprint 16 — Release Candidate & v1.0.0
- **Goal:** Ship to Chrome Web Store.
- **Dependencies:** S15.
- **Deliverables:** RC build; final regression/smoke on all browsers; Chrome Web Store package + listing assets + privacy disclosure; `1.0.0` tag, finalized changelog + release notes + GitHub release; rollback plan.
- **Acceptance Criteria:** release checklist (`19_RELEASE_PLAN.md`) fully ticked; v1.0.0 published and installable.
- **DoD:** shared DoD. **Milestone M10 (v1.0 Released).**

---

## Shared Definition of Done (every sprint, every story)
Per DD-029/DD-030 and `20_CONTRIBUTING.md`:
1. Feature/code implemented to spec.
2. Unit + integration tests pass; **E2E for user-facing flows**.
3. Documented edge cases handled and tested.
4. Documentation updated (feature spec / user stories / changelog as applicable).
5. Code reviewed and approved; **no lint errors, no type errors**.
6. No known regressions.
7. Acceptance criteria satisfied.
8. Accessibility checks for any new UI (keyboard nav, ARIA, focus, contrast).
9. No tokens/secrets logged; security guidelines respected.

## Sprint Ceremonies
| Ceremony | When | Output |
|---|---|---|
| Sprint Planning | Day 1 | Committed backlog + point total |
| Daily Standup | Daily | Blockers surfaced |
| Backlog Refinement | Mid-sprint | Next sprint's stories pointed |
| Sprint Review/Demo | Last day | Working increment demoed on a real Swagger page |
| Retrospective | Last day | 1–3 process improvements |

# 04 — Epic Breakdown

> 12 engineering epics for v1.0. Each epic lists **stories** (traced to the user-story docs and FRs), **technical tasks**, **testing**, and **documentation**. Detailed, story-point-sized tasks live in `05_TASK_BREAKDOWN.md`; this doc is the mid-level grouping that connects sprints (`03`) to tasks (`05`).
>
> **Story ID convention:** `EPIC-NN / S#` (story). Acceptance criteria summarized here; full criteria in the FDDs and `05_TASK_BREAKDOWN.md`.

| Epic | Name | Phase | Sprints | Module/Service |
|---|---|---|---|---|
| EPIC-00 | Project Setup & Tooling | P0 | S1 | — |
| EPIC-01 | Core Foundation | P1 | S2–S3 | Storage, Migration, EventBus, Project, SwaggerAdapter |
| EPIC-02 | UI Shell & Design System | P1 | S3 (+ ongoing) | Sidebar, Theme, Notifications, shared components |
| EPIC-03 | Authentication Manager | P2 | S4–S5 | AuthenticationService |
| EPIC-04 | Request Manager | P3 | S6–S7 | RequestService |
| EPIC-05 | Environment Manager | P4 | S8 | EnvironmentService |
| EPIC-06 | API History | P5 | S9–S10 | HistoryService |
| EPIC-07 | Fake Data Generator | P6 | S11 | FakeDataService |
| EPIC-08 | Productivity Tools | P7 | S12 | ProductivityService |
| EPIC-09 | Settings & Data Portability | P8 | S13 | SettingsService, ImportExportService |
| EPIC-10 | Quality, Security & Performance | P9 | S14–S15 | cross-cutting |
| EPIC-11 | Release & Distribution | P10 | S16 | cross-cutting |

---

## EPIC-00 — Project Setup & Tooling
**Goal:** Reproducible, CI-gated MV3 project skeleton.

**Stories**
- S1: As a contributor, I can clone, install, build, and load the unpacked extension so I can start developing.
- S2: As a maintainer, every PR runs lint/typecheck/test/build so broken code can't merge.

**Technical tasks:** Vite MV3 config spike; manifest + permissions; multi-entry build (background/content/sidebar); TS strict; ESLint/Prettier; Tailwind; Zustand; folder scaffold; GitHub Actions; branch protection; templates.
**Testing:** one Vitest unit smoke + one Playwright E2E smoke (extension loads).
**Documentation:** README quickstart; CONTRIBUTING wired; LICENSE (**MIT** — DD-036), SECURITY.md, CODE_OF_CONDUCT.md.

---

## EPIC-01 — Core Foundation
**Goal:** Storage, migration, events, project detection, Swagger adapter seam — the shared core (FR-001, FR-003, FR-021, FR-024).

**Stories**
- S1: As the extension, I persist namespaced, versioned data so features can store/restore reliably. *(FR-021)*
- S2: As the extension, I migrate storage safely on update so users never lose data. *(EC-042, DD security)*
- S3: As a module, I publish/subscribe to events so modules stay decoupled. *(architecture)*
- S4: As the extension, I detect the Swagger project and assign a stable ID with a default environment. *(FR-001, FR-003)*
- S5: As the extension, I read Swagger state through a versioned adapter so DOM coupling is isolated. *(R-01)*

**Technical tasks:** `StorageService` (namespaces, envelopes, batched/debounced writes, write-lock, quota monitor); `MigrationService` (pipeline + rollback); `EventBus` (typed); `ProjectService` (detect + ID + workspace + default env); background worker + content bridge; `SwaggerAdapter` interface + Swagger-UI detection/read.
**Testing:** storage CRUD + envelope tests; `v0→v1` migration test; multi-tab race test; event delivery test; project-ID stability test; adapter detection test across Swagger fixtures.
**Documentation:** storage schema (`08`), event catalog (`12`), service interfaces (`11`).

---

## EPIC-02 — UI Shell & Design System
**Goal:** Non-intrusive sidebar, theming, notifications, and reusable components (DD-024/025/026; `10_UI_PLAN.md`).

**Stories**
- S1: As a developer, I see a collapsible sidebar alongside Swagger that never covers its controls. *(UF-002)*
- S2: As a developer, I can switch light/dark theme instantly. *(EC-038, DD-025)*
- S3: As a developer, I get non-intrusive success/warning/error toasts. *(FR-020)*
- S4: As an engineer, I reuse a shared component library (buttons, inputs, tables, dialogs, empty states).

**Technical tasks:** sidebar injection + collapse-state persistence; tab navigation; `ThemeManager` + Tailwind theme tokens; toast/notification system; shared components per `10_COMPONENT_PLAN.md`; keyboard-nav + ARIA baseline.
**Testing:** component unit tests (RTL); theme-switch test; a11y smoke (axe) on shell.
**Documentation:** UI plan (`09`), component plan (`10`).

---

## EPIC-03 — Authentication Manager
**Goal:** Persist & auto-restore auth per project+environment (FR-004; FDD-001; user stories 01).

**Stories** *(traced to `08_USER_STORIES/01_AUTHENTICATION_MANAGER.md`)*
- S1: As a developer, my authorization is saved automatically after I authorize in Swagger.
- S2: As a developer, my authorization is restored automatically after refresh/restart (< 100 ms).
- S3: As a developer, I can clear stored authentication manually.
- S4: As a developer, auth is isolated per project and per environment.
- S5: As a developer, I'm notified on auth save/restore/expiry without noise.

**Technical tasks:** `AuthenticationService` (save/restore/clear/validate; Bearer/JWT/API Key/Basic); adapter auth read+write; auth store; change detection; masked display.
**Edge cases:** EC-008 expired, EC-009 invalid, EC-010 type change, EC-011 logout.
**Testing:** persistence-across-refresh E2E (UF-004/005); isolation test; no-token-logging test; restore-latency perf test.
**Documentation:** update feature spec + changelog; service interface in `11`.

---

## EPIC-04 — Request Manager
**Goal:** Auto-save/restore request data + templates (FR-005, FR-006; FDD-002; user stories 02).

**Stories**
- S1: As a developer, my request body/params/headers auto-save as I type (≤ 300 ms idle).
- S2: As a developer, my request is restored when I revisit an endpoint (< 150 ms) and never auto-executed.
- S3: As a developer, I can save/duplicate/rename/delete named templates.
- S4: As a developer, partial restore applies compatible fields when the schema changed.

**Technical tasks:** `RequestService` (auto-save, restore, partial restore, template CRUD); adapter request read/write; request store; save-status + restore UI; invalid-field highlighting.
**Edge cases:** EC-012 schema changed, EC-013 endpoint deleted, EC-014 method changed, EC-015 large body.
**Testing:** survive-refresh E2E (UF-006/007); no-auto-execute test; large-payload perf test; isolation test.
**Documentation:** feature spec + changelog; service in `11`.

---

## EPIC-05 — Environment Manager
**Goal:** Multi-environment CRUD + switching + variables (FR-007, FR-008; FDD-003; user stories 03).

**Stories**
- S1: As a developer, I create/edit/delete/duplicate environments (base URL + variables + auth ref).
- S2: As a developer, I switch environments in one click (< 200 ms) without refresh; auth + requests re-load.
- S3: As a developer, I use `{{VARIABLE}}` substitution; missing variables are flagged before execution.
- S4: As a developer, my last-active environment is remembered across restarts.

**Technical tasks:** `EnvironmentService` (CRUD, duplicate, switch, validate, last-active, variable resolver); built-in suggested environments; selector + editor UI + active indicator.
**Edge cases:** EC-016 env deleted, EC-017 missing variable, EC-018 duplicate name.
**Testing:** one-click switch E2E (UF-008/009); leakage test across envs; variable-resolution unit tests.
**Documentation:** feature spec + changelog; service in `11`; substitution scope resolved (**DD-032**: Companion-scoped, populate-time).

---

## EPIC-06 — API History
**Goal:** Auto-record executions + replay + search (FR-009, FR-010; FDD-004; user stories 04).

**Stories**
- S1: As a developer, every executed request+response is recorded automatically with metadata.
- S2: As a developer, I replay any history entry in one click (< 200 ms); replay logs a new record.
- S3: As a developer, I search (< 100 ms) and filter (method/date) my history.
- S4: As a developer, I delete an entry or clear project history (without affecting auth/templates).
- S5: As a developer, I view response status/time/size/headers/body for an entry.

**Technical tasks:** `HistoryService` (capture, store, ring-buffer cap, replay, delete, clear, search, filter); response capture via **DOM observation** (**DD-033**); list/timeline + details + basic response viewer; lazy/virtualized list.
**Edge cases:** EC-013 deleted endpoint replay, EC-023 large history, EC-024 duplicates, EC-025 cleared.
**Testing:** record-on-execute E2E (UF-011/012); replay-no-mutation test; search-perf test at scale.
**Documentation:** feature spec + changelog; service in `11`.

---

## EPIC-07 — Fake Data Generator
**Goal:** Offline realistic test data (FR-011; FDD-005; user stories 05).

**Stories**
- S1: As a developer, I generate a realistic value for a field in one click (< 20 ms).
- S2: As a developer, I generate a full request payload (< 150 ms) while my manual edits are preserved.
- S3: As a developer, unsupported fields are left unchanged and required fields are hinted.

**Technical tasks:** `FakeDataService` (21 generators, schema/name type detection, validation); per-field + regenerate + generate-all UI; fallback handling.
**Edge cases:** EC-029 unsupported field, EC-030 unknown schema, EC-031 required field.
**Testing:** generator unit tests (format validity); preserve-manual-edits test; perf tests; E2E (UF-010).
**Documentation:** feature spec + changelog; service in `11`.

---

## EPIC-08 — Productivity Tools
**Goal:** Search, favorites, recents, copy-as-code, sidebar nav (FR-015, FR-016, FR-019; FDD-009; user stories 09).

**Stories**
- S1: As a developer, I search endpoints globally (Ctrl+K) with instant results (< 50 ms) even at 5,000 endpoints.
- S2: As a developer, I favorite endpoints and see them first.
- S3: As a developer, I see recently used APIs (auto-updated).
- S4: As a developer, I copy a request as cURL / Fetch / Axios (< 30 ms) and it runs with minimal edits.

**Technical tasks:** `ProductivityService` (endpoint index, search, favorites, recents, code generators); search dialog; favorites/recent sections; quick actions; copy buttons with feedback.
**Edge cases:** EC-005 unsupported page, EC-036 small screen, EC-039 large spec, no-results state.
**Testing:** search-perf test; code-gen correctness tests (cURL/Fetch/Axios); favorites/recents persistence tests.
**Documentation:** feature spec + changelog; service in `11`.

---

## EPIC-09 — Settings & Data Portability
**Goal:** Configuration, storage management, import/export + Downloads-folder backup, reset (FR-017, FR-018; FDD-010; user stories 10).

**Stories**
- S1: As a developer, I change theme and preferences; they persist and apply immediately.
- S2: As a developer, I see storage usage and clear per-project or all data (with confirmation).
- S3: As a developer, I export selected modules to JSON and re-import with validation + preview + duplicate handling.
- S4: As a developer, I reset the extension to defaults safely.
- S5: As a developer, I back up my data as JSON to my Downloads folder (manually or on an auto-snapshot), so I have a portable file on my PC (DD-039).

**Technical tasks:** `SettingsService` + `ImportExportService` (theme, metrics, export, **Downloads-folder backup via `chrome.downloads` — manual + auto-snapshot, DD-039**, import-validate-preview-merge, reset, clear); categorized settings UI + backup controls; confirmation dialogs; export-secrets warning.
**Edge cases:** EC-032 invalid file, EC-033 older schema, EC-034 newer schema, EC-035 duplicate project.
**Testing:** import-validation tests (malicious/corrupt EC-045/047); round-trip export→import test; E2E (UF-015/016/017).
**Documentation:** feature spec + changelog; service in `11`.

---

## EPIC-10 — Quality, Security & Performance
**Goal:** Production-grade stability, security, performance, accessibility, cross-browser (Phase 9; `13_TEST_PLAN.md`, `17_RISK_ANALYSIS.md`).

**Stories**
- S1: As a user, all 48 documented edge cases behave as specified.
- S2: As a user, the extension meets every NFR performance target.
- S3: As a security reviewer, the pre-release security checklist passes.
- S4: As a user with assistive tech, the UI meets WCAG 2.1 AA.
- S5: As a user, the extension works on Chrome/Edge/Brave/Arc/Opera.

**Technical tasks:** edge-case test sweep; perf profiling + bundle budget; security review (permissions/logging/validation/isolation/import/migration/deps); a11y audit + fixes; cross-browser test matrix.
**Testing:** regression suite; perf benchmarks; axe + manual screen-reader pass; browser matrix in CI/manual.
**Documentation:** risk register updates; security sign-off; test report.

---

## EPIC-11 — Release & Distribution
**Goal:** Ship v1.0.0 (Phase 10; `19_RELEASE_PLAN.md`).

**Stories**
- S1: As a maintainer, I produce a signed, versioned release candidate.
- S2: As a user, I install OpenAPI Companion from the Chrome Web Store.
- S3: As a maintainer, I have release notes, changelog, guides, and a rollback plan.

**Technical tasks:** RC build + final regression; Web Store package + listing assets + privacy disclosure; version tag + changelog + release notes + GitHub release; rollback plan.
**Testing:** final smoke on all browsers; store-package validation.
**Documentation:** installation guide, user guide, release notes, changelog finalized.

---

## Traceability Summary
| Epic | FRs | User-story doc | FDD | Edge cases |
|---|---|---|---|---|
| 03 | FR-004 | 01 | FDD-001 | EC-008…011 |
| 04 | FR-005, FR-006 | 02 | FDD-002 | EC-012…015 |
| 05 | FR-007, FR-008 | 03 | FDD-003 | EC-016…018 |
| 06 | FR-009, FR-010 | 04 | FDD-004 | EC-013, 023…025 |
| 07 | FR-011 | 05 | FDD-005 | EC-029…031 |
| 08 | FR-015, FR-016, FR-019 | 09 | FDD-009 | EC-005, 036, 039 |
| 09 | FR-017, FR-018 | 10 | FDD-010 | EC-032…035, 045, 047 |

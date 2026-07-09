# 02 — Phase Plan

> Derived from `01_PROJECT_ANALYSIS.md`. Defines the 11 phases that take OpenAPI Companion from empty repo to a published v1.0 on the Chrome Web Store. Each phase lists **Goal, Deliverables, Exit Criteria, Risks**. Phases map to sprints in `03_SPRINT_PLAN.md` and milestones in `20_MILESTONES.md`.

## Phase Map

```mermaid
flowchart LR
    P0[P0 Setup] --> P1[P1 Foundation]
    P1 --> P2[P2 Auth]
    P2 --> P3[P3 Request]
    P3 --> P4[P4 Environment]
    P4 --> P5[P5 History]
    P5 --> P6[P6 Fake Data]
    P6 --> P7[P7 Productivity]
    P7 --> P8[P8 Settings]
    P8 --> P9[P9 Hardening & Beta]
    P9 --> P10[P10 RC & Release]
```

| Phase | Name | Sprints | Milestone |
|---|---|---|---|
| 0 | Project Setup | S1 | M0 |
| 1 | Foundation | S2–S3 | M1 |
| 2 | Authentication Manager | S4–S5 | M2 |
| 3 | Request Manager | S6–S7 | M3 |
| 4 | Environment Manager | S8 | M4 |
| 5 | API History | S9–S10 | M5 |
| 6 | Fake Data Generator | S11 | M6 |
| 7 | Productivity Tools | S12 | M7 |
| 8 | Settings | S13 | M8 |
| 9 | Hardening, QA & Public Beta | S14–S15 | M9 |
| 10 | Release Candidate & Production | S16 | M10 |

---

## Phase 0 — Project Setup

**Goal:** A reproducible, CI-gated repository where any contributor can clone, install, build the extension, load it unpacked, and run all test/lint/type checks with a single command.

**Deliverables**
- Repository scaffold matching `07_ARCHITECTURE_PLAN.md` folder structure.
- `manifest.json` (MV3) with permissions: `storage`, `activeTab`, `scripting`, `unlimitedStorage`, `downloads` (DD-035).
- Vite build producing a loadable unpacked extension (background worker + content script + sidebar bundle).
- TypeScript **strict** config; ESLint + Prettier; Tailwind configured; Zustand installed.
- Vitest + Playwright harnesses with one passing smoke test each.
- GitHub Actions skeleton (lint → typecheck → test → build) — see `15_CI_CD.md`.
- Repo hygiene: `README`, `LICENSE` (**MIT** — DD-036), `SECURITY.md`, `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md` (already drafted in docs), `.github/` templates, `CODEOWNERS`, branch protection.

**Exit Criteria**
- `npm run build` produces an unpacked extension that loads in Chrome with no console errors.
- `npm run lint && npm run typecheck && npm run test` all green in CI on a PR.
- A developer can follow the README and reach a running extension in < 15 minutes.

**Risks**
- MV3 + Vite + React + content-script bundling friction (multiple entry points). *Mitigation:* spike a known-good Vite MV3 config (e.g. CRXJS) in S1.

---

## Phase 1 — Foundation

**Goal:** The shared core every feature depends on: storage, events, project detection, the Swagger adapter seam, the background/content plumbing, the sidebar shell + theming + notifications, and a guaranteed **default environment** per project.

**Deliverables**
- `StorageService` — namespaced (`project-id/module/item-id`), schema-versioned envelopes, debounced/batched writes, per-project single-writer lock, quota monitoring.
- `MigrationService` — version check + registered migration pipeline + rollback-on-failure.
- `EventBus` — typed pub/sub (see `12_EVENT_SYSTEM.md`).
- `ProjectService` — detect Swagger page, derive stable project ID (`Origin + OpenAPI URL + doc type`), create/load project workspace, ensure a `default` environment exists.
- `SwaggerAdapter` (interface + Swagger-UI implementation behind a feature spike) — detection + read hooks; write hooks land with Auth/Request.
- Background service worker + content script messaging bridge (MV3-safe, stateless).
- UI shell: injected, collapsible **Sidebar** with tab navigation, theming (light/dark), and the **Notification/Toast** system.

**Exit Criteria**
- Opening a Swagger page detects the project, creates/loads its workspace + default environment, and renders the sidebar without disturbing Swagger.
- Storage round-trips through migration with a passing migration test (`v0 → v1`).
- Event bus delivers a published event to a subscriber in unit tests.
- Disabling the extension leaves Swagger fully functional (EC-043).

**Risks**
- R-01 (Swagger DOM), R-03 (MV3 worker lifecycle), R-04 (multi-tab races) all first surface here. *Mitigation:* adapter abstraction + storage lock + stateless worker design.

---

## Phase 2 — Authentication Manager

**Goal:** Persist authorization entered in Swagger and auto-restore it after refresh/restart, scoped to project + active environment. This is the single highest-impact feature (DD-015).

**Deliverables**
- `AuthenticationService` (see `11_SERVICE_PLAN.md`): save/restore/clear/validate, types Bearer/JWT/API Key/Basic.
- Swagger auth read+write integration via `SwaggerAdapter`.
- Auth store + status UI (indicator, clear button, restore confirmation, masked display).
- Events: `AUTH_UPDATED`, `AUTH_RESTORED`, `AUTH_CLEARED`, `AUTH_EXPIRED`.
- Edge cases EC-008…EC-011 handled (expired/invalid token, type change, logout).

**Exit Criteria**
- 100% auth persistence across page refresh; restore < 100 ms after page load (NFR).
- Zero cross-project credential leakage (verified by isolation test).
- Tokens never logged (lint rule + test); masked in UI.

**Risks**
- R-01 (auth injection across Swagger versions), R-05 (token security). *Mitigation:* adapter version matrix tests; security review gate.

---

## Phase 3 — Request Manager

**Goal:** Auto-save request fields (body, query, path, headers, content-type, selected example) and restore them per endpoint + environment, plus named templates. Restoration must never auto-execute.

**Deliverables**
- `RequestService`: debounced auto-save (≤ 300 ms idle), restore (< 150 ms), template CRUD (create/duplicate/rename/delete), partial restore on schema change (EC-012).
- Swagger request read/write via `SwaggerAdapter`.
- Request store + UI: save-status indicator, restore toast, template selector + actions, invalid-field highlighting.
- Events: `REQUEST_CHANGED`, `REQUEST_RESTORED`, `TEMPLATE_SAVED`, `TEMPLATE_DELETED`.

**Exit Criteria**
- Request data survives refresh in > 99% of supported scenarios; large payloads do not freeze UI (EC-015).
- Restoring never triggers execution (business rule).
- No request leakage between projects/environments.

**Risks** R-01 (request field detection), R-02 (large payload storage). *Mitigation:* size caps + lazy serialization.

---

## Phase 4 — Environment Manager

**Goal:** Multiple environments per project with one-click switching that re-loads environment-scoped auth + requests, plus `{{VARIABLE}}` substitution. Resolves the default-environment seam from Phase 1.

**Deliverables**
- `EnvironmentService`: CRUD + duplicate + switch (< 200 ms), validation, last-active persistence, variable resolution.
- Built-in suggested environments (Local/Dev/QA/UAT/Staging/Production) + unlimited custom.
- UI: environment selector, editor form, active indicator, validation errors.
- Events: `ENVIRONMENT_CHANGED`, `ENVIRONMENT_CREATED`, `ENVIRONMENT_DELETED`.
- Edge cases EC-016…EC-018.

**Exit Criteria**
- Switching is one click, no page refresh, no auth/request leakage between environments.
- Missing variables highlighted before execution (EC-017).
- Environment restores after browser restart.

**Risks** Variable-substitution scope (resolved **DD-032**: Companion-scoped, populate-time substitution only — never rewrites the outgoing request). True per-request dynamic chaining is deferred to Workflow Runner (v1.2).

---

## Phase 5 — API History

**Goal:** Automatically record every executed request + response with metadata, searchable/filterable, with one-click replay (replay creates a new history record and never mutates templates).

**Deliverables**
- `HistoryService`: capture on execute, store request+response+metadata, search (< 100 ms), filter (method/date), replay (< 200 ms), delete entry, clear project history, ring-buffer cap.
- Response capture via **DOM observation** of Swagger's rendered response behind `SwaggerAdapter` (**DD-033**; network observer deferred/opt-in).
- UI: history list/timeline, search bar, filters, replay/delete actions, request-details panel, basic response view (full inspector deferred to v1.3).
- Events: `HISTORY_RECORDED`, `REQUEST_REPLAYED`, `HISTORY_CLEARED`.
- Edge cases EC-023…EC-025, EC-013 (deleted endpoint replay).

**Exit Criteria**
- 100% of executed requests recorded with no execution delay; search fast at thousands of entries (lazy loading).
- Replay restores fields and logs a new record; clearing history does not touch auth/templates.

**Risks** R-02 (history growth is now a *performance* concern, not quota — `unlimitedStorage`/DD-035 removes the ceiling; mitigated by the DD-031 cap + cache offload + virtualization); response-capture security (DD-033 — DOM-only, security-reviewer sign-off).

---

## Phase 6 — Fake Data Generator

**Goal:** One-click realistic test data for request fields, fully offline, preserving manual edits; field-level and full-payload generation.

**Deliverables**
- `FakeDataService`: 21 generators (name/email/phone/UUID/password/address/city/state/country/postal/date/datetime/boolean/integer/float/decimal/url/company/username/first/last), field-type detection from schema/name, validation before insertion.
- UI: per-field generate button, regenerate, "generate all", success/fallback messaging.
- Events: `FAKE_DATA_GENERATED`.
- Edge cases EC-029…EC-031 (unsupported field, unknown schema, required-field hint).

**Exit Criteria**
- Per-field generation < 20 ms; full request < 150 ms; never freezes UI; generated values pass typical API validation.
- Manual edits always take precedence; unsupported fields left unchanged.

**Risks** Schema detection accuracy. *Mitigation:* generic fallback generators (EC-030).

---

## Phase 7 — Productivity Tools

**Goal:** The everyday accelerators: global endpoint search, favorites, recent APIs, copy-as cURL/Fetch/Axios, sidebar navigation, quick actions — fast even on 5,000+ endpoint specs.

**Deliverables**
- `ProductivityService`: endpoint indexing + search (< 50 ms), favorites CRUD, recent-APIs tracking, code generators (cURL/Fetch/Axios, < 30 ms).
- UI: search dialog (Ctrl+K), favorites & recent sections, quick actions, copy buttons with feedback.
- Events: `FAVORITE_TOGGLED`, `RECENT_UPDATED`.
- Edge cases EC-005, EC-036, EC-039 (large specs, collapsed sidebar, no results).

**Exit Criteria**
- Search < 50 ms at 5,000 endpoints; sidebar loads < 100 ms; generated code runs with minimal edits.

**Risks** Indexing cost on huge specs. *Mitigation:* indexed/virtualized lists.

---

## Phase 8 — Settings

**Goal:** Central configuration: theme, storage usage + per-project/all cleanup, JSON import/export + Downloads-folder backup with validation, reset, version info. Destructive actions confirmed; changes apply immediately.

**Deliverables**
- `SettingsService` + `ImportExportService`: theme persistence, storage metrics, export (< 500 ms), **Downloads-folder backup — manual + optional auto-snapshot via `chrome.downloads` (DD-039)**, import with schema validation + preview + duplicate handling (Replace/Merge/Rename/Cancel), reset, per-project and all-data clearing.
- UI: categorized settings (Appearance/Storage/Data/General), confirmation dialogs, file picker, backup controls, export warning for secrets.
- Events: `SETTINGS_UPDATED`, `THEME_CHANGED`, `DATA_IMPORTED`, `DATA_EXPORTED`, `DATA_BACKED_UP`, `DATA_RESET`.
- Edge cases EC-032…EC-035 (import validation, schema version mismatch, duplicate project).

**Exit Criteria**
- Theme switches instantly (no reload); import validated before applying; invalid import never overwrites data; export warns about sensitive content.

**Risks** Import of malicious/corrupt files (EC-045, EC-047). *Mitigation:* strict schema validation, no code execution, sanitize.

---

## Phase 9 — Hardening, QA & Public Beta

**Goal:** Turn 7 working modules into a stable, secure, fast, cross-browser product, then expose it to a closed/public beta and fix what beta finds.

**Deliverables**
- Full edge-case pass (all EC-001…EC-048) with tests.
- Performance pass against every NFR target; bundle-size budget enforced.
- Security review per `13_SECURITY_AND_PRIVACY.md` pre-release checklist (permissions, logging, validation, isolation, import/export, migration, dependency audit).
- Cross-browser verification: Chrome, Edge, Brave, Arc, Opera.
- Accessibility pass (WCAG 2.1 AA target): keyboard nav, ARIA, focus, contrast.
- Public beta build + feedback loop; user/installation guides; GitHub repo public.

**Exit Criteria**
- Zero known critical bugs; all NFR targets met; security checklist signed off; a11y audit passed; beta feedback triaged and blockers resolved.

**Risks** Beta surfaces Swagger-version DOM breakage (R-01) in the wild. *Mitigation:* adapter version matrix + telemetry-free crash logging via user-reported issues.

---

## Phase 10 — Release Candidate & Production Release

**Goal:** Ship v1.0.0 to the Chrome Web Store with complete release artifacts.

**Deliverables**
- Release candidate build; final regression + smoke on all browsers.
- Chrome Web Store package + listing assets (icons, screenshots, copy) + privacy disclosure.
- Versioned `1.0.0` tag, changelog finalized, release notes, GitHub release.
- Installation guide, user guide, documentation site/README finalized.

**Exit Criteria**
- v1.0.0 published and installable from the store; release checklist (in `19_RELEASE_PLAN.md`) fully ticked; rollback plan documented.

**Risks** Store review rejection (permissions/privacy). *Mitigation:* minimal permissions, clear privacy policy, no remote code.

---

## Cross-Phase Definition of Done

A phase is **done** only when, for every feature it contains (DD-029, DD-030):
1. Implementation complete.
2. Unit + integration tests pass; E2E for user-facing flows.
3. Documented edge cases handled and tested.
4. Documentation updated (feature spec, user stories, changelog).
5. Code reviewed; no lint/type errors; no known regressions.
6. Acceptance criteria satisfied.

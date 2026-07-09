# TODO — Open Action Items

> Running tracker for OpenAPI Companion. Checked items are done; unchecked need action. Last updated: 2026-07-01.

## 🔴 Before the repository goes public — fill placeholders

- [ ] **`LICENSE`** — replace copyright holder `2026 OpenAPI Companion contributors` with your name/org if wanted (MIT — DD-036).
- [ ] **`SECURITY.md`** — set a monitored security contact (`security@TODO-set-project-domain`) or rely on GitHub Private Vulnerability Reporting.
- [ ] **`CODE_OF_CONDUCT.md`** — set enforcement contact (`conduct@TODO-set-project-domain`).
- [ ] **`.github/CODEOWNERS`** — replace `@OWNER` with real GitHub usernames/teams.
- [ ] **`.github/ISSUE_TEMPLATE/config.yml`** — replace `OWNER/REPO` in the security-advisory URL.

## 🟠 Decisions needing security-reviewer sign-off (before their phase ships)

- [ ] **DD-033** — DOM-based response capture for API History (blocks Phase 5 / Sprint 9).
- [ ] **DD-037** — plaintext token storage for v1.0 with strict handling (blocks Phase 2 / Sprint 4–5).

## 🟡 Still-open items from `planning/01_PROJECT_ANALYSIS.md`

- [ ] **Branding / listing assets** — ✅ **final logo shipped**: PO-generated mark (spec sheet + `{…}` braces + green automation bolt, per the brand direction memory), master at `branding/logo-final.png`, icon set regenerated via `scripts/generate-icons.mjs` (PNG-master pipeline). Still open: screenshots + Chrome Web Store copy (Phase 10 / T-11.2).
- [ ] **Performance baseline** — define the CI benchmark reference machine + measurement method for NFR targets (`planning/13_TEST_PLAN.md` §6).
- [ ] **Privacy policy text** — final Web Store privacy policy (draft from the local-first / zero-telemetry posture in `docs/13`).

## 🟣 Tech debt (tracked)

- [ ] **Dev-toolchain audit** — Vite/Vitest/esbuild have dev-server-only advisories (high/critical per `npm audit`, but **0 in production deps** — none ship in `dist/`). Upgrade Vite/Vitest to a patched line once `@crxjs/vite-plugin` supports it (currently pinned to the Vite 5 line). CI gates on `npm audit --omit=dev --audit-level=high`, which passes.
- [ ] **Content-script host access** — manifest matches `http://*/*` + `https://*/*`; confirm during the SwaggerAdapter spike (T-01.11) whether this needs an explicit host permission beyond `activeTab`.

## ✅ Completed

- [x] Full 20-document planning suite in `planning/`
- [x] 8 PO questions → DD-031…DD-038 (+ DD-039) in `docs/19_DESIGN_DECISIONS.md`; permission set + Downloads-backup propagated
- [x] Repo hygiene: `LICENSE` (MIT), `SECURITY.md`, `CODE_OF_CONDUCT.md` (Contributor Covenant v2.1)
- [x] `.github/` — CI workflow, PR template, bug/feature issue templates + config, `CODEOWNERS`
- [x] **Phase 0 / Sprint 1 — Project Bootstrap** scaffold:
  - [x] MV3 `manifest.config.ts` (5 permissions per DD-035), Vite + CRXJS build, TS strict, ESLint (flat) + Prettier, Tailwind + tokens, Zustand
  - [x] Entry points: background service worker, content script (Shadow-DOM mount), popup, placeholder sidebar shell
  - [x] Folder scaffold (core/adapters/modules/components/hooks/stores/services/utils/constants/types) with starter `types` (StorageEnvelope, Result), `constants` (MAX_HISTORY_ITEMS=1000, PERMISSIONS), `SwaggerAdapter` contract
  - [x] Vitest + RTL harness (unit smoke passing), Playwright E2E harness
  - [x] GitHub Actions CI (lint → format → typecheck → test+coverage → prod-audit → build → e2e)
  - [x] **Validated locally:** typecheck ✓ · lint ✓ · format ✓ · unit tests ✓ (4) · prod audit 0 vulns ✓ · build ✓ (valid MV3 `dist/`) · E2E ✓ (extension loads, SW registers, popup renders)
- [x] **Sprint 2 — Foundation core** (EPIC-01):
  - [x] `EventBus` — typed pub/sub over the full event catalog (T-01.8)
  - [x] `StorageService` — envelopes, debounced/batched writes, per-project `withLock`, quota monitor, corruption recovery + `getOrSeed` (T-01.1…T-01.5, T-01.7)
  - [x] `MigrationService` — version detection, ordered pipeline, snapshot + rollback-on-failure, refuse-downgrade (T-01.6)
  - [x] `chromeLocalArea` adapter + in-memory fake for tests; migration wired into the background worker on install/update
  - [x] **Validated:** typecheck ✓ · lint ✓ · format ✓ · **33 unit tests ✓** (events 7, storage 15, migration 7, utils 4) · build ✓ · core coverage ~88–95%
- [x] **Sprint 3 — Foundation part B (core)** (EPIC-01/02):
  - [x] `ProjectService` — stable project id + guaranteed default environment; idempotent; publishes `PROJECT_DETECTED` (T-01.13…15)
  - [x] `SwaggerUiAdapter` — detect/version/specUrl + coarse observe; the only Swagger-DOM boundary (R-01); auth/request read+write stubbed for Sprint 4/6 (T-01.10…12)
  - [x] `ThemeManager` — light/dark/system, instant apply, OS-follow (DD-025/EC-038)
  - [x] content script wires detect → identify → theme → mount (Shadow DOM); sidebar shows project + theme toggle
  - [x] **Validated:** typecheck ✓ · lint ✓ · format ✓ · **58 unit tests ✓** · build ✓ · E2E ✓ · new-module coverage 91–100%
- [x] **Sprint 3 — Sidebar Shell & Design System** (EPIC-02):
  - [x] Tailwind wired into the Shadow DOM (`:host` tokens, `?inline` injection)
  - [x] Components: Button, IconButton, Badge, Spinner, EmptyState, Toast + ToastLayer, Tabs (ARIA)
  - [x] `SidebarShell` — collapsible (persisted), 7-tab ARIA nav, panel outlet w/ placeholders, header theme toggle, toast layer
  - [x] Reactive theming (`useTheme`/`useSyncExternalStore`) + `useEventBus`; `NotificationService`
  - [x] **Validated:** typecheck ✓ · lint ✓ · format ✓ · **72 unit tests ✓** · build ✓ · E2E ✓ · overall coverage 85% (verified live in browser)
- [x] **Sprint 4 — Authentication Manager (core)** (EPIC-03):
  - [x] SwaggerAdapter real auth read/write/clear via `window.ui` (R-01 spike, auth portion)
  - [x] `AuthenticationService` — save/restore/validate/clear/capture/watch; JWT-expiry aware; env-scoped; events `AUTH_UPDATED/RESTORED/CLEARED/EXPIRED`
  - [x] `AuthPanel` — status, masked credential + reveal, clear; live via auth events
  - [x] `jwt` util (isJwt, decodeJwtExpiryMs); edge cases EC-008…011
  - [x] Wired: restore on load + watch + AuthPanel in the Auth tab
  - [x] **Validated:** typecheck ✓ · lint ✓ · format ✓ · **97 unit tests ✓** · build ✓ · E2E ✓
- [x] **Progress logs** in [`log/`](./log) — shareable per-sprint status reports for the team
- [x] **`DEVELOPMENT.md`** — local run/test runbook

## Next up

- [x] **Fixed content-script world isolation** — MAIN-world bridge (`main-world.ts` + `swagger-bridge.ts` + `swagger-protocol.ts`) so the extension can read/write the page's `window.ui`. 104 tests ✓.
- [x] **✅ Auth verified on real Swagger** — capture + store + auto-restore confirmed on a live OAS 2.0 `apiKey`-bearer page (2026-07-01). **Milestone M2 complete.** (Still worth spot-checking `http bearer` / `basic` on other Swagger builds.)
- [ ] **Security-reviewer sign-off** — DD-037 (plaintext token storage) and DD-033 (capture approach) before release.

- [ ] `git init` + first commit on `develop` (branch strategy: `planning/14_GIT_STRATEGY.md`); enable branch protection + provision Chrome Web Store account. **(PO will say when.)**
- [x] Reload `dist/` unpacked to see the new tabbed shell + toasts on a Swagger page. *(Verified live in Sprint 3.)*
- [x] **SwaggerAdapter version matrix** — 18-test fixture suite across Swagger 3.x/4.x/5.x markup (`swagger-version-matrix.test.ts`, T-10.6, Sprint 14 Part A).
- [x] Remaining shared components — `Dialog`, `CopyButton`, icons added with the panels that needed them; form inputs inline. *(Table not needed so far.)*
- [ ] Full content↔background message bridge (finish T-01.9) — not needed by any shipped feature yet; revisit in Sprint 14 (or for `chrome.downloads` backup routing).
- [x] **Sprint 6 — Request Manager (core):** auto-save/restore request body (DOM read/write), templates, RequestsPanel; wired. **125 tests ✓.**
- [x] **Fixed: data lost on refresh** — project id was derived from `location.href` (included Swagger's `#/` routing hash → different id per navigation). Now uses stable `docIdentityUrl()` (hash dropped). 128 tests ✓.
- [x] **Verify requests on real Swagger** — PO confirmed: survives refresh, apply auto-fills the body. *(Sprint 6 sign-off.)*
- [ ] **Params/headers capture** (v1 Request Manager is body-only).
- [x] **Sprint 8 — Environment Manager (core):** multi-env CRUD + one-click switch (re-scopes auth/requests, clears auth when new env has none), `{{VAR}}` resolver, EnvironmentsPanel. **143 tests ✓.**
- [x] **Fixed: edit environments** — ✏️ button edits name/baseUrl/variables on any env (incl. default/Local).
- [x] **Design correction:** environments are **per-project variable/credential contexts**, switched **in place (no navigation)**. Cross-deployment jumping moves to a **future Project switcher**. (Explored navigate+global; reverted per PO.) 146 tests ✓.
- [x] **Verify environments on real Swagger** — Env tab → ✏️ edit Local, add a `{{VAR}}` → Save → refresh → persists. Create a 2nd env → Switch → Auth panel re-scopes in place (no reload).
- [ ] **(Future) Project switcher** — deployment list (name + URL) that navigates + loads that project's data (the home for Local/QA/dev/client jumping).
- [ ] **(Future) Auto-login via username/password** (call the login endpoint) — Workflow Runner (v1.2), not MVP.
- [x] **Sprint 9 — API History (core):** auto-record executed responses (DOM capture, DD-033), ring-buffer cap, search/method-filter, replay, delete, clear; HistoryPanel. **174 tests ✓.**
- [x] **Fixed: History captured nothing** — selector grabbed the live-response table's *header* cell ("Code") instead of the data row; now excludes `.col_header`. 162 tests ✓.
- [x] **History detail modal + copy buttons** — click a row → `Dialog`/`HistoryDetail` with request & response bodies each copyable (`CopyButton`/`copyText`, execCommand for http pages). Replaced inline expand.
- [x] **Replay now auto-executes** — `adapter.replay` → `autoExecute` polling state machine (expand → open → try-out → execute → fill+run), one click of Execute per control; `HistoryService.replay` uses it; fresh response re-captured as a new entry.
- [x] **Fixed: Replay needed a manual expand + second click** — old fixed-timeout approach probed for controls before Swagger re-rendered them; replaced with the `autoExecute` state machine that waits for each step. One click now runs end-to-end.
- [x] **Icons: emojis → icon library** — adopted `lucide-react` (inline SVGs, bundled at build, CSP-safe in Shadow DOM). All UI glyphs (tabs, theme toggle, brand, close, delete, edit, reveal/hide, copy, toast kinds, empty-states) now use a central `src/components/icons.tsx` with semantic aliases. +3 KB gzip; 175 tests ✓.
- [x] **⚠️ Re-verify History on real Swagger** — reload → execute a request → History tab lists it (status/path); click a row → detail modal + copy; **Replay auto-navigates & runs** the op; search/filter/clear.
- [x] **Sprint 11 — Fake Data Generator (core):** 21 generators, name+value field-type detection, `generateAll`/`regenerateField` into the open JSON body (preserves manual edits, leaves unsupported fields), `FakeDataPanel`; `FAKE_DATA_GENERATED`. **228 tests ✓.** (EPIC-07)
- [x] **⚠️ Re-verify Fake Data on real Swagger** — open a POST → Try it out → Fake Data tab → Generate test data fills fields; Regenerate all overwrites; per-field ↻ works; manual edits survive a default generate.
- [x] **Sprint 12 — Productivity Tools (core):** endpoint index (`listEndpoints`/`openEndpoint` adapter), search + favorites + recents, copy-as-code (cURL/Fetch/Axios), Command Palette (⌘K); `FAVORITE_TOGGLED`/`RECENT_UPDATED`. **255 tests ✓.** (EPIC-08)
- [x] **⚠️ Re-verify Productivity on real Swagger** — ⌘K opens the palette; search filters; clicking a row scrolls to/expands the op; star persists across reload; Recent updates; Copy cURL/Fetch/Axios are runnable.
- [x] **Sprint 13 — Settings & Import/Export (core):** `SettingsService` (prefs, storage metrics, clear project/all) + `ImportExportService` (versioned export, Downloads backup, validated+sanitized import w/ preview & Keep/Replace); categorized `SettingsPanel` w/ confirms; `SETTINGS_UPDATED`/`THEME_CHANGED`/`DATA_EXPORTED|IMPORTED|BACKED_UP|RESET`. **278 tests ✓.** → **feature-complete MVP (M8).** (EPIC-09)
- [x] **⚠️ Re-verify Settings on real Swagger** — theme switch instant; storage usage; Download backup → file in Downloads; paste → Preview (counts + secrets) → Import (Keep/Replace); Clear project/all (confirm); prefs persist across reload.
- [ ] **(Deferred to Sprint 14+)** Settings follow-ups: Merge/Rename import modes; auto-backup scheduler (periodic/on-change); route backup through background `chrome.downloads` (DD-039).
- [x] **Feedback 1a — Apply executes:** template Apply now navigates + fills + **runs** the API (`adapter.replay`); auto-restore paths still never execute. 292 tests ✓.
- [x] **Feedback 1b — "Edit Value" fix:** `autoExecute` clicks the OAS2 Edit-Value toggle when the body textarea is hidden behind it (try-or-pass: skips on versions without it; executes with the example value if it never mounts).
- [x] **Feedback 1c — Auto token refresh:** on `AUTH_EXPIRED`, `TokenRefreshService` runs the saved login template (env-preferred), extracts the token from the new 2xx response (access_token/token/jwt/…, nested), and applies + persists it via `AuthenticationService.applyToken`.
- [x] **⚠️ Re-verify Feedback 1 on real Swagger** — Apply calls the API; POST Replay/Apply fills the Edit-Value body; expired token + saved login → auto-refresh toast + fresh token in Auth tab.
- [ ] **(Future) Periodic expiry watcher** — mid-session token expiry currently only refreshes on next reload/env switch.
- [x] **Sprint 14 Part A — Hardening (automated):** EC-001…048 audit (all automatable cases covered), EC-013 toast surfacing, EC-015 body caps (`MAX_SAVED_BODY_BYTES`), Dialog focus management (WCAG 2.4.3), Swagger **3/4/5 version-matrix** suite (T-10.6), perf-target tests (search <50ms@5k, history <100ms@1k, codegen <30ms), security review evidence (0 prod vulns, no eval/innerHTML, no token logging). **317 tests ✓.**
- [ ] **Sprint 14 Part B (manual/PO):** cross-browser matrix (Chrome/Edge/Brave/Arc/Opera); keyboard/screen-reader pass; DD-033 + DD-037 sign-off (evidence in log 12); optional real 3.x/5.x Swagger spot check.
- [ ] **Wire `{{VAR}}` substitution into request populate** (resolver built; integrate into RequestService per DD-032).

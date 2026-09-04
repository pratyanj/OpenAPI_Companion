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
- [x] **Auto token refresh — toggle + 401 trigger:** opt-in checkbox in the Auth tab (default off, global flag `settings/auto-refresh-token`); `TokenRefreshService.noticeResponses` force-refreshes on any new 401/403 (covers opaque tokens + mid-session expiry), with a 15s cooldown to break login-loops. **334 tests ✓.**
- [ ] **(Future) Auto-retry the failed request** after a 401 refresh (v1 refreshes the token only; next call uses it).
- [x] **Sprint 14 Part A — Hardening (automated):** EC-001…048 audit (all automatable cases covered), EC-013 toast surfacing, EC-015 body caps (`MAX_SAVED_BODY_BYTES`), Dialog focus management (WCAG 2.4.3), Swagger **3/4/5 version-matrix** suite (T-10.6), perf-target tests (search <50ms@5k, history <100ms@1k, codegen <30ms), security review evidence (0 prod vulns, no eval/innerHTML, no token logging). **317 tests ✓.**
- [ ] **Sprint 14 Part B (manual/PO):** cross-browser matrix (Chrome/Edge/Brave/Arc/Opera); keyboard/screen-reader pass; DD-033 + DD-037 sign-off (evidence in log 12); optional real 3.x/5.x Swagger spot check.
- [x] **Feedback 2 — full paths + History ⋮ menu + wider UI:** History & ⌘K show the complete API path (wraps, no truncation); History row actions moved into a reusable `Menu` (⋮) with Replay / **Locate in Swagger** (new — jump without executing, `HistoryService.locate`) / Delete; sidebar `w-80`→`w-96`, palette dialog `size="xl"`. **324 tests ✓.**
- [ ] **⚠️ Re-verify Feedback 2 on real Swagger** — long paths fully visible in History + ⌘K; ⋮ menu Replay/Locate/Delete; Locate scrolls to the op without calling it.
- [x] **Native Side Panel — Phase 1 (read-only):** `chrome.sidePanel` opens from the toolbar; new `src/sidepanel/` React app shows project/auth/history for the active tab via a content-script message bridge (`sidepanel-protocol`). Manifest `sidePanel` perm + min-Chrome 114; popup removed. **337 tests ✓.**
- [x] **Native Side Panel — Phase 2 (interactive), replace injected:** the panel now hosts the **whole UI** — every tab (Dashboard, Auth, Requests, Environments, History, Fake Data, Settings) + ⌘K search — via `PanelShell` reusing the unchanged `PanelOutlet`. Content script is a **headless agent** (RPC dispatch + debounced state mirror + event forwarding; all always-on behaviors run there). Remote service proxies + `RemoteSwaggerAdapter` (sync reads from the mirrored cache) let real Fake Data / Productivity run panel-side; Settings/Import-Export are local over shared storage. Multi-tab safe (pushes filtered by `sender.tab.id`). `SidePanelApp` deleted; `PanelShell.test.tsx` added. **337 tests ✓.**
  - [x] Port all panels to remote/local services (Auth, Requests, Environments, Fake Data, Productivity, Settings, Dashboard).
  - [x] Remove the injected in-page sidebar mount from the content script (the "replace").
  - [x] **Open shortcuts + toggle:** keyboard command `⌘⇧O` / `Ctrl+Shift+O` (`commands`) + an in-page floating launcher button (`src/content/launcher.ts`, shows the app icon via `web_accessible_resources`) both **toggle** the panel. Toggle uses a `PANEL_PORT`: the open panel announces its window, the background tracks `openPanels` and closes via `window.close()` when re-triggered. Min Chrome 114→116 (programmatic open). **341 tests ✓.**
  - [x] **Endpoint search moved into the page:** the palette was cramped in the panel's narrow column, and the panel can't draw over the doc — so `src/content/palette.tsx` renders the unchanged `CommandPalette` as a wide, top-centered Shadow-DOM overlay on the page (`Dialog align="top"`). Triggers: ⌘K on the page (capture) + the panel's search button via a `palette.open` RPC. Lazy `import()` so non-Swagger pages don't load React. **347 tests ✓.**
  - [x] **Home tab rebuilt as a live dashboard** (`src/sidebar/Dashboard.tsx`): project/spec summary + env switcher, auth status with expiry countdown + auto-refresh state, last 5 calls (click to locate), totals, and quick actions (⌘K search / Templates / Fake data / Backup). Reads through the existing panel services and refreshes on bus events; `authStatusOf` extracted to `authentication/status.ts`; stale Sprint-3 placeholder copy removed. **356 tests ✓.**
  - [x] **Copy token in the Auth tab** — icon-only `CopyButton` next to the reveal toggle; copies the real credential even while masked. `CopyButton` gained an `iconOnly` mode so the copy behavior (feedback, cleanup, failure guard) stays in one component. **361 tests ✓.**
  - [x] **Request detail stays in the panel, but bigger** — PO asked whether it should move to the page like ⌘K; decided no (it's a drill-down of the list you clicked, an overlay would hide the doc being compared, and the bodies live panel-side). Instead: `Dialog size="full"` so it uses the panel's full width (and grows when the panel edge is dragged wider), body box `min-h-14vh/max-h-62vh` instead of a short fixed box, and a **wrap toggle** (on by default) so long tokens don't need sideways scrolling. **362 tests ✓.**
  - [x] **FastAPI `/docs` support** — PO asked whether FastAPI works. Detection did (it has `<div id="swagger-ui">`), but auth read/write/logout + specUrl did **not**: FastAPI's template does `const ui = SwaggerUIBundle(...)` (verified in the installed `fastapi/openapi/docs.py:131`), a global *lexical* binding that is **not** `window.ui`. New `src/content/swagger-ui-global.ts` resolves the system object from `window.ui` first, then via a typeof-guarded free identifier (a module's scope chain ends at the same global environment), with a shape guard so an unrelated global named `ui` is ignored. Build asserts the minifier doesn't rename the free identifier. **367 tests ✓.**
  - [ ] **⚠️ Verify on a real FastAPI page:** auth capture + auto-restore on `localhost:8000/docs` (the lexical-binding path can't be unit-tested — jsdom won't create a global `const`).
  - [x] **Environment Base URL now does something** — PO asked why the field exists; it was **write-only** (seeded, edited, displayed, read by nothing), while copy-as-code used `location.origin`. Generated code (cURL/Fetch/Axios) now uses the active environment's Base URL, falling back to the page origin; `ProductivityService.baseUrl` accepts a getter so a switch/edit applies immediately (refreshed on ENVIRONMENT_CHANGED and after `environments.update`, which publishes no event). Trailing slash trimmed. Panel now states the limitation: Swagger's own Execute still calls the spec's server. **369 tests ✓.**
  - [x] **Named token vault** (PO request) — save the authorized credential under a name (Admin / Manager / read-only) and switch accounts with one click instead of re-authorizing in Swagger. Per-project storage (`project/<id>/auth-vault/<id>`), id derived from the name so re-saving updates that slot; activating injects into Swagger **and** becomes the environment's active record. Copy + delete per entry; the active one is flagged "In use". Wired through the panel↔page RPC bridge. **383 tests ✓.**
  - [x] **History records repeat calls** — dedup keyed on response content dropped a genuine second call with an identical result (replays too). `observeExecutions` reports Execute clicks; `noticeExecution` invalidates the guard. Detail view gained Replay / Locate buttons and an "N calls to this endpoint" timeline.
  - [x] **Multi-account tokens** — each saved token can carry its own email + password; refresh signs that account back in and rewrites only its token. The credential in use is recorded explicitly (token-string matching kept breaking). "+ Add account" signs in and stores the issued token under a name. Login endpoint selection is strict (a loose `auth` match once fired POST /auth/forgot-password); the panel names the target before you save. Refresh activity is logged in-panel with a "Refresh now" trigger. Passwords are redacted from exports. **407 tests ✓. Released v0.1.2.**
  - [x] **Bearer prefix preserved** — apiKey schemes carry the token as `Authorization: Bearer <jwt>`, but a refreshed token is raw. applyToken now re-applies the previous token's `Bearer ` prefix (add-account inherits it from sibling credentials), and JWT expiry is parsed through the prefix. Fixes refresh 401-ing on Bearer apiKey schemes. **412 tests ✓.**
  - [x] **"Refresh now" works with the toggle off** — the manual test button was gated by the auto-refresh enable flag, so it logged "Auto-refresh is turned off" and did nothing. It now bypasses the enable gate and the cooldown (that's its whole purpose). Add-account persistence confirmed working end-to-end (signIn + addCredential). **413 tests ✓.**
  - [x] **Bearer-prefix toggle** — Auth panel checkbox "Send token as Bearer <token>" (per project, defaults to what the current token uses). Off → authorizes with the raw token; on → `Bearer <token>`. Governs applyToken / activateSaved / addCredential (refresh, switch, add), and re-applies the token in use immediately. "In use" badge compares ignoring the prefix. **417 tests ✓.**
  - [x] **Auth actually lands in Swagger's Authorize box** — the write was routed by our stored `type`, so an apiKey scheme holding a JWT (type inferred as jwt) went through `authorize()` with a reconstructed http/bearer schema that Swagger ignores → empty box. New `planAuthWrite` reads the API's REAL security definitions from Swagger's state and routes accordingly: apiKey → `preauthorizeApiKey` (full value incl. "Bearer "), http-bearer → `authorize` with the real schema and the raw token. Retries as the spec loads. **422 tests ✓.**
  - [x] **Auth write reads schemes from the SPEC, not `auth.definitions`** — v0.1.6 routed by security schemes but read them from `state.auth.definitions` (empty in real builds), so every scheme looked absent and apiKey writes fell back to the http/bearer path → Authorize box stayed empty. `securityDefinitionsFrom` now reads OAS2 `securityDefinitions` / OAS3 `components.securitySchemes` (resolved + raw), falling back to `auth.definitions`. Also removed a stray NUL byte in main-world.ts that made git treat it as binary. **427 tests ✓.**
  - [ ] **⚠️ Verify in real browser:** every tab interactive in the native panel; nothing renders inside the Swagger page except the floating launcher + the ⌘K overlay; toolbar / `⌘⇧O` / launcher all toggle the panel; ⌘K opens the top-centered palette in the correct theme.
  - [ ] **Post-fix:** panel showed "No OpenAPI page connected" — root cause was missing `host_permissions` (panel→page `tabs.sendMessage` needs host access; `activeTab` doesn't survive tab switches). Added `host_permissions: http/https` + empty-state self-heal on the agent's first push. Boot diagnostics logged to the page/panel console.
  - [x] **Wire `{{VAR}}` substitution into request populate & dynamic system variables** (DD-032) — built-in dynamic variables (`{{$uuid}}`, `{{$timestamp}}`, `{{$isoDate}}`, `{{$randomEmail}}`, `{{$randomName}}`, etc.) + `resolveVariables` wired into `RequestService.restore`, `applyTemplate`, and `locateAndFill` for request bodies, path parameters, query parameters, and headers. **466 tests ✓.**
- [x] **Project Variables Manager (Streamlined from legacy Environments):**
  - [x] Removed redundant `Local`, `QA`, `Staging`, `UAT`, `Production` presets, cross-site jump confusion, and header switcher. Projects already map 1-to-1 with webpage origins/domains.
  - [x] Direct **Project Variables** tab (`.env`): instantly view, add, edit, and save project variables without detached forms or "name already exists" errors.
  - [x] Dual-mode editing: Table view + Raw `.env` editor (multi-line paste/edit: `KEY=value`).
  - [x] Secret masking (`••••••••`) with one-click peek toggle and 1-click credential copy.
  - [x] Exact `.env` file export (`application/octet-stream`, no `.txt` suffix) and Postman JSON export.
  - [x] Import from `.env` and Postman JSON with auto-secret detection (**482 tests ✓**).
- [x] **Project Variables Upgrades — Phase B: Workflow & Instant Chaining:**
  - [x] **1-Click "Save to Variable" from API History & Response Inspector**:
    - In `HistoryDetail` response viewer / headers viewer, click any JSON value or header to open a quick "Save to Variable" popover.
    - Suggests target variable name (e.g. `access_token` -> `TOKEN` / `ACCESS_TOKEN`, `id` -> `USER_ID`, etc.) or custom variable name.
    - Saves directly into active Project Variables with automatic secret detection (e.g. tokens/passwords marked as secret).
    - Emits `ENVIRONMENT_CHANGED` to notify all panels and Swagger injectors immediately.
  - [x] **Live Variable Autocomplete (`{{`) in Requests & Templates**:
    - Interactive autocomplete popup triggered by typing `{{` in request body textareas, header values, path/query parameter inputs, and template editors.
    - Lists both Project Variables (`{{TOKEN}}`, `{{API_KEY}}`, etc.) and built-in Dynamic Variables (`{{$uuid}}`, `{{$timestamp}}`, `{{$randomEmail}}`, etc.).
    - Keyboard navigation (ArrowUp, ArrowDown, Enter/Tab, Escape) with variable value preview.
  - [x] **Resolved Variable Preview & Missing Variable Alert**:
    - Hover preview over any `{{VAR}}` showing its real-time resolved value.
    - Warning badge when a request template references an undefined variable with 1-click "Add Variable" prompt (**495 tests ✓**).
- [x] **Request Presets: Path & Query Parameters & Swagger Auto-Population:**
  - [x] **Swagger Example & Parameter Auto-Population**:
    - Automatic fetching of example request bodies and declared/filled path and query parameter defaults from Swagger operation DOM into preset editor.
    - One-click "⚡ Load from Swagger" action button with live visual feedback.
  - [x] **Path Parameters Builder & Required Field Validation**:
    - Automatic detection of `{param}` placeholders in endpoint paths (e.g. `/teams/{team_id}/members/{user_id}/promote` -> `{team_id}`, `{user_id}`).
    - Dedicated parameter inputs supporting `{{VARIABLE}}` substitution with required-field validation.
    - Real-time resolved path and full URL preview.
  - [x] **Query Parameters Builder**:
    - Dynamic key-value query parameter editor (`+ Add Query Param`, remove, variable substitution).
    - Live URL query string preview (`/users?role=admin&limit={{LIMIT}}`).
  - [x] **Full Execution & Locate Integration**:
    - Inject path parameters and query parameters into Swagger UI input rows during both "Replay" (autoExecute) and "Locate & Fill".
    - Badges on preset cards (`2 path`, `2 query`) and expanded details view (**526 tests ✓**).
- [ ] **Project Variables Upgrades — Phase C: Automation & Cross-Project Power:**
  - [ ] **Auto-Extraction Rules (Zero-Click Token Chaining)**:
    - Rule builder to automatically capture response values (e.g., `POST /auth/login` -> extract `response.token` into `TOKEN`).
  - [ ] **Global Variables Hierarchy (Cross-Project Shared Variables)**:
    - Cross-project shared variables (`MY_EMAIL`, `DEFAULT_PAGE_SIZE`, etc.) accessible in every Swagger doc, overridden by Project Variables.
  - [ ] **Variable Usage & Formatter Utilities**:
    - cURL header copy with resolved variables and unused variable detector.


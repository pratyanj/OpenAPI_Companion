## 🚀 Next Version Sprint (v1.2.0 Action Items & Feature Roadmap)

- [x] **1. 🔌 Localhost & Port Resilience / Project Switcher & Host Aliasing (with Custom Project Naming)**
  - **Problem**: When a backend restarts on a different port (e.g. `8008` -> `8009` because 8008 was in use), or when switching between `localhost:8008`, `127.0.0.1:8008`, and local network IP `192.168.x.x:8008`, all project data (saved presets, request templates, project variables, workflow suites, headers, and history) appears lost because project IDs are derived strictly from `origin + openApiUrl`.
  - **Implemented Solution**:
    - **Smart Localhost & Loopback Grouping**: Added `isLocalHost`, `normalizeLocalOrigin`, and `extractPort` utilities to normalize `localhost`, `127.0.0.1`, `0.0.0.0`, and private IPv4 ranges (`192.168.x.x`, `10.x.x.x`, `172.16-31.x.x`).
    - **Persistent Origin Bindings**: Implemented atomic origin bindings map in storage (`meta/project-bindings`) that maps origins/ports directly to primary project IDs without data duplication.
    - **Candidate Project Detection**: Content agent scans for existing projects on other ports or matching OpenAPI specs when a new port is opened and passes candidate metadata to the panel.
    - **Port Change Alert Banner**: Built `PortChangeBanner` offering 1-click `Link to Port` (immediate aliasing and page reload) and `Copy Data` actions.
    - **Header Project Switcher Modal**: Added a searchable project switcher dialog accessible via header badge button (`[ 📁 Project Name ▾ ]`) and Dashboard, allowing developers to switch views, link origins, unlink origins, copy data, or dismiss links.
    - **Custom Project Naming & Inline Renaming**: Added custom project naming from OpenAPI spec `info.title`, plus inline ✏️ rename on Dashboard and in the Project Switcher Modal with `PROJECT_UPDATED` event reactivity across the panel (**831 tests passed**).

- [x] **2. ⚖️ Side-by-Side Response Diff / Comparator**
  - **Problem**: Developers frequently test API behavior between two calls (e.g. comparing a baseline response with a modified payload, before/after migration, or comparing staging vs local) and currently have to manually eye-ball JSON differences.
  - **Delivered Solution**:
    - **Algorithmic Diff Engine (`src/utils/diff.ts`)**: Pure TypeScript Myers/LCS line diff (`computeLineDiff`) producing aligned side-by-side rows and unified diff lines; recursive JSON key-path comparator (`computeJsonDiff`); case-insensitive HTTP header delta comparator (`compareHeaders`); and metrics comparator (`compareMetrics`) for latency ms/% delta and payload byte size.
    - **Interactive Diff Modal (`src/modules/history/ResponseDiffModal.tsx`)**: Dual split-pane view with synchronized side-by-side scrolling (`leftScrollRef` + `rightScrollRef`) and single-column unified diff view with toggle button and "Only changes" filter.
    - **Header & Metrics Summary**: Visual status code comparison pill badges (`200 OK` vs `500 Server Error`), latency comparison with delta (`+45 ms (+32.1%)`), and response byte size delta (`+1.2 KB`).
    - **Four Comparison Tabs**: Response Body, Request Body, Header Delta (Added/Removed/Changed), and Query/Path Parameters.
    - **Seamless Entry Points**:
      - "Compare" toggle in `HistoryPanel` search bar enabling checkbox multi-select mode to compare any 2 executions.
      - "Compare latest 2 calls" in endpoint item dropdown menu.
      - Top-level "Compare" action in `HistoryDetail` and `HistoryDetailModal` headers to compare baseline against previous call.
      - Inline 1-click `Compare` icon buttons on every sibling call in the timeline.
      - Quick Baseline (A) / Comparison (B) dropdown selectors and Swap (`⇄`) button inside the modal.
    - **Validated**: 90 test files, **848 tests passing (100%)**, zero lint or formatting issues, production build passing cleanly.

- [x] **3. ⏰ Automated Backup Scheduler & Smart Merge Import**
  - **Problem**: Manual backups are easy to forget. If browser storage is cleared, data could be lost. Furthermore, importing a backup previously only offered "Replace All" or "Keep Existing", which could overwrite or drop newer presets.
  - **Delivered Solution**:
    - **Automated Periodic Backup Scheduler**: Manifest V3 `chrome.alarms` background scheduler with configurable frequencies (`Off`, `Every 30 minutes`, `Every 2 hours`, `Every 6 hours`, `Every 12 hours`, `Daily (24h)`, or `Custom minutes`), with automatic alarm synchronization on settings save, browser startup, or extension update.
    - **Smart Delta Detection ("Skip if unchanged")**: Queries storage envelope `updatedAt` timestamps across all keys before downloading; skips redundant backup operations if zero mutations occurred since the last backup.
    - **Universal Downloader & Descriptive Naming**: Standardized backup naming convention `openapi-companion-backup-YYYY-MM-DD-HHmm.json` (or `openapi-companion-project-<slug>-backup-YYYY-MM-DD-HHmm.json`), using `chrome.downloads.download` in MV3 background service workers with DOM anchor fallback in UI contexts.
    - **Smart Deep Merge Mode (`mode: 'merge'`)**: Entity-level deep merging for request presets, workflows, custom headers, auto-extraction rules, and environments. Conflicting entity names are automatically renamed with an `(Imported)` suffix and assigned fresh UUIDs, preventing data loss.
    - **Pre-Import Safety Snapshot & 1-Click Rollback ("Undo Import")**: Automatically captures an atomic pre-import storage snapshot before modifying storage. Displays a persistent "Restore Point Available" alert banner with a 1-click "Undo Import" button.
    - **Granular Selective Import Checklist**: Interactive category selection checklist (Projects & Metadata, Request Presets, Workflows, Custom Headers, Extraction Rules, Environments & Variables, Application Settings) allowing developers to selectively import only what they need.
  - **Validated**: 92 test files, **865 tests passing (100%)**, 0 TypeScript errors, clean ESLint & Prettier checks, production build and Firefox package passing cleanly.

- [x] **4. 🛡️ Asynchronous Swagger UI Mounting Observer**
  - **Problem**: On single-page applications (SPAs) or frameworks like FastAPI, Springdoc, NestJS, and Next.js where Swagger UI renders dynamically after initial script execution or API spec download, OpenAPI Companion could occasionally initialize too early, showing a dormant state or missing button injections until a manual page refresh.
  - **Delivered Solution**:
    - **Fast Path Detection**: Instant 0ms synchronous boot if Swagger UI containers or meta tags are already present in the DOM on script execution (`isSwaggerPresent`).
    - **Dynamic Mounting Observer (`src/content/swagger-mount-observer.ts`)**: 3.5s non-blocking `MutationObserver` window (`waitForSwaggerMount`) monitoring `childList` and `subtree` mutations on `document.documentElement` for `#swagger-ui`, `.swagger-ui`, `.swagger-container`, `#swagger-ui-container`, `.swagger-ui-wrap`, and `meta[name="swagger-ui"]`. Automatically disconnects immediately upon mount detection or timeout expiry without performance overhead.
    - **SPA Client-Side Route Navigation Watcher (`watchSpaNavigation`)**: Hooks browser History API (`history.pushState`, `history.replaceState`) and listens to `popstate` and `hashchange` events to detect dynamic client-side route transitions into Swagger API documentation paths without full page reloads.
    - **Idempotent Mutex Boot Guard (`bootAgent`)**: Guarantees atomic single-boot execution using internal state flags (`isBooting`, `isBooted`) and DOM container dataset markings (`dataset.oacAgent = 'booted'`), preventing duplicate adapters, duplicate button bars, or memory leaks.
    - **Broadened Adapter Detection (`SwaggerUiAdapter.detect`)**: Enhanced container queries with expanded selector fallbacks to recognize modern framework wrappers.
    - **Comprehensive Unit Testing**: Added 18 unit tests in `src/content/swagger-mount-observer.test.ts` covering synchronous fast path, asynchronous mutation detection, timeout handling, observer disconnection, and History API wrappers.
  - **Validated**: 93 test files, **887 tests passing (100% green)**, 0 TypeScript compiler errors, clean ESLint, 100% Prettier formatting, production Vite build and Firefox bundle passing cleanly.

- [x] **5. ⌨️ Customizable Keyboard Shortcut Manager**
  - **Problem**: In-page shortcuts (<kbd>Alt+M</kbd> for Mock Data, <kbd>Alt+L</kbd> for Last Sent Payload, <kbd>Alt+Shift+F</kbd> for Format JSON, <kbd>Ctrl+Shift+V</kbd> for Paste cURL, <kbd>⌘K</kbd> for Palette) are powerful but not discoverable enough or remappable for developers with conflicting browser, OS, or extension shortcuts.
  - **Delivered Solution**:
    - **In-Page Shadow DOM Modal (`#oac-shortcuts-host`)**: Spacious top-centered dialog (640px+) rendered in the active Swagger page without CSS contamination, fully synchronized with `ThemeManager` (`light`, `dark`, `system`).
    - **Custom Key Recorder**: Interactive live recorder capturing modifiers (<kbd>Ctrl</kbd>, <kbd>Alt</kbd>, <kbd>Shift</kbd>, <kbd>Meta/Cmd</kbd>) and keypresses with platform-aware formatting (<kbd>⌘</kbd>, <kbd>⌥</kbd>, <kbd>⇧</kbd> on macOS vs <kbd>Ctrl</kbd>, <kbd>Alt</kbd>, <kbd>Shift</kbd> on Windows/Linux).
    - **Safety & Conflict Detection**: Protects reserved browser combinations (<kbd>Ctrl+W</kbd>, <kbd>Ctrl+T</kbd>, <kbd>Ctrl+N</kbd>, <kbd>F5</kbd>, <kbd>F12</kbd>, etc.) and flags same-context key conflicts with an interactive resolution banner offering 1-click **Swap Bindings** or **Override**.
    - **Dynamic Content Script Reactivity**: Listens to `SHORTCUTS_CHANGED` bus events across tabs so remapped keys apply immediately without page reload in `swagger-mock-data`, `swagger-endpoint-history`, `swagger-paste-curl`, and global command palette listeners.
    - **Multi-Entry Access**:
      - "Configure Shortcuts..." action button in Side Panel Settings tab.
      - Direct Keyboard icon button in Side Panel header.
      - In-page trigger (<kbd>?</kbd> or <kbd>Ctrl+/</kbd> when not typing in inputs/textareas).
      - RPC Bridge (`shortcutsModal.open`).
    - **Granular Reset Controls**: 1-click per-shortcut reset to default bindings and a global "Reset All to Defaults" action.
  - **Validated**: 96 test files, **917 tests passing (100% green)**, 0 TypeScript compiler errors, clean ESLint, 100% Prettier formatting, clean production Vite build and Firefox bundle.

- [ ] **6. 📋 Pre-Public Repository Hygiene (Quick Check-offs)**
  - Fill placeholder tokens before public open-sourcing:
    - `LICENSE`: Set copyright holder.
    - `SECURITY.md`: Replace `security@TODO-set-project-domain`.
    - `CODE_OF_CONDUCT.md`: Replace `conduct@TODO-set-project-domain`.
    - `.github/CODEOWNERS`: Replace `@OWNER`.
    - `.github/ISSUE_TEMPLATE/config.yml`: Replace `OWNER/REPO` security URL.

## 🎯 Prior Sprints & Completed Features
- [x] **1. 🐛 Fix Request Capture for No-Body Endpoints (Path/Query Only) & Rename to "Capture Live"**
  - **Issue**: In Requests tab, "Capture Open" button fails to capture endpoints that have only path parameters and query parameters with no JSON request body (e.g. `POST /tasks/{task_id}/labels/{label_id}`).
  - **Fix**: Update capture parser to extract path parameters from Swagger inputs (`input[data-param-name]`) and query parameters even when no body schema exists.
  - **UI**: Rename button from `"Capture Open"` to `"Capture Live"` with live sync icon and informative tooltip.

- [x] **2. Protected Backup Export & Restore with Passphrase Encryption (AES-GCM)**
  - **Issue**: Backups previously either exposed credentials in plain text or redacted passwords to prevent leaks, preventing teammates from sharing credentials in backups.
  - **Feature**: Added optional passphrase encryption using Web Crypto (`AES-GCM` 256-bit + `PBKDF2` 100,000 iterations).
  - **Export**: Entering a passphrase preserves account passwords (`login.password`) and encrypts the entire backup bundle. Leaving it empty preserves safe redacted export.
  - **Import / Restore**: Automatically detects encrypted backup bundles and prompts for the passphrase to decrypt credentials, preview contents, and restore safely (**601 tests passed**).
- [x] **3. ⚡ Debounced Variable Autosave (Smooth Typing, No Per-Keystroke Storage Churn)**
  - **Issue**: Previously, in the project variable editor, typing immediately set the saving spinner and queued rapid storage writes on every keystroke, causing UI flicker, partial saves ("p", "pa", "pas"), and race conditions when self-published `ENVIRONMENT_CHANGED` events triggered reloads mid-typing.
  - **Fix**:
    - Removed premature `setSaving(true)` on keydown so typing is completely smooth and fluid without spinner flickering.
    - Added a 450ms debounce timer that automatically resets on each keystroke, saving only when the user finishes typing.
    - Added instant flush on `onBlur` and <kbd>Enter</kbd> (`handleKeyDown`) on both variable name and value fields in Table mode and Raw `.env` editor.
    - Added `isLocalSavingRef` to ignore self-emitted `ENVIRONMENT_CHANGED` events during local saves, preventing inputs from resetting mid-keystroke.
    - Enhanced visual feedback: displays subtle spinner only during actual background persistence, followed by a reassuring green `Saved ✓` badge for 2 seconds (**601 tests passed**).

- [x] **4. 🚀 Direct Variable Resolution inside Native Swagger UI (`{{variable}}`)**
  - **Feature**: Allow developers to type `{{variable}}` placeholders directly into Swagger UI inputs (parameters, query, headers, and request body) on the webpage.
  - **Dual-Layer Architecture**:
    - **Interactive DOM Layer (`swagger-variables.ts`)**:
      - Live autocomplete popup in Shadow DOM triggered by typing `{{` in any Swagger UI input/textarea with keyboard navigation (<kbd>↑</kbd>, <kbd>↓</kbd>, <kbd>Enter</kbd>, <kbd>Tab</kbd>, <kbd>Esc</kbd>) for project variables and dynamic variables (`{{$uuid}}`, `{{$timestamp}}`, etc.).
      - Auto-resolves inputs in-place on native `.btn.execute` click via `setNativeValue` so Swagger's form state updates before execution.
    - **Network Interceptor Layer (`main-world.ts`)**:
      - Hooks `window.fetch`, `XMLHttpRequest`, and Swagger UI's `requestInterceptor` in the MAIN execution world.
      - Resolves `{{VAR}}`, case-insensitive variables, dynamic variables, and URL-encoded `%7B%7BVAR%7D%7D` placeholders across request URLs, headers, and request bodies before HTTP calls leave the browser (**615 tests passed**).

## 🚀 Swagger UI In-Page Enhancements Sprint (13 Points)

- [x] **1. 🪄 1-Click "Fill Realistic Mock Data" (Request Body)**
  - **Feature**: Injected a subtle floating button bar (`.oac-mock-data-bar`) directly above Swagger UI's request body textarea (`textarea.body-param__text`) without cluttering Swagger's layout.
  - **1-Click Generation**: Main button (`🪄 Fake Data`) reads either existing JSON in the textarea or Swagger's rendered schema/example (`readSwaggerExample`), parses and synthesizes realistic values (realistic names, emails, phones, dates, UUIDs, and contextual strings) via `synthesizeFromJsonSample`, and writes React state via `setNativeValue`.
  - **Multi-Mode Support**: Included mode selector dropdown (`✨ Realistic`, `⚡ Minimal`, `⚠️ Boundary`, `🧪 Fuzzing`).
  - **Keyboard Shortcut**: Added <kbd>Alt+M</kbd> shortcut while focused inside any Swagger body textarea to instantly generate and fill mock data.
  - **Visual Feedback**: Displays smooth status animations (`✓ Filled!` in green / `⚠️ No Schema` in amber) (**625 tests passing**).
- [x] **2. ⚡ 1-Click "Save Response Property to Variable" from Swagger Response DOM**
  - **Feature**: Injected a sleek `⚡ Save to Variable` button directly into Swagger UI's rendered live responses (`.live-responses-table .response-col_description`) alongside Swagger's native controls.
  - **In-Page Shadow DOM Overlay (`#oac-save-variable-host`)**: Mounts `SaveToVariableDialog` in an isolated top-centered modal overlay over Swagger UI, with candidate properties (`access_token`, `user_id`, `id`, etc.) automatically detected and pre-suggested.
  - **Text Selection & Property Support**: Supports selecting text inside the response body before clicking to pre-fill the selected value.
  - **Auto-Sync & Visual Feedback**: Saving immediately persists into active Project Variables, publishes `ENVIRONMENT_CHANGED`, and gives instant `Saved ✓` visual confirmation (**632 tests passing**).
- [x] ~~**3. ⏱ Response Latency & Timing Benchmark Badge next to Response Code**~~ *(Removed: Omitted to keep Swagger response rendering completely lightweight without extra UI listeners)*
- [x] **4. 🧹 1-Click JSON Formatter & Syntax Validator on Request Body**
  - **1-Click JSON Prettification**: Auto-formats request body JSON with 2-space indentation via toolbar button or <kbd>Alt+Shift+F</kbd> shortcut.
  - **Smart Auto-Repair Engine**: Automatically detects and heals common developer editing syntax errors on format (unclosed string literals, trailing commas, single quotes, unquoted keys, Python literals, comments, missing commas).
  - **Zero-Clutter Dynamic UI**: Automatically hides the `Format JSON` button when the JSON is already formatted or empty, only appearing when formatting is needed, and hides immediately after formatting.
  - **Non-Truncating Live Syntax Validator**: Displays clean red error banner on invalid JSON with exact error message, line, and column numbers; completely hidden when JSON is valid or empty. Never shows error text inside button label.
  - **SVG-Only System Stability**: Replaced all emojis across content scripts with crisp SVG vector icons to prevent system/font crashes (**662 tests passing**).
- [x] **5. 🔁 "Re-fill Last Sent Payload" (Endpoint Quick History)**
  - **1-Click Refill**: Instantly restores the exact path, query, header parameters and JSON request body used in the previous execution of any endpoint.
  - **Dual-Location Integration**:
    - Request body toolbar (`.oac-mock-data-bar`): Injected directly above the body textarea alongside Format JSON and Fake Data.
    - Execute wrapper (`.execute-wrapper`): Injected next to native Execute & Clear buttons, covering parameter-only endpoints (GET, DELETE, HEAD) as well as POST/PUT.
  - **Cross-Session Storage Persistence**: Automatically persists the last sent payload per endpoint in extension local storage (`chrome.storage.local` with memory cache) so previous payloads survive page reloads and tab closures.
  - **Zero-Clutter Dynamic UI**: Auto-hides when no previous execution exists for an endpoint, becoming smoothly visible as soon as an execution is performed or loaded from storage.
  - **Keyboard Shortcut**: Added <kbd>Alt+L</kbd> shortcut inside any Swagger operation to immediately restore the last sent payload.
  - **Clean Status Feedback & SVG Icons**: Flashes green `Restored` status with SVG checkmark on click; never displays error text inside button label (**669 tests passing**).
- [x] **6. 👤 Active Account & Token Expiry Status Badge next to Swagger Authorize**
  - **In-Page Status Badge**: Injected directly alongside Swagger UI's native `.auth-wrapper` and Authorize padlock button without layout disruption.
  - **Smart Identity Resolution**: Automatically detects and displays the active account name and role tag from the credential vault or decoded JWT claims (`role`, `name`, `preferred_username`, `email`, `sub`).
  - **Real-Time Live Expiry Countdown**: Active timer dynamically counts down token lifetime (`Expires in 14m`, `Expiring in 45s`, `Expired 2m ago`, or `Active`), transitioning through color themes (green -> amber -> soft red).
  - **1-Click Token Renewal**: Embedded `Renew` button triggers `TokenRefreshService.refreshNow()` with spinning SVG feedback and confirmation; never shows error text in button labels.
  - **100% SVG Vector Icons**: Strict zero-emoji compliance using clean inline SVGs (`user`, `clock`, `refresh`, `check`, `key`) (**686 tests passing**).
- [x] **7. 1-Click Multi-Account / Role Switcher in Swagger Header**
  - **Feature**: Compact dropdown in the Swagger header to switch between accounts (Admin, Staff, Customer) and re-authorize Swagger instantly.
- [x] **8. 🔍 Response JSON Search & Node Collapsing**
  - **Interactive Collapsible JSON Tree**: Automatically mounts an expandable/collapsible JSON tree on rendered Swagger response bodies with type-based syntax coloring (keys, strings, numbers, booleans, null) and summary badges (`{ 4 keys }`, `[ 12 items ]`).
  - **Real-Time Keyword Search**: Fast query filtering with active match counter (`2 / 5 matches`), previous/next navigation buttons, and keyboard shortcuts (<kbd>Enter</kbd> / <kbd>Shift+Enter</kbd>).
  - **Auto-Expansion on Match**: Automatically expands any collapsed parent and ancestor nodes when search matches are located inside them, scrolling the active match into view.
  - **Tree vs. Raw View Switcher**: 1-click segmented toggle (`[ Tree | Raw ]`) allows switching back to Swagger UI's native pre block at any time without page reload.
  - **1-Click Copy Actions**: Formatted 2-space indented JSON copy with SVG check feedback, plus 1-click JSON path copy (e.g. `items[0].name`) when clicking any property key.
  - **Config Tab & Feature Toggle**: Integrated toggle `responseJsonSearch` into extension settings and the Config tab with instant classList toggling (`.oac-disable-response-json-search`).
  - **100% SVG Icons & Stability**: Strict zero-emoji compliance using clean inline SVGs (**710 tests passing**).
- [x] **9. Multi-Language "Copy Code" Dropdown (cURL, PowerShell, Fetch, Axios, Python)**
  - **Feature**: Injected a sleek `[ Copy Code ▾ ]` dropdown button directly alongside Swagger UI's native Curl block (`.curl-command`) next to `<h4>Curl</h4>` and Swagger's native clipboard button without layout disruption.
  - **5 Supported Languages & Frameworks**:
    - **cURL (Bash / Linux / macOS)**: Pure cURL with escaped parameters and headers.
    - **cURL (PowerShell)**: Native `Invoke-RestMethod` with hashtable headers and PowerShell escaped quotes.
    - **JavaScript (Fetch API)**: Async `fetch()` with method, parsed headers, and JSON stringified body.
    - **JavaScript (Axios)**: Async `axios()` configuration object with lowercase method and data payload.
    - **Python (Requests)**: Idiomatic Python `requests` code formatting JSON bodies into native Python dictionary literals (`True`, `False`, `None`, lists, dicts) or raw data payloads.
  - **Accurate cURL Parser**: `parseCurlCommand` extracts exact method, resolved URL (including path/query parameters), headers, and request body directly from Swagger UI's executed Curl block.
  - **Clipboard Copy & Visual Confirmation**: 1-click copy with animated SVG checkmark feedback (`Copied Python!`, `Copied Fetch!`) for 1.8s, plus outside-click dismissal.
  - **Config Tab & Feature Toggle**: Integrated toggle `copyCodeSnippet` into extension settings and the Config tab with instant classList toggling (`.oac-disable-copy-code-snippet`).
  - **100% SVG Icons & Stability**: Strict zero-emoji compliance using clean inline SVGs (**723 tests passing**).
- [x] **10. Export Response as JSON or CSV File**
  - **Feature**: 1-click export actions in rendered response toolbars (`.oac-resp-export-btn`) and fallback action bars to instantly download API responses as formatted `.json` or RFC 4180-compliant `.csv` files.
  - **RFC 4180 Compliant CSV Engine (`export-utils.ts`)**:
    - Automatic tabular data extraction from arrays of objects and nested collection envelopes (`items`, `data`, `results`, `records`, etc.).
    - Robust escaping for commas, quotes (`""`), and newlines, plus UTF-8 BOM (`\uFEFF`) prefixing for native compatibility with Microsoft Excel and Google Sheets.
    - Gracefully disables CSV export and provides helpful tooltips when response payloads are non-tabular.
  - **Sanitized Filename Generator**: Generates clean, informative filenames like `get_tasks_2026-09-17.json` or `get_tasks_2026-09-17.csv` derived from HTTP method, cleaned endpoint path, and timestamp.
  - **Dual-Mode Integration**:
    - **Response Viewer Toolbar**: Sleek `[ Export ▾ ]` dropdown integrated into the dark response viewer toolbar alongside `Copy JSON` and mode toggles.
    - **Standalone Fallback Bar**: Mounts compact `[ JSON ]` and `[ CSV ]` export buttons on `.response-col_description` if interactive tree view is toggled off in settings.
  - **Config Tab & Feature Toggle**: Integrated toggle `responseExport` into extension settings and the Config tab with instant classList toggling (`.oac-disable-response-export`).
  - **100% SVG Icons & Stability**: Strict zero-emoji compliance using clean inline SVGs (**746 tests passing**).
- [x] **11. ⭐ Endpoint Favorites / Pinning to Top**
  - **Star Icon Placement**: Placed directly to the left of the HTTP method badge (`★ [GET] /tasks/`) on Swagger operation headers.
  - **Accordion Isolation**: Clicking the star prevents event propagation and default actions so the operation accordion never toggles.
  - **Pinned Operations Tray**: Compact Quick-Access Cards grid rendered at the top of Swagger UI above the first tag section.
  - **1-Click "Jump & Open"**: Clicking any card or its "Open" button smoothly scrolls down, auto-expands the collapsed accordion, and applies a prominent pulse highlight animation (`.oac-pulse-highlight`).
  - **Real-Time Synchronization**: Directly integrated with `ProductivityService`, `FAVORITE_TOGGLED` event bus, Command Palette, and side panel.
  - **Zero Clutter**: Tray automatically hides when 0 items are favorited.
  - **Config Tab & Feature Toggle**: Integrated toggle `pinnedEndpoints` in settings and Config panel with `.oac-disable-pinned-endpoints`.
  - **100% SVG Icons & Stability**: Strict zero-emoji compliance using clean inline SVGs (**82 test files, 757 tests passing**).
- [x] **12. 📋 Paste cURL to Auto-Fill Operation**
  - **Header & Keyboard Entry Points**: Injected sleek `[ 📋 Paste cURL ]` action button in Swagger UI header, plus global `Ctrl+Shift+V` / `⌘+Shift+V` shortcut handler.
  - **Robust cURL Parser (`curl-parser.ts`)**: Extracts HTTP method, full URL, path, query parameters, headers, and request body with multi-line continuations, Windows PowerShell backtick support, and pretty JSON formatting.
  - **OpenAPI Route Matcher (`endpoint-matcher.ts`)**: Matches raw URLs and nested route segments against templated OpenAPI paths (e.g. `/tasks/42` -> `/tasks/{task_id}`) and extracts path parameter values into dictionaries.
  - **Interactive Modal & Real-Time Preview**: Displays method badge, matched endpoint badge, extracted path/query parameters pills, and formatted request payload preview with 1-click `[ Paste from Clipboard ]` integration.
  - **1-Click Auto-Fill Execution**: Automatically scrolls to and expands the matched endpoint, clicks "Try it out", fills path and query parameters, populates request body textarea, and highlights with `.oac-pulse-highlight`.
  - **Config Tab & Feature Toggle**: Integrated toggle `pasteCurl` into settings and Config panel with `.oac-disable-paste-curl` (12/12 active features).
  - **100% SVG Icons & Stability**: Strict zero-emoji compliance using clean inline SVGs (**85 test files, 776 tests passing**).
- [x] **13. 🌐 Global Debug Headers Injector**
  - **Persistent Header Storage & Service (`HeadersService`)**: Built per-project key-value store (`projects/<projectId>/global-headers`) supporting enable/disable toggles, add/delete header rules, and active record export.
  - **MAIN-World Multi-Channel Network Interception**: Injected global headers across Swagger's `requestInterceptor`, native `window.fetch`, and `XMLHttpRequest`, with priority over operation defaults and dynamic variable interpolation (`{{VARIABLE}}`, `{{$uuid}}`, `{{$timestamp}}`).
  - **Swagger UI Quick Action Bar Button**: Mounted clean `[ Headers ]` action button beside `[ Paste cURL ]` in `.oac-header-actions-bar` with an active count badge (`Headers (N)`).
  - **Dark-Themed In-Page Management Modal**: Modal matching Swagger/OAC dark slate theme (`#0f172a`, `#1e293b`), quick preset chips (`+ X-Tenant-ID`, `+ X-Debug`, `+ Accept-Language`, `+ X-Request-ID`, `+ Cache-Control`), dynamic row addition, and real-time active header badge sync.
  - **Config Tab & Feature Toggle**: Integrated toggle `globalHeaders` into settings and Config panel with `.oac-disable-global-headers` (**13/13 active features**).
  - **100% SVG Icons & Stability**: Strict zero-emoji compliance using clean inline SVGs (**86 test files, 786+ tests passing**).

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
- [x] **Auto-Refresh with Saved Account Credentials & Warning Suppression:**
  - [x] **Zero-Setup Token Auto-Renewal via Account Credentials**:
    - When an account has saved credentials (`username`, `password`), auto-refresh automatically signs in using those credentials on 401/expiry or manual "Refresh now"—without requiring a separate preset saved in Requests.
    - Suppressed misleading warning banner *"No saved login request found, so this can't run yet..."* whenever account credentials exist.
    - Displayed green confirmation banner: `✓ Will sign in using saved account credentials for "{account.name}" ({username}) via {endpoint}`.
  - [x] **Multi-Tier Endpoint Auto-Detection & Safe Exclusions**:
    - Broadened auto-detection for `/oauth/token`, `/oauth2/token`, `/api/token`, `/auth/jwt/create`, `/session`, and endpoints tagged `Auth`/`Login` without falsely excluding them.
    - Excluded dangerous operations (`/forgot-password`, `/reset-password`, `/register`, `/logout`, `/resend-otp`, `/verify`).
  - [x] **Configurable Sign-in Endpoint Override**:
    - Added endpoint picker dropdown to let developers explicitly override the login endpoint for non-standard APIs.
    - Persisted configured login endpoint per project (**531 tests ✓**).
- [x] **History Request Detail In-Page Overlay (Swagger DOM):**
  - [x] **Spacious In-Page Modal for Execution Inspector**:
    - Moved the narrow Side Panel inline history detail dialog into an in-page top-centered overlay (`#oac-history-detail-host`) mounted inside the Swagger webpage's Shadow DOM (consistent with Command Palette and Request Preset Editor).
    - Features full 672px (`max-w-2xl`) viewport, tabbed Request / Response viewers, line wrap toggle, headers/parameters inspection, cURL / PowerShell / URL copy, Save Response to Variable, and sibling calls timeline switcher.
    - Added standalone `HistoryDetailModal`, RPC bridge `historyDetail.open`, and isolated Tailwind styling with `ThemeManager` live sync (**534 tests ✓**).
- [x] **Project Variables Upgrades — Phase C: Automation & Workflow Utilities:**
  - [x] **Zero-Click Auto-Extraction Rules (Persistent Project Isolation)**:
    - Built persistent extraction rule engine (`env-service.ts`, `extraction-rules-types.ts`) keyed strictly to `projects/<projectId>/environment/extraction-rules` to maintain 100% project isolation (FR-024).
    - Evaluated and intentionally dropped cross-project global variables per architectural decision to ensure zero cross-origin data leakage across distinct Swagger specs.
    - Added nested dot/bracket path resolution (`extractValueByPath`) in `json-candidates.ts` supporting `response.` and `body.` prefixes.
    - Integrated automatic extraction hook in `HistoryService` on 2xx successful responses, triggering reactive updates and notifications (`VARIABLE_AUTO_EXTRACTED`).
  - [x] **Interactive Rules Management UI & In-Page Swagger Overlay**:
    - Created `ExtractionRuleModal.tsx` and in-page Shadow DOM host `#oac-extraction-rule-host` (`mountExtractionRuleModal` in `src/content/extraction-rule-modal.tsx`) so rule creation opens as a spacious top-centered overlay directly on top of Swagger UI rather than cramped inside the narrow 380px side panel.
    - Integrated one-click token presets (`access_token`, `token`, `id`, `data.id`, `jwt`), property path detection, auto-uppercased variable names, and secret masking toggle.
    - Created `ExtractionRulesList.tsx` with enabled/disabled toggles and rule deletion, and added the dedicated "Rules" tab in `EnvironmentsPanel.tsx`.
    - Added `⚡ Auto-extract on future 2xx responses` checkbox directly in `SaveToVariableDialog.tsx` so developers can create recurring extraction rules from any history inspection.
  - [x] **Variable Reference & Usage Scanner**:
    - Scans all saved endpoint request presets (`headers`, `query`, `path`, `body`) to detect active `{{VAR}}` usage.
    - Displays `✓ Used in N presets` badge with full tooltip inspection or `unused` indicator next to each project variable (**557 tests ✓**).




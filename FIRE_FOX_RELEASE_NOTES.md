## 🌟 What's New in v1.4.0

### 🚀 1. Developer Welcome & Quick-Start Landing Experience
- **Interactive Welcome View**: Replaces disconnected empty states with an ambient dark landing view featuring live terminal preview with styled cURL execution and core value highlights.
- **Celebratory Thank You Flow**: Guides developers through extension pinning, Swagger detection, and provides a 1-click live demo link to Swagger Petstore (`https://petstore.swagger.io/`).
- **Official Brand Icon**: High-resolution official brand logo integration across the welcome view, collapsed floating launcher, and store listings.

### 🎨 2. Enhanced Navigation Button Affordance
- **Tangible Button Geometry**: Solid slate surface backgrounds (`bg-surface`) and crisp outlines (`border border-border`) on all navigation tabs.
- **Interactive Hover Feedback**: Navigation buttons smoothly brighten and lift on hover, making interactive controls instantly recognizable at first glance.

### 🔑 3. In-Page Paste cURL Token & Global Headers Extraction
- **Automatic Token Authorization**: Pasting cURL commands with Bearer, Basic, or API Key headers automatically authorizes Swagger UI and binds tokens to active test sessions.
- **Global Headers Extraction**: Detects custom enterprise headers (`X-Tenant-ID`, `X-App-Version`, `X-Custom-*`) with 1-click addition to OpenAPI Companion's Global Headers system.

### 🔒 4. Pre-Execution Auth Clearing on Login APIs
- **Stale Token Protection**: Automatically logs out of Swagger Authorize before dispatching login endpoints, preventing expired or invalid JWTs from triggering 401/403 errors from backend authentication guards.

### 🛡️ 5. Content Security Policy (CSP) Hardening
- **Zero Inline Scripts**: Completely eliminated inline script injection to ensure seamless, error-free operation on sites enforcing strict Content Security Policies.

---

## 🌟 What's New in v1.3.1

### 🕒 1. In-Page Swagger Endpoint History Button & Config Toggle
- **Dynamic Endpoint History Button**: Injects an in-context `History [count]` button onto Swagger UI operation bars only when previous executions exist (`count > 0`).
- **Optimal Placement**: Sits seamlessly after the operation description and before native controls (`[clipboard]`, `[lock]`, `[v arrow]`), keeping native Swagger controls untouched and aligned at the far right.
- **1-Click Call Inspection**: Opens the in-page History Detail overlay pre-filtered to the active endpoint with past request/response payloads, status codes, and latency metrics.
- **Configurable**: Toggle the button on/off anytime in the Config tab (`endpointHistoryButton`).
- **Real-Time Responsiveness**: Badges update automatically when new calls complete and clear when history is reset.

### 💾 2. In-Page Swagger "Save Request" Action Button on 2xx Responses
- **1-Click Preset Creation**: Automatically injects a "Save Request" button in Swagger UI's response section on successful (2xx) executions alongside Save Variable.
- **Full Parameter Pre-Fill**: Pre-populates the Preset Editor with executed path parameters, query strings, headers, request body, and endpoint summary.

### 👥 3. Auth Tab Raw JSON User / Persona Import
- **Paste JSON Credentials**: New `[Paste JSON]` mode in Add Account card allowing developers to paste raw JSON login payloads directly from Postman or documentation.
- **Smart Key Detection**: Automatically extracts email/username, password, and custom payload fields with automatic name derivation from the email prefix.

### 🌿 4. Environment Variables Raw JSON Import
- **Direct JSON Ingestion**: Paste raw API responses, JSON objects, or key/value arrays directly into Project Variables.
- **Recursive Flattening**: Converts nested JSON into clean `{{VAR}}` interpolation paths (`user_id`, `config_timeout`).
- **Secret Detection & Format Preview**: Real-time format badge, variable count, secret indicators, and syntax error diagnostics.

### 🛠️ 5. UI Polish & Editable Extraction Rules
- **Editable Extraction Rules**: Added an Edit pencil button to each auto-extraction rule with pre-populated form controls for seamless modification.
- **Corrected Icon Semantics**: Standardized Import with downward arrow ($\downarrow$) and Export with upward arrow ($\uparrow$) across Variables and Workflows.

### 🛡️ 6. Firefox Automated Backups & Restore Undo Grace Period
- **Automated Scheduled Backups**: Native scheduled background backups in Firefox using `chrome.alarms` without download prompts (cleanly hidden in Chrome for distraction-free settings).
- **60-Second Undo Window**: Rollback snapshot alert banner auto-dismisses after 1 minute to prevent stale restores.

---

## 🛠️ Quality & Performance Verification

- **Unit & Component Tests**: **125 / 125 test suites passing (1,136 tests, 100% green)**.
- **Playwright E2E Tests**: 2 / 2 headless Chromium smoke tests passed.
- **Strict Type Safety**: TypeScript 5.6 compiled with 0 type errors.
- **Code Standards**: 100% compliant with ESLint and Prettier formatting across all modules.
- **Security Audit**: 0 vulnerabilities (`npm audit --omit=dev --audit-level=high`).

---

## 📥 Installation & Downloads

### Chrome / Edge / Brave / Chromium
1. Download **[`openapi-companion-1.4.0.zip`](https://github.com/pratyanj/OpenAPI_Companion/releases/download/v1.4.0/openapi-companion-1.4.0.zip)**.
2. Unzip into a permanent folder.
3. Open `chrome://extensions` (or `edge://extensions` / `brave://extensions`).
4. Enable **Developer mode** toggle in the top right.
5. Click **Load unpacked** and select the unzipped directory containing `manifest.json`.

### Firefox (Experimental / Developer Preview)
1. Download **[`openapi-companion-1.4.0-firefox.zip`](https://github.com/pratyanj/OpenAPI_Companion/releases/download/v1.4.0/openapi-companion-1.4.0-firefox.zip)**.
2. Open `about:debugging` → **This Firefox** → **Load Temporary Add-on…**.
3. Select the `manifest.json` inside the extracted directory.

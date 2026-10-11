
## 🌟 What's New in v1.3.0

### 👥 1. Multi-Persona Authentication with Dynamic Payload Fields
- **Custom Payload Parameters**: Support for non-standard or mandatory login fields beyond standard email/password (e.g. `force_logout: true`, `tenant_id`, `client_secret`, `role`).
- **Configurable Type Casting**: Dynamic type dropdown allowing fields to be saved as **String**, **Boolean** (`true`/`false`), or **Number**.
- **Visual Vault Badges**: Persona badges now indicate configured extra fields (e.g., `Admin · 1 extra field`).
- **Full Refresh Integration**: Extra fields are automatically preserved and forwarded during background token refreshes (`TokenRefreshService`).

### ⚡ 2. Native Auto-Token Capture & Instant Swagger Authorization
- **Zero-Click Authorization**: Sending or replaying a login endpoint (e.g. `/auth/login`, `/api/v1/token`) immediately inspects successful 2xx responses, extracts the access/bearer token, and authorizes Swagger UI without requiring manual copy-pasting.
- **Visual Confirmation**: Displays real-time toast feedback (`⚡ Authorized in Swagger UI via post /auth/login`).
- **Normalized Endpoint Rules**: Variable extraction rules now seamlessly match both trailing and non-trailing slash endpoints (`/auth/login` and `/auth/login/`).

### 🧪 3. Complete API Testing & Automation Suite
- **API Scenario Recorder (Phase 2)**: Floating recorder toolbar on docs pages to record live endpoint interactions into replayable end-to-end test scenarios.
- **Visual Workflow Editor & Runner (Phase 3)**:
  - Drag-and-drop step reordering and dependency chaining.
  - Step timing inspection and variable propagation between consecutive requests.
- **Rich Assertions Engine (Phase 1)**:
  - Evaluate status codes, response times, headers, regex patterns, and nested JSONPath expressions (`$.data.user.id`).
- **Automated Pagination Tester & Exporter (Phase 4)**:
  - Supports Cursor, Page/Limit, and Offset/Limit pagination schemas.
  - Automated page traversal, response integrity checks, and direct export to JSON and CSV.

### 🧭 4. OpenAPI Spec Change Detector & Impact Analysis (Phase 5)
- **Automatic Spec Diffing**: Detects changes between previously cached specs and newly loaded API docs.
- **Breaking Change Highlights**: Visual indicators for removed endpoints, altered path/query parameters, and schema breaking updates.
- **Impact Warning Modal**: Notifies developers when actively used endpoints or variables may be affected.

### ⌨️ 5. Updated Keyboard Shortcuts
- <kbd>Ctrl+F</kbd> / <kbd>⌘F</kbd>: **Command Palette** endpoint search directly inside Swagger UI.
- <kbd>Ctrl+K</kbd> / <kbd>⌘K</kbd>: **Keyboard Shortcuts Manager** cheat-sheet and custom keybinding editor.

### 🔄 6. Hot Sidepanel Reloading
- Native sidepanel automatically detects content script build ID changes and refreshes without requiring a full browser tab reload or leaving stale build banners.

---

## 🛠️ Quality & Performance Verification

- **Unit & Component Tests**: **123 / 123 test suites passing (1,078 tests, 100% green)**.
- **Playwright E2E Tests**: Clean headless Chromium smoke tests passed.
- **Strict Type Safety**: TypeScript 5.6 compiled with 0 type errors.
- **Code Standards**: 100% compliant with ESLint and Prettier formatting across all modules.
- **Security Audit**: 0 vulnerabilities (`npm audit --omit=dev --audit-level=high`).

---

## 📥 Installation & Downloads

### Chrome / Edge / Brave / Chromium
1. Download **[`openapi-companion-1.3.0.zip`](https://github.com/pratyanj/OpenAPI_Companion/releases/download/v1.3.0/openapi-companion-1.3.0.zip)**.
2. Unzip into a permanent folder.
3. Open `chrome://extensions` (or `edge://extensions` / `brave://extensions`).
4. Enable **Developer mode** toggle in the top right.
5. Click **Load unpacked** and select the unzipped directory containing `manifest.json`.

### Firefox (Experimental / Developer Preview)
1. Download **[`openapi-companion-1.3.0-firefox.zip`](https://github.com/pratyanj/OpenAPI_Companion/releases/download/v1.3.0/openapi-companion-1.3.0-firefox.zip)**.
2. Open `about:debugging` → **This Firefox** → **Load Temporary Add-on…**.
3. Select the `manifest.json` inside the extracted directory.

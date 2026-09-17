# Walkthrough - Point 13: Global Debug Headers Injector

We have implemented **Point 13** in `TODO.md`: **Global Debug Headers Injector** for Swagger UI, enabling developers and QA testers to define project-level custom HTTP headers (such as `X-Tenant-ID`, `X-Debug`, `Accept-Language`, `X-Request-ID`) that are automatically injected into all outgoing Swagger UI requests, across Swagger's `requestInterceptor`, `window.fetch`, and `XMLHttpRequest`, with dynamic variable resolution (`{{TENANT_ID}}`, `{{$uuid}}`, `{{$timestamp}}`).

---

## 1. Summary of Changes

### A. Headers Storage & Service (`src/modules/headers/`)
- **Type Definitions (`types.ts`)**: `GlobalHeaderItem` (`id`, `key`, `value`, `enabled`, `description`) and `GlobalHeadersConfig`.
- **Headers Service (`headers-service.ts`)**:
  - Persistent per-project storage under `projects/<projectId>/global-headers`.
  - CRUD operations: `getHeaders()`, `saveHeaders()`, `addHeader()`, `toggleHeader()`, `deleteHeader()`.
  - `getActiveHeadersRecord()` exports an active key-value dictionary formatted for immediate request attachment.

### B. Multi-Channel MAIN-World Interception (`src/content/main-world.ts` & `swagger-protocol.ts`)
- Added protocol message `{ cmd: 'syncGlobalHeaders'; headers: Record<string, string> }` handled by MAIN-world listener.
- **Dynamic Variable Interpolation (`resolveVariables`)**:
  - Replaces `{{VARIABLE_NAME}}` from active environment variables.
  - Generates dynamic UUIDs for `{{$uuid}}` and current epoch timestamps for `{{$timestamp}}`.
- **Interception Layers**:
  - **Swagger `requestInterceptor`**: Iterates through global headers and merges them into `req.headers`.
  - **Native `window.fetch`**: Merges global headers into `Request` headers or options dictionary, ensuring global headers take priority without overwriting unrelated headers.
  - **Native `XMLHttpRequest`**: Appends active headers within `open()` / `send()`.

### C. In-Page UI & Dark Slate Modal (`src/content/swagger-global-headers.ts`)
- **Quick Action Bar Button**: Mounted clean `[ Headers ]` action button beside `[ Paste cURL ]` in `.oac-header-actions-bar` with live count badge (`Headers (N)`).
- **Dark Slate Navy Styling**: Strictly follows OAC theme tokens (`#0f172a`, `#162032`, `#1e293b`, `#334155`, `#3b82f6`).
- **Quick Presets**: 1-click preset chips for common debug headers:
  - `+ X-Tenant-ID`
  - `+ X-Debug`
  - `+ Accept-Language`
  - `+ X-Request-ID`
  - `+ Cache-Control`
- **Dynamic Row Management**: Checkbox to toggle active status, key/value inputs, delete button, and `+ Add Custom Header` action.
- **100% SVG Icons & Strict Zero Emojis**: Replaced all emoji symbols with crisp inline SVGs.

### D. Settings & Config Panel Integration (`src/modules/settings/` & `src/modules/config/`)
- Added `globalHeaders: boolean` (default: `true`) to `SwaggerFeaturePreferences` and `DEFAULT_SWAGGER_FEATURES` (**13/13 active features**).
- Added `Global Debug Headers Injector` item in `ConfigPanel.tsx`.
- Controlled via `.oac-disable-global-headers` class in `src/content/index.tsx`.

---

## 2. Verification Results

### A. Unit Tests
- `src/modules/headers/headers-service.test.ts`: **4/4 passed**
- `src/content/main-world.test.ts`: **3/3 passed**
- `src/content/swagger-global-headers.test.ts`: **5/5 passed**
- `src/modules/config/ConfigPanel.test.tsx`: **3/3 passed** (13/13 active features verified)
- `src/modules/settings/settings-service.test.ts`: **9/9 passed**

### B. Full Test Suite & Production Build
- Ran `npm test`: **86 test files, 786+ tests passing (100% pass rate)**.
- Ran `npm run build`: Production bundle built cleanly with zero errors.
- Verified zero emojis across all newly touched and created files.

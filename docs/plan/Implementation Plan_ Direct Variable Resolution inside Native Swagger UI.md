# Implementation Plan: Direct Variable Resolution inside Native Swagger UI (`{{variable}}`)

Allow developers to seamlessly use their Project Variables (and dynamic variables like `{{$uuid}}`, `{{$timestamp}}`, `{{$randomEmail}}`) directly inside Swagger UI on the webpage, both when typing inputs and when executing requests.

## User Review Required

> [!IMPORTANT]
> **Dual-Layer Resolution Strategy**:
> 1. **Network Interceptor Layer (MAIN World)**: Intercepts `window.fetch` and Swagger's `requestInterceptor` in the page's JavaScript execution context. Even if a developer types `{{TOKEN}}` or `{{USER_ID}}` (or URL-encoded `%7B%7BUSER_ID%7D%7D`), all variables are resolved before the HTTP request leaves the browser.
> 2. **Interactive DOM Layer (ISOLATED World)**: Enhances Swagger UI inputs directly in the browser DOM. When developers type `{{` into any parameter input or body textarea in Swagger UI, an autocomplete dropdown appears with project variables and dynamic variables. Additionally, an operation toolbar pill ("⚡ Variables") allows 1-click in-place resolution of all `{{...}}` placeholders in the Swagger form fields.

## Proposed Changes

---

### 1. Environment & Variable Substitution Enhancements

#### [MODIFY] [env-service.ts](file:///P:/React%20native/OpenAPI_Companion/src/modules/environment/env-service.ts)
- Update `substitute` to support:
  - Both standard `{{VAR}}` and URL-encoded `%7B%7BVAR%7D%7D` patterns in URLs.
  - Case-insensitive variable matching fallback (e.g. if developer typed `{{token}}` and project variable is `TOKEN`).
  - Preserve unmatched placeholders safely while reporting them.

#### [MODIFY] [env-service.test.ts](file:///P:/React%20native/OpenAPI_Companion/src/modules/environment/env-service.test.ts)
- Add unit tests for URL-encoded `%7B%7B` substitution, case-insensitive variable matching, and dynamic variable resolution in URLs and query strings.

---

### 2. Main-World & Bridge Communication Protocol

#### [MODIFY] [swagger-protocol.ts](file:///P:/React%20native/OpenAPI_Companion/src/content/swagger-protocol.ts)
- Add `syncVariables` command to `BridgeOutbound`:
  ```ts
  | { tag: typeof BRIDGE_TAG; dir: 'to-main'; cmd: 'syncVariables'; variables: Record<string, string> }
  ```
- Export pure resolver helper function `resolveWithVariables(str, variables)` for use in the MAIN world.

#### [MODIFY] [swagger-bridge.ts](file:///P:/React%20native/OpenAPI_Companion/src/content/swagger-bridge.ts)
- Add `syncVariables(variables: Record<string, string>): void` to `SwaggerBridge`.
- Cache the latest variables snapshot so that when `MAIN` re-announces `ready`, the active variables are immediately synchronized.

#### [MODIFY] [main-world.ts](file:///P:/React%20native/OpenAPI_Companion/src/content/main-world.ts)
- Maintain `activeVariables: Record<string, string>`.
- Listen for `syncVariables` messages from the bridge.
- Intercept `window.fetch` (and `XMLHttpRequest`):
  - Resolve URL, query params, headers, and request body containing `{{...}}` or `%7B%7B...%7D%7D`.
- Hook Swagger's `requestInterceptor` on `resolveSwaggerUi()?.getConfigs?.()` so Swagger UI's own Request URL and Curl display show the resolved values in the console.

#### [MODIFY] [swagger-protocol.test.ts](file:///P:/React%20native/OpenAPI_Companion/src/content/swagger-protocol.test.ts) & [swagger-bridge.test.ts](file:///P:/React%20native/OpenAPI_Companion/src/content/swagger-bridge.test.ts)
- Add tests verifying `syncVariables` message transmission, caching, re-transmission on `ready`, and `resolveWithVariables` string replacement.

---

### 3. In-Page Swagger UI Variable Helper & Autocomplete (ISOLATED World)

#### [NEW] [swagger-variables.ts](file:///P:/React%20native/OpenAPI_Companion/src/content/swagger-variables.ts)
- In-page controller for native Swagger UI operations:
  - **Live Autocomplete**: When the user types `{{` in any input or textarea inside a Swagger operation (`.opblock`):
    - Renders an autocomplete dropdown anchored at the active input with project variables and dynamic variables (`{{$uuid}}`, `{{$timestamp}}`, etc.).
    - Keyboard navigation (<kbd>↑</kbd>, <kbd>↓</kbd>, <kbd>Enter</kbd>, <kbd>Tab</kbd>, <kbd>Esc</kbd>).
    - Inserts selected variable and updates React state via `setNativeValue`.
  - **Operation Toolbar ("⚡ Variables")**:
    - Adds a subtle button/pill inside open operation blocks (`.opblock.is-open`):
      - Displays active variable count.
      - 1-click **"⚡ Resolve in inputs"**: immediately resolves all `{{...}}` in the current operation's parameter inputs and body textarea.
  - **Pre-Execute Auto-Resolve**:
    - Intercepts clicks on Swagger UI's native `.btn.execute` button to resolve any remaining `{{...}}` in-place in the form inputs before execution.

#### [NEW] [swagger-variables.test.ts](file:///P:/React%20native/OpenAPI_Companion/src/content/swagger-variables.test.ts)
- Unit and DOM integration tests verifying:
  - Input event delegation and `{{` autocomplete popup display.
  - Variable selection and native input updating via `setNativeValue`.
  - In-place resolution of parameter inputs and request body textareas.
  - Pre-execution resolution on `.btn.execute` click.

#### [MODIFY] [index.tsx](file:///P:/React%20native/OpenAPI_Companion/src/content/index.tsx)
- Wire `mountSwaggerVariables` into the content script agent lifecycle.
- Sync active environment variables to `bridge` on boot and whenever `ENVIRONMENT_CHANGED` is emitted.

---

## Verification Plan

### Automated Tests
- Component and unit tests:
  ```bash
  npm --prefix "P:\React native\OpenAPI_Companion" test src/modules/environment/env-service.test.ts
  npm --prefix "P:\React native\OpenAPI_Companion" test src/content/swagger-protocol.test.ts src/content/swagger-bridge.test.ts
  npm --prefix "P:\React native\OpenAPI_Companion" test src/content/swagger-variables.test.ts
  ```
- Full test suite:
  ```bash
  npm --prefix "P:\React native\OpenAPI_Companion" test -- --run
  ```
- Production build:
  ```bash
  npm --prefix "P:\React native\OpenAPI_Companion" run build
  ```

### Manual Verification
- Verify in Swagger UI:
  1. Open an endpoint, click "Try it out".
  2. Type `{{` in a path or query parameter input or body textarea — observe autocomplete popup.
  3. Select a variable or type `{{USER_ID}}` / `{{$uuid}}`.
  4. Click "⚡ Resolve in inputs" — observe instantaneous in-place value replacement.
  5. Click Swagger UI's native "Execute" — verify the outgoing HTTP call receives the resolved values and Swagger UI displays the resolved Curl/Request URL.

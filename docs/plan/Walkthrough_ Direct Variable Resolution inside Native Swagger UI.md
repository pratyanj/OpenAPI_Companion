# Walkthrough: Direct Variable Resolution inside Native Swagger UI (`{{variable}}`)

## Overview
Developers can now use their Project Variables (and dynamic variables like `{{$uuid}}`, `{{$timestamp}}`, `{{$randomEmail}}`) directly inside Swagger UI on the webpage, without needing to open the side panel or manually copy-paste values.

---

## Dual-Layer Architecture & Features

### 1. Interactive DOM Layer (`src/content/swagger-variables.ts`)
- **Live Autocomplete (`{{`) in Swagger UI**:
  - When typing `{{` in any Swagger input field (path parameter, query parameter, header parameter, or request body textarea), an isolated Shadow DOM popup appears anchored directly below the active field.
  - Lists available Project Variables (with key and secret-masked preview) alongside built-in Dynamic Variables (`{{$uuid}}`, `{{$timestamp}}`, `{{$isoDate}}`, `{{$randomEmail}}`, `{{$randomName}}`, etc.).
  - Keyboard navigation:
    - <kbd>↓</kbd> / <kbd>↑</kbd> to move selection.
    - <kbd>Enter</kbd> or <kbd>Tab</kbd> to insert the selected variable (`{{NAME}}`).
    - <kbd>Escape</kbd> to dismiss.
  - Automatically invokes `setNativeValue` to dispatch React synthetic input events, ensuring Swagger UI's internal state updates immediately.
*(Note: Per user feedback, the in-block operation toolbar pill was removed to keep the Swagger UI clean and non-intrusive. Developers access variables directly via the `{{` dropdown list in input fields).*
- **Pre-Execution Resolution**:
  - Automatically intercepts clicks on Swagger UI's native **Execute** button (`.btn.execute`) to resolve any remaining placeholders in the form inputs prior to execution.

---

### 2. Network Interceptor Layer (`src/content/main-world.ts` & `swagger-protocol.ts`)
- **Synchronized Active Variables**:
  - The content script syncs the active environment variables to the MAIN world over `window.postMessage` via `syncVariables` command.
  - Automatically re-syncs when environments change, when variables are updated in the panel, or when the page reloads.
- **Universal `window.fetch` and `XMLHttpRequest` Interception**:
  - Intercepts outgoing HTTP calls before they leave the browser.
  - Resolves:
    - Request URLs containing standard `{{VAR}}` and URL-encoded `%7B%7BVAR%7D%7D` placeholders.
    - Request headers containing `{{VAR}}` (e.g., `Authorization: Bearer {{TOKEN}}`).
    - Request bodies (JSON string or text) containing `{{VAR}}`.
- **Swagger `requestInterceptor` Integration**:
  - Hooks into Swagger UI's config object (`resolveSwaggerUi()?.getConfigs()?.requestInterceptor`).
  - Resolves requests inside Swagger's internal pipeline, allowing Swagger UI's "Curl" and "Request URL" sections in the response display to reflect the resolved values.

---

### 3. Variable Substitution Enhancements (`src/modules/environment/env-service.ts`)
- **URL-Encoded Placeholder Support**:
  - Extended `VAR_PATTERN` to match both `{{VAR}}` and `%7B%7BVAR%7D%7D` (and `%7b%7b...%7d%7d`), preserving URL validity while resolving variables.
- **Case-Insensitive Fallback**:
  - If a user types `{{token}}` while the project variable is defined as `TOKEN`, the substitution falls back to case-insensitive lookup automatically.
- **Dynamic System Variables**:
  - Resolves `{{$uuid}}`, `{{$timestamp}}`, `{{$isoDate}}`, `{{$randomEmail}}`, etc., within both regular and URL-encoded placeholders.

---

## Verification & Test Results
- **Unit & Component Tests**:
  - `src/content/swagger-variables.test.ts`: **5/5 passed**.
  - `src/content/main-world.test.ts`: **2/2 passed**.
  - `src/content/swagger-protocol.test.ts`: **21/21 passed**.
  - `src/content/swagger-bridge.test.ts`: **5/5 passed**.
  - `src/modules/environment/env-service.test.ts`: **21/21 passed**.
- **Full Test Suite**:
  - **70 test files passed (70), 615 tests passed (615)** with 0 failures.
- **Production Build**:
  - Built cleanly with `vite build` in 8.11s.

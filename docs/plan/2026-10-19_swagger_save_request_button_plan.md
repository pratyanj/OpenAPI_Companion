# Implementation Plan: In-Page Swagger UI "Save Request" Button on 2xx Responses

## Overview
When an API operation executes successfully (2xx status code) inside Swagger UI, developers currently have a 1-click **"Save to Variable"** button in `.oac-response-action-bar` above the response body to extract variables, but saving the executed request itself (endpoint, parameters, query, and request body) into Presets requires manually switching to the Side Panel, opening the Presets tab, and re-entering the data.

This feature injects a method-themed **"Save Request"** action button alongside "Save to Variable" directly inside `.oac-response-action-bar` on 2xx responses. When clicked, it captures the executed operation parameters, query string, and request body, opening the spacious in-page Preset Editor pre-filled for 1-click saving without navigating away from the documentation.

---

## User Review Items & Design Decisions
- **Button Placement & Layout**:
  - The "Save Request" button will sit alongside "Save to Variable" inside `.oac-response-action-bar`:
    `[💾 Save Request]  [⚡ Save to Variable]`
  - Right-aligned above the response body container with clean 6px gap.
- **HTTP Method Theme Alignment**:
  - Both buttons will share the method-specific colors that match Swagger UI's native operation borders and badges:
    - **GET**: Soft blue (`rgba(97, 175, 254, 0.14)`, border `#61affe`)
    - **POST**: Soft green (`rgba(73, 204, 144, 0.14)`, border `#49cc90`)
    - **PUT**: Soft orange (`rgba(252, 161, 48, 0.14)`, border `#fca130`)
    - **DELETE**: Soft red (`rgba(249, 62, 62, 0.14)`, border `#f93e3e`)
    - **PATCH**: Soft teal (`rgba(80, 227, 194, 0.14)`, border `#50e3c2`)
- **Visual Feedback**:
  - On click, the button briefly displays `"Opening editor..."` or `"✓ Pre-filled"` with `.success` styling, then reverts back to `"Save Request"`.
- **Pre-Population Logic**:
  - `initialEndpointId`: Detected from operation block (e.g. `post /api/v1/tasks`).
  - `initialBody`: Read from operation's request body textarea (`bodyTextarea(block)?.value`).
  - `initialPath`: Captured from path parameter inputs (`readParametersFromBlock(block).path`).
  - `initialQuery`: Captured from query parameter inputs (`readParametersFromBlock(block).query`).
  - `initialName`: Derived from operation summary/description or `${method.toUpperCase()} ${pathName}`.
- **Single Observer & Zero Race Conditions**:
  - Coordinated directly in `src/content/swagger-response-variable.ts` (or `swagger-response-actions`), reusing the existing response cell scanner and ensuring both buttons appear and disappear synchronously when responses change or fail.

---

## Proposed Changes

### 1. `src/adapters/swagger/swagger-request-dom.ts`
- Export `bodyTextarea(block: Element): HTMLTextAreaElement | null` so content script response actions can read the executed request body safely.

### 2. `src/content/swagger-response-variable.ts`
- Add `SwaggerResponseActionsOptions` interface with `onSaveRequest?: (options: PresetEditorOpenOptions) => void | Promise<void>`.
- Update `mountSwaggerResponseVariable(modal, doc, options?)` to accept `options`.
- Update CSS for `.oac-response-action-bar` to add `gap: 6px`.
- Add CSS classes `.oac-save-req-btn` sharing the base button and method styling with `.oac-save-var-btn`.
- Inside `attachToResponseCell(cell: Element)`:
  - If `options?.onSaveRequest` is provided, create and append `.oac-save-req-btn` before `btn` (Save to Variable).
  - On click, extract parameters, body, endpoint, and summary from `cell.closest('.opblock')`, and invoke `options.onSaveRequest(...)`.
- Export alias `mountSwaggerResponseActions = mountSwaggerResponseVariable`.

### 3. `src/content/index.tsx`
- Pass `onSaveRequest` to `mountSwaggerResponseVariable`:
  ```ts
  mountSwaggerResponseVariable(saveVariableModal, document, {
    onSaveRequest: async (options) => {
      const editor = await withPresetEditor()
      editor?.open(options)
    },
  })
  ```

### 4. `src/content/swagger-response-variable.test.ts`
- Add comprehensive unit tests:
  - Verify "Save Request" button mounts on 200 OK responses when `onSaveRequest` is provided.
  - Verify "Save Request" button extracts path, query, body, and endpointId, and invokes `onSaveRequest`.
  - Verify "Save Request" button displays visual feedback (`Opening editor...` / `Pre-filled`).
  - Verify "Save Request" button is not rendered on 4xx/5xx responses.
  - Verify cleanup on `handle.dispose()`.

---

## Verification Plan

### Automated CI Quality Gates
1. Run `npm run format` (`prettier --write .`) to ensure Prettier conformity.
2. Run `npm run lint` (ESLint — 0 errors, 0 warnings).
3. Run `npm run format:check` (Prettier — 100% compliant).
4. Run `npm run typecheck` (`tsc --noEmit` — 0 errors).
5. Run `npm test` (All Vitest suites green).
6. Run `npm audit --omit=dev --audit-level=high` (0 high/critical).
7. Run `npm run build` (Vite Chrome & Firefox builds succeed).
8. Run `npm run test:e2e` (Playwright Chromium smoke tests pass).

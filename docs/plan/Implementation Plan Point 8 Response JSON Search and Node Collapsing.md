# Implementation Plan: Point 8 - Response JSON Search & Node Collapsing

Implement an interactive, high-performance JSON response viewer for Swagger UI that provides real-time keyword search, match navigation, expandable/collapsible tree nodes, and 1-click JSON path/formatted copy.

## User Review Required

> [!IMPORTANT]
> **Zero Emojis & Reversible Raw View**: All icons use pure inline SVG vectors. Swagger UI's original raw response block remains untouched in the DOM and can be toggled instantly via the `[ Tree | Raw ]` mode switcher.

> [!NOTE]
> **Config Integration**: A new toggle `responseJsonSearch` (default: enabled) is added to `SwaggerFeaturePreferences` in `src/modules/settings/types.ts` and the **Config** tab in the side panel.

---

## Proposed Changes

### Content Script & Response Enhancement

#### [NEW] [swagger-response-viewer.ts](file:///P:/React%20native/OpenAPI_Companion/src/content/swagger-response-viewer.ts)
- Detects rendered live response bodies (`.response-col_description:not(.col_header)`) inside Swagger UI's executed response table.
- Validates whether response body is JSON via `JSON.parse`. If not JSON (e.g. plain text, HTML, or empty), it gracefully leaves the native Swagger block untouched.
- Injects a sleek, modern toolbar above the response:
  - **Search Input**: Live keyword query with clear button (`✕`).
  - **Match Navigation**: `▲ Prev` (<kbd>Shift+Enter</kbd>) and `▼ Next` (<kbd>Enter</kbd>) with live match counter (e.g., `2 / 5 matches` or `No matches`).
  - **Tree Actions**: `Expand All` and `Collapse All` buttons.
  - **View Mode Switch**: Segmented toggle `[ Tree | Raw ]` to switch between interactive tree view and Swagger UI's native pre block.
  - **Copy Formatted JSON**: 1-click copy with animated checkmark feedback.
- **Interactive Collapsible Tree**:
  - Renders objects `{ ... }` and arrays `[ ... ]` with expand/collapse chevron toggles.
  - Shows collapsed summary pills: `{ 6 keys }` or `[ 42 items ]`.
  - Type-based syntax highlighting:
    - Keys: Blue / Cyan
    - Strings: Emerald green (with clickable link detection for URLs)
    - Numbers: Purple / Indigo
    - Booleans: Amber / Orange
    - Null: Slate gray
  - **Search Match Highlighting**: Highlights matching keys and values (`<mark class="oac-json-match">`). Active match is highlighted in amber/yellow with auto-scroll into view.
  - **Auto-Expansion on Match**: If a search match is located within a collapsed object or array, all ancestor nodes are automatically expanded so the matching node is visible.
  - **JSON Path Tooltip & Copy**: Hovering over any key or property displays its dot-notation path (e.g. `data.users[0].id`); clicking copies the path to clipboard.
- Full `dispose()` cleanup for mutation observers, event listeners, and injected DOM elements.

#### [MODIFY] [swagger-response-variable.ts](file:///P:/React%20native/OpenAPI_Companion/src/content/swagger-response-variable.ts)
- Ensure clean layout coexistence between the "Save to Variable" button and the Response Viewer toolbar.

#### [MODIFY] [index.tsx](file:///P:/React%20native/OpenAPI_Companion/src/content/index.tsx)
- Import and mount `mountSwaggerResponseViewer(document)`.
- Add toggle class `oac-disable-response-json-search` in `applySwaggerFeatureClasses`.

---

### Settings & Config Tab Integration

#### [MODIFY] [types.ts](file:///P:/React%20native/OpenAPI_Companion/src/modules/settings/types.ts)
- Add `responseJsonSearch: boolean` to `SwaggerFeaturePreferences` (default: `true`).

#### [MODIFY] [ConfigPanel.tsx](file:///P:/React%20native/OpenAPI_Companion/src/modules/config/ConfigPanel.tsx)
- Add "Response JSON Search & Tree View" toggle to `FEATURES` list.

---

### Test Suite

#### [NEW] [swagger-response-viewer.test.ts](file:///P:/React%20native/OpenAPI_Companion/src/content/swagger-response-viewer.test.ts)
- Unit tests covering:
  - Detection and mounting on executed JSON responses.
  - Graceful bypass on non-JSON, empty, or unexecuted operations.
  - Tree node rendering (nested objects, arrays, primitives).
  - Node expand and collapse interactions.
  - Expand All and Collapse All toolbar actions.
  - Keyword search filtering, match count, next/previous navigation, and auto-expanding collapsed ancestors.
  - Tree vs. Raw view switching.
  - Formatted JSON copy and path copy.
  - Feature toggle class behavior.
  - Observer cleanup on `dispose()`.

#### [MODIFY] [ConfigPanel.test.tsx](file:///P:/React%20native/OpenAPI_Companion/src/modules/config/ConfigPanel.test.tsx) & [settings-service.test.ts](file:///P:/React%20native/OpenAPI_Companion/src/modules/settings/settings-service.test.ts)
- Update test cases to include `responseJsonSearch` in default preferences.

---

## Verification Plan

### Automated Tests
- Run test suite: `npm test --prefix "P:\React native\OpenAPI_Companion"`
- Verify 78 test suites pass with 100% success.
- Production build: `npm run build --prefix "P:\React native\OpenAPI_Companion"`.

### Manual Verification
- Verify in browser on `http://127.0.0.1:8008/docs`:
  - Execute an endpoint returning JSON (e.g. `GET /tasks` or `POST /auth/token`).
  - Verify Tree view renders with syntax highlighting and collapse chevrons.
  - Search for a keyword, navigate with `▲`/`▼` and <kbd>Enter</kbd>/<kbd>Shift+Enter</kbd>.
  - Verify collapsed nodes auto-expand to reveal matches.
  - Click `Collapse All` and `Expand All`.
  - Click `Raw` to view native Swagger output; click `Tree` to return to interactive tree.
  - Click `Copy JSON` and verify clipboard contents.
  - Test disabling feature in Config tab and verify response returns to native view.

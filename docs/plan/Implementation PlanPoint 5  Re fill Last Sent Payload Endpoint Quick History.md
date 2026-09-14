# Implementation Plan: Point 5 - 🔁 "Re-fill Last Sent Payload" (Endpoint Quick History)

Enable developers to 1-click restore the exact parameters (path, query, header) and request body used in the previous execution of any endpoint in Swagger UI.

## User Review Required

> [!IMPORTANT]
> **Strict Adherence to User Rules**:
> 1. **100% SVG Vector Icons (ZERO EMOJIS)**: All icons use crisp inline SVG vector graphics (`history` / `rotate-ccw`, `check`, `clock`). No emojis will be used anywhere to ensure system/font stability.
> 2. **Clean Status Feedback (No Error Strings in Button Label)**: The restore button label changes only to positive feedback (`Restored` with SVG checkmark) upon restoring; error or empty states are conveyed via subtle tooltip/styling, never showing raw error messages inside button labels.
> 3. **Non-Intrusive Auto-Visibility**: The "Last Payload" button is hidden when no previous execution has occurred for that endpoint, and becomes cleanly visible the moment an execution is sent or loaded from storage.
> 4. **Dual-Location Placement**:
>    - **Request Body Toolbar (`.oac-mock-data-bar`)**: Placed directly above the request body textarea next to Format and Fake Data.
>    - **Execute Wrapper (`.execute-wrapper`)**: Placed next to Swagger UI's native `.btn.execute` and `.btn-clear` buttons, ensuring endpoints with *only* path and query parameters (GET, DELETE) have full 1-click restore access.
> 5. **Cross-Session Storage Persistence**: Stores the last sent payload per endpoint in `chrome.storage.local` (with fast in-memory cache) so previous payloads survive page reloads and tab closes.

## Open Questions

None currently. The requirements, DOM selectors, and constraints are clearly defined.

## Proposed Changes

---

### In-Page Content Script Enhancement

#### [NEW] [swagger-endpoint-history.ts](file:///P:/React%20native/OpenAPI_Companion/src/content/swagger-endpoint-history.ts)
- Implement `EndpointPayloadSnapshot` interface:
  ```typescript
  export interface EndpointPayloadSnapshot {
    endpointId: string
    body?: string
    path?: Record<string, string>
    query?: Record<string, string>
    headers?: Record<string, string>
    timestamp: number
  }
  ```
- Implement payload extraction on Execute:
  - Hooks `.btn.execute` clicks via event delegation.
  - Reads `endpointIdOf(block)`, `bodyTextarea(block)?.value`, and `readParametersFromBlock(block)`.
  - Saves the snapshot to an in-memory cache and `chrome.storage.local` (storage key: `oac_last_payload_<endpointId>`).
- Implement 1-click refill logic:
  - If the operation block is not currently in "Try it out" mode, clicks `.try-out__btn` to open inputs.
  - Restores path, query, and header parameters via `writeRequestParameters()`.
  - Restores request body via `writeRequestBody()`.
  - Triggers native input/change events for full React/Swagger UI form synchronization.
- Implement DOM injection & button rendering:
  - Attaches `Last Payload` button in `.oac-mock-data-bar` and `.execute-wrapper`.
  - Dynamically updates visibility based on whether a snapshot exists.
  - Tooltip shows execution time and payload summary (e.g. `Last sent: 14:32 (3 params, 120B body)`).
  - Provides smooth visual feedback on click (`Restored` with checkmark icon for 1.5s).

#### [NEW] [swagger-endpoint-history.test.ts](file:///P:/React%20native/OpenAPI_Companion/src/content/swagger-endpoint-history.test.ts)
- Unit tests covering:
  - Capturing request body and parameters upon Execute button click.
  - Restoring request body and parameters into DOM inputs/textareas.
  - Auto-activating "Try it out" when restoring from collapsed/read-only state.
  - Button injection in `.oac-mock-data-bar` and `.execute-wrapper`.
  - Auto-hiding when no previous payload exists, and displaying when recorded.
  - Button label and feedback verification (ensuring zero error text in label).
  - Storage save and hydration across page sessions.

#### [MODIFY] [swagger-mock-data.ts](file:///P:/React%20native/OpenAPI_Companion/src/content/swagger-mock-data.ts)
- Add slot/class styling in `.oac-mock-data-bar` so the `Last Payload` button integrates seamlessly with the Format and Fake Data buttons without layout shifting.

#### [MODIFY] [index.tsx](file:///P:/React%20native/OpenAPI_Companion/src/content/index.tsx)
- Import and mount `mountSwaggerEndpointHistory(document, meta.id, storage)` alongside the other content script services.

---

## Verification Plan

### Automated Tests
- Run Vitest suite:
  ```powershell
  npm test -- --run
  ```
  Ensure all 74+ test files pass (targeting 680+ passing tests, 0 failures).
- Run production bundle build:
  ```powershell
  npm run build
  ```
  Ensure TypeScript compiles cleanly with zero type errors and asset bundles emit successfully.

### Manual Verification
- Open Swagger UI in browser:
  1. Open an endpoint with path/query parameters and request body (e.g. `POST /tasks`).
  2. Fill parameters and body, and click "Execute".
  3. Verify `Last Payload` button appears with SVG history icon and tooltip.
  4. Modify the inputs or click Swagger's "Clear" / "Cancel".
  5. Click `Last Payload` - verify all inputs and request body are restored instantly with green `Restored` confirmation.
  6. Reload the page and verify the button remains ready to restore the saved payload.

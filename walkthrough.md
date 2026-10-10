# OpenAPI Companion — Walkthrough Log

## 📦 Phase 1: Testing Foundation & Assertions Engine (Completed)

### Summary of Changes
Implemented a pure TypeScript, zero-dependency, Manifest V3 CSP-compliant **Assertion Engine** for OpenAPI Companion and integrated it into the workflow execution engine.

### Files Created
1. `src/modules/workflows/assertions/types.ts`: Domain types for `AssertionType`, `AssertionOperator`, `Assertion`, `AssertionResult`, and `AssertionTargetResponse`.
2. `src/modules/workflows/assertions/jsonpath.ts`: Safe JSONPath parser and extractor (`parseJsonPath`, `extractJsonPath`) supporting dot/bracket notation, array indexing, and `.length`.
3. `src/modules/workflows/assertions/evaluator.ts`: Assertion evaluator engine supporting status codes, case-insensitive headers, JSONPath values, type checks, string/array lengths, regex patterns, and response time thresholds with formatted diagnostic error messages.
4. `src/modules/workflows/assertions/index.ts`: Module exports.
5. `src/modules/workflows/assertions/assertions.test.ts`: 14 comprehensive unit tests verifying all operators and error paths.

### Files Modified
1. `src/modules/workflows/types.ts`: Extended `WorkflowStep` and `WorkflowExportStep` with `assertions?: Assertion[]`, and `StepRunResult` with `assertionResults?: AssertionResult[]` and `assertionsPassed?: boolean`.
2. `src/modules/workflows/workflow-service.ts`: Integrated assertion evaluation in `execute()`, updating step pass/fail based on assertions, and preserved `assertions` across `exportAll` and `importAll`.
3. `src/modules/workflows/index.ts`: Re-exported `assertions` module.
4. `src/modules/workflows/workflow-service.test.ts`: Added unit tests for passing assertions, failing assertions with `stop-on-failure`, continuing with `continue-on-failure`, and import/export roundtrip.
5. `TODO.md`: Updated with the complete 6-phase roadmap and checked off Phase 1 items.

### Verification Results
- `assertions.test.ts`: 14 / 14 passed
- `workflow-service.test.ts`: 21 / 21 passed
- All workflow tests (`WorkflowsPanel.test.tsx`, `workflow-service.test.ts`, `assertions.test.ts`): 41 / 41 passed (100% green)
- TypeScript check (`tsc --noEmit`): 0 errors
- ESLint (`src/modules/workflows`): 0 errors, 0 warnings

---

## ⏺️ Phase 2: API Scenario Recorder (Completed)

### Summary of Changes
Built an in-context **API Scenario Recorder** directly inside Swagger UI, allowing developers to record manual Swagger executions, automatically detect dynamic value chaining opportunities (e.g. `access_token`, `user_id`), review the captured flow in a dedicated Shadow DOM modal, and convert it into a fully configured Workflow in 1 click.

### Files Created
1. `src/modules/workflows/recorder/types.ts`: Domain models for recording state, recorded steps, scenario metadata, and suggested variable bindings.
2. `src/modules/workflows/recorder/heuristics.ts`: Dynamic value detection algorithm that identifies candidate IDs and tokens in responses and discovers reuse in subsequent request path parameters, query parameters, headers, and request bodies.
3. `src/modules/workflows/recorder/recorder-service.ts`: Recorder state machine coordinating start, pause, resume, stop, step capture, and workflow conversion with automatic variable substitutions and status assertions.
4. `src/modules/workflows/recorder/index.ts`: Module exports.
5. `src/modules/workflows/recorder/heuristics.test.ts`: 9 unit tests verifying candidate extraction, path/query/body matching, and false-positive prevention.
6. `src/modules/workflows/recorder/recorder-service.test.ts`: 3 unit tests verifying recording lifecycle, step capture, and conversion to workflow.
7. `src/components/ScenarioReviewModal.tsx`: Top-centered Shadow DOM modal with editable scenario title, dynamic variable detection callout banner, chronological step timeline with method badges, status pills, reordering controls, and 1-click workflow conversion.
8. `src/components/ScenarioReviewModal.test.tsx`: 4 unit tests verifying modal rendering, step reordering, deletion, and workflow conversion.
9. `src/content/scenario-modal.tsx`: In-page Shadow DOM host (`#oac-scenario-modal-host`) for `ScenarioReviewModal`.
10. `src/content/swagger-scenario-recorder.ts`: Floating in-page control bar (`#oac-scenario-bar-host`) mounted in Swagger UI with Idle, Recording (pulsing indicator), Paused, and Stop & Review controls.
11. `src/content/swagger-scenario-recorder.test.ts`: 2 unit tests verifying mounting, state transitions, and modal triggers.

### Files Modified
1. `src/core/events/types.ts`: Added typed events for `SCENARIO_RECORDING_STARTED`, `SCENARIO_RECORDING_PAUSED`, `SCENARIO_RECORDING_RESUMED`, `SCENARIO_RECORDING_STOPPED`, and `SCENARIO_STEP_CAPTURED`.
2. `src/content/index.tsx`: Mounted the floating scenario recorder bar and scenario modal overlay, synchronized with active project and theme manager.
3. `src/modules/workflows/index.ts`: Re-exported the `recorder` module.
4. `TODO.md`: Marked all Phase 2 items as completed.

### Verification Results
- Unit test suite: **1,001 / 1,001 tests passing (100% green across 109 test files)**
- TypeScript check (`tsc --noEmit`): **0 errors**
- ESLint: **0 errors, 0 warnings**
- Production Vite build (`npm run build`): **1,965 modules transformed, built in 11.39s**

---

## 🛠️ GitHub Actions CI Pipeline Verification & Quality Gate Fixes

### Summary of Changes
Executed and audited all checks in the GitHub Actions CI pipeline (`ci.yml` & `release.yml`). Fixed conditional React hooks violations, removed all disallowed explicit `any` types, applied Prettier formatting, and verified all 7 quality gates pass.

### Files Modified
1. `src/components/PaginationTesterModal.tsx`:
   - Moved early `if (!isOpen) return null` check after all React hook and ref declarations to comply with `react-hooks/rules-of-hooks`.
   - Replaced `catch (err: any)` with `catch (err: unknown)` and safe `err instanceof Error` checks.
2. `src/content/index.tsx`:
   - Safely typed `window.ui?.specSelectors?.specJson` with a typed window extension interface `SwaggerWindow`, removing all `(window as any)` casts.
3. `src/content/swagger-spec-detector.test.ts`:
   - Typed mock `specService` and `bus` using `Partial<SpecService>` and `Partial<EventBus>`, casting mock return to `SpecSnapshot`.
4. `src/modules/pagination/extractor.ts` & `src/modules/pagination/types.ts`:
   - Changed `records: any[]` to `records: unknown[]`.
5. `src/modules/pagination/runner.ts`:
   - Changed `catch (err: any)` to `catch (err: unknown)`.
6. `src/modules/pagination/extractor.test.ts`:
   - Safely typed record property assertions.
7. `src/modules/spec-detector/impact-analyzer.ts`:
   - Replaced `(paramChange.after as any)?.name` with safe optional chaining on `Record<string, unknown>`.
8. `src/modules/spec-detector/normalizer.ts`:
   - Replaced all explicit `any` occurrences with strict `Record<string, unknown>`.
9. `src/modules/spec-detector/spec-service.ts`:
   - Replaced fallback `(undefined as any)` with safe fallback error promise.
10. `src/modules/spec-detector/spec-service.test.ts`:
    - Replaced custom in-file `MemoryArea` with the canonical `createFakeArea()` from `@/tests/fake-storage`.
11. Prettier formatting applied across 33 files.

### Final Pipeline Gate Verification
- **ESLint (`npm run lint`)**: Passed with **0 errors, 0 warnings** (down from 44 errors).
- **Prettier Format Check (`npm run format:check`)**: Passed with **0 style issues**.
- **TypeScript Typecheck (`npm run typecheck`)**: Passed with **0 errors**.
- **Unit & Component Tests (`npm test` / `npm run test:coverage`)**: **123 test suites passed, 1,073 tests passed (100% green)**.
- **Dependency Audit (`npm audit --omit=dev --audit-level=high`)**: Passed with **0 vulnerabilities**.
- **Production Extension Build (`npm run build`)**: Passed with **1,980 modules transformed** (Chrome + Firefox release zip generated).
- **E2E Smoke Tests (`npm run test:e2e`)**: Passed **2 / 2 tests** (Chromium extension load & service worker registration).

---

## 🔐 Multi-Persona Auth, Dynamic Payload Fields, Auto-Refresh & Extraction Rules Fix (Completed)

### Problem Diagnosis & Root Causes
1. **401 Auto-Refresh and Token Injection on Replay**:
   - `auth.current()` initially returned `null` until a token was stored, which caused `TokenRefreshService.maybeRefresh()` to skip execution.
   - When running a saved login preset via `RequestService.applyTemplate()`, the response was replayed into Swagger UI, but fresh tokens weren't automatically captured and fed into Swagger's authorization header.
2. **Multi-Persona Support with Mandatory Parameters (`force_logout: true`)**:
   - Login schemas often require custom fields beyond `username` and `password` (e.g. `force_logout: true`, `tenant_id`, `role`).
   - The Auth Vault only accepted `username` and `password`, failing logins that mandate additional parameters.
3. **Extraction Rule Target Variable Misses**:
   - Extraction rules compared endpoints with strict string equality (`rule.endpointId === endpointId`).
   - Swagger DOM declared endpoints often have or omit trailing slashes (e.g. `post /auth/login/` vs `post /auth/login`), causing rules not to trigger.
4. **Stale Extension Build Banner**:
   - The sidepanel is an independent extension window (`chrome.sidePanel`) that previously only watched `projectId` changes across tabs, not `buildId` updates.

### Summary of Changes

#### 1. Dynamic Extra Payload Fields
- **Types (`src/modules/authentication/types.ts`)**:
  - Added optional `extraFields?: Record<string, string | number | boolean>` to `SavedLogin`.
- **UI (`src/modules/authentication/AuthPanel.tsx`)**:
  - Implemented `ExtraFieldsEditor` component supporting text, boolean (`true`/`false`), and number fields.
  - Integrated `ExtraFieldsEditor` into both "+ Add account with email & password" and "Edit credentials" forms.
  - Visual indicator on saved token badges showing extra fields count (e.g. `· 1 extra field`).
- **Bridge & RPC (`src/content/index.tsx`, `src/sidepanel/bridge.ts`)**:
  - Updated `auth.addByLogin` RPC to accept `extraFields` and pass them to `signIn` and vault persistence.
- **Login Payload Builder (`src/services/token-refresh.ts`)**:
  - Updated `buildLoginBody` and `signIn` to merge `login.extraFields` into the request JSON body during sign-in and automated token refresh.

#### 2. Automatic Login Token Capture & Swagger Authorization
- **Token Capture on Login (`src/services/token-refresh.ts`)**:
  - Updated `noticeResponses()` to detect 2xx responses on login endpoints.
  - Automatically parses the response JSON, extracts the bearer/auth token, and invokes `auth.applyToken()`.
  - Dispatches success notification: `⚡ Authorized in Swagger UI via <endpointId>`.

#### 3. Trailing Slash Normalization in Extraction Rules
- **Environment Service (`src/modules/environment/env-service.ts`)**:
  - Normalized endpoint paths in `applyExtraction()` using `.replace(/\/+$/, '')` so rules configured for `/auth/login` match responses from `/auth/login/` and vice-versa.

#### 4. Auto-Reload on Extension Rebuild
- **Sidepanel (`src/sidepanel/main.tsx`)**:
  - Added `mountedBuildId` tracking and updated `maybeReload()` to detect `next.context.buildId !== mountedBuildId`.
  - Added `STATE_PUSH` message listener so rebuilt content scripts trigger an automatic panel reload and eliminate stale build banners.

### Verification Results
- **Unit & Component Tests**: **123 / 123 test suites passing, 1,077 / 1,077 tests passing (100% green)**.
- **New Unit Tests Added**:
  - `AuthPanel.test.tsx`: Validated adding account with `force_logout: true` extra field.
  - `token-refresh.test.ts`: Validated merging `extraFields` during `signIn` and auto-capturing tokens on login endpoint responses in `noticeResponses`.
  - `env-service.test.ts`: Validated `applyExtraction` endpoint matching across trailing slash variants.
- **Production Build**: `npm run build` completed cleanly with 0 TypeScript and bundling errors.

---

## ⌨️ Default Keyboard Shortcuts Update: Ctrl+F for Command Palette & Ctrl+K for Shortcuts Manager (Completed)

### Summary of Changes
Updated default shortcut bindings across the extension so developers have an intuitive in-page find shortcut (`Ctrl+F` / `⌘F`) for opening the Command Palette, and `Ctrl+K` / `⌘K` to open the Keyboard Shortcuts configuration cheat-sheet / manager from both the page and side panel.

### Files Modified
1. `src/modules/shortcuts/types.ts`:
   - Updated `palette.toggle` default binding to `{ key: 'f', ctrlOrCmd: true }` (`Ctrl+F` / `⌘F`).
   - Updated `shortcuts.open` default binding to `{ key: 'k', ctrlOrCmd: true }` (`Ctrl+K` / `⌘K`).
2. `src/sidepanel/PanelShell.tsx`:
   - Updated keydown listener:
     - `Ctrl+F` / `⌘F`: opens the Command Palette via `onOpenPalette()`.
     - `Ctrl+K` / `⌘K`: opens the Keyboard Shortcuts Manager modal via `onOpenShortcutsModal()`.
   - Updated header action button tooltips:
     - Search icon: `Search endpoints (⌘F)`
     - Keyboard icon: `Keyboard shortcuts (⌘K)`
3. `src/sidebar/SidebarShell.tsx` & `src/sidebar/Dashboard.tsx`:
   - `SidebarShell.tsx`: updated keydown listener to trigger on `Ctrl+F` / `⌘F`, and updated search button tooltip to `Search endpoints (⌘F)`.
   - `Dashboard.tsx`: updated Quick Action button label from `Search ⌘K` to `Search ⌘F`.
4. `src/modules/shortcuts/shortcut-utils.test.ts`:
   - Updated conflict detection tests to verify `palette.toggle` conflicts on `Ctrl+F` and `shortcuts.open` conflicts on `Ctrl+K`.
5. `src/modules/shortcuts/KeyboardShortcutsModal.test.tsx`:
   - Updated conflict simulation test to press `Ctrl+F` to trigger and verify the conflict resolution dialog with `palette.toggle`.
6. `src/sidepanel/PanelShell.test.tsx`:
   - Updated unit tests for button labels (`Search endpoints (⌘F)`, `Keyboard shortcuts (⌘K)`) and delegation tests for `⌘F` (palette) and `⌘K` (shortcuts modal).

### Verification Results
- **Unit & Component Tests**: **123 / 123 test suites passing, 1,078 / 1,078 tests passing (100% green)**.
- **TypeScript Typecheck (`npm run typecheck`)**: Passed with 0 errors.
- **Production Build (`npm run build`)**: 1,980 modules transformed, built with 0 errors (Chrome + Firefox release packages generated).


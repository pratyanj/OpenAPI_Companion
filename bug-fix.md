# Bug Fix History & Lessons Learned (`bug-fix.md`)

This document maintains a continuous, detailed record of bugs, issues, and unexpected behaviors encountered in **OpenAPI Companion**, along with root cause analysis, resolutions, and actionable guidelines on **what to do and what NOT to do**.

---

## Index of Bugs & Issues

| ID | Issue Description | Component / Module | Status |
| --- | --- | --- | --- |
| **BUG-001** | Legacy Multi-Environment Profiles Leaking into In-Page Variable Modal | `QuickVariableModal.tsx`, `env-service.ts` | **Resolved** |
| **BUG-002** | Sidepanel & In-Page Sidebar Resets to Home (`dashboard`) on Every Reopen | `PanelShell.tsx`, `SidebarShell.tsx` | **Resolved** |
| **BUG-003** | History Modal Inspector Re-Mounting & Missing Chronological Index Numbers | `HistoryPanel.tsx`, `HistoryDetailModal.tsx` | **Resolved** |
| **BUG-004** | Git Tag Syntax Error & Redundant "Release" Word in Tag Name | Release process (`git tag`) | **Resolved** |
| **BUG-005** | Unauthorized Git Commit / Push Actions | Agent workflow / Git constraints | **Resolved** |
| **BUG-006** | Project Switcher Modal Squished Inside 400px Side Panel | `ProjectSwitcherModal`, `PanelShell.tsx`, `content/index.tsx` | **Resolved** |
| **BUG-007** | Project Linking Confusion & Complex Multi-Step Unlink/Link UX | `ProjectSwitcherModal`, `ProjectService` | **Resolved** |
| **BUG-008** | Cyclic Component Barrel Imports & Hoisted `vi.mock` Scoping in Vitest | `components/index.ts`, `OnboardingModal`, `FeedbackModal` | **Resolved** |
| **BUG-009** | Extension Update Lifecycle: Missing `onUpdateAvailable` & Data Loss on Manual Reinstall | `update-service.ts`, `background/index.ts`, `PanelShell.tsx` | **Resolved** |
| **BUG-010** | Feedback Modal Squished Inside 400px Side Panel Column | `FeedbackModal.tsx`, `feedback-modal.tsx`, `PanelShell.tsx` | **Resolved** |

---

## Detailed Bug Records

### BUG-001: Legacy Multi-Environment Profiles Leaking into In-Page Variable Modal

#### 1. Symptom / Reported Bug:
When opening the in-page Variable Modal via <kbd>Alt+V</kbd>, the modal displayed an **Environment** dropdown listing `Development`, `Local`, `Production`, `QA`, `Staging`, and `UAT`. 
The user never requested environment profiles, causing confusion because variables in OpenAPI Companion are already scoped 1-to-1 with the current Swagger page/origin as **Project Variables**.

#### 2. Root Cause:
* In earlier sprints (Sprint 8), the extension originally prototyped a Postman-like multi-environment switcher (`BUILTIN_ENVIRONMENTS`).
* Later, the architecture was intentionally streamlined to **Project Variables** (documented in `TODO.md` line 334: *"Removed redundant Local, QA, Staging, UAT, Production presets... Projects already map 1-to-1 with webpage origins/domains"*).
* However, `service.list()` still returned old environment records stored in browser storage (`projects/<id>/environments/`).
* When creating `QuickVariableModal.tsx`, an environment `<select>` dropdown was proactively added, unnecessarily exposing those legacy records to the user.

#### 3. Resolution:
* Removed the environment `<select>` dropdown, `EnvIcon`, and multi-environment switching logic from [`QuickVariableModal.tsx`](file:///p:/React%20native/OpenAPI_Companion/src/modules/environment/QuickVariableModal.tsx).
* Renamed the modal title to **Project Variables**.
* Directly bound the modal to the active project's variables store (`service.getActiveId()`).
* Replaced the dropdown with a clean variable count badge (`X variables stored for this project`) and search filter.
* Updated unit test suites in `QuickVariableModal.test.tsx` and `variables-modal.test.tsx`.

#### 4. Lessons Learned:
* **WHAT TO DO**:
  - Always verify whether domain models in the UI are project-scoped (1-to-1 with page origin) before adding selector dropdowns.
  - Check `TODO.md` and existing panel designs (e.g. `EnvironmentsPanel.tsx` uses "Project Variables", not environment profiles).
  - Keep modal interfaces simple, focused, and strictly aligned with what the user explicitly requested.
* **WHAT NOT TO DO**:
  - **Do NOT** assume legacy multi-environment concepts from early planning docs apply to modern streamlined UI.
  - **Do NOT** add extra profile pickers or config dropdowns unless specifically requested by the user.

---

### BUG-002: Sidepanel & In-Page Sidebar Resets to Home (`dashboard`) on Every Reopen

#### 1. Symptom / Reported Bug:
Whenever closing and reopening the native Side Panel or the in-page floating sidebar, the UI always opened on the **Home** (`dashboard`) tab, losing the user's working context and forcing them to repeatedly navigate back to `requests`, `auth`, `env`, `history`, `collections`, or `workflows`.

#### 2. Root Cause:
* In both [`PanelShell.tsx`](file:///p:/React%20native/OpenAPI_Companion/src/sidepanel/PanelShell.tsx) and [`SidebarShell.tsx`](file:///p:/React%20native/OpenAPI_Companion/src/sidebar/SidebarShell.tsx), the active tab state was initialized statically with `useState(DEFAULT_TAB)` (`'dashboard'`).
* Neither shell saved the active tab upon tab changes, nor restored the last active tab from storage upon mounting.

#### 3. Resolution:
* In `PanelShell.tsx`:
  - Created `lastTabKey = project?.id ? 'oac_last_tab_' + project.id : 'oac_last_tab'`.
  - Added `handleTabChange` writing to `chrome.storage.local`.
  - Added `useEffect` reading `lastTabKey` (and `oac_last_tab` fallback) on mount to restore the tab.
  - Wired into `<Tabs onChange>`, `onNavigate`, and `TAB_NAVIGATE` event bus listener.
* In `SidebarShell.tsx`:
  - Added equivalent tab persistence using `storage.set` and `storage.getData` (`projects/${projectId}/ui/last-tab`).
  - Added unit tests in `SidebarShell.test.tsx` verifying tab restoration and persistence.

#### 4. Lessons Learned:
* **WHAT TO DO**:
  - Maintain persistent UX context for user navigation across panel toggles and browser restarts.
  - Store UI state scoped per project (with a global fallback for when no project is loaded yet).
* **WHAT NOT TO DO**:
  - **Do NOT** leave navigational state purely ephemeral in side panels that users frequently open and close.

---

### BUG-003: History Modal Inspector Re-Mounting & Missing Chronological Index Numbers

#### 1. Symptom / Reported Bug:
* In the History timeline, executions had timestamps but no clear sequential index numbers (e.g. `#1`, `#2`, `#11`), making it hard to track repeated calls.
* Clicking between executions in the timeline caused the entire modal to re-render with a full-screen loading spinner, causing jarring screen flicker and dropping user focus.

#### 2. Root Cause:
* The selected record in `HistoryDetailModal.tsx` was triggering an unmount/re-mount cycle and calling redundant async `service.list()` requests on each click.
* Sequential chronological indices were not computed from the sorted call array.

#### 3. Resolution:
* Computed ascending chronological index badges: `#1` (first execution) to `#N (latest)`.
* Added `Call #X of N` badge directly in the inspector header.
* Implemented in-memory record cache (`cacheRef`) for 0ms instant execution switching.
* Updated `record` state in place without unmounting the modal or triggering full-screen loaders.
* Added 4 dedicated tabs: `Response`, `Request`, `Headers` (with badge count), and `Query & Params` (with badge count).

#### 4. Lessons Learned:
* **WHAT TO DO**:
  - When inspecting items in a detail modal, update state in-place to ensure smooth, zero-flicker transitions.
  - Cache loaded records in memory (`useRef`) to avoid duplicate background network/storage reads.
  - Always provide clear 1-based chronological call numbers (`#1`, `#2`, ...) for history timelines.
* **WHAT NOT TO DO**:
  - **Do NOT** show full-screen spinners when the user simply clicks between items in an already open inspector.

---

### BUG-004: Git Tag Syntax Error & Redundant "Release" Word in Tag Name

#### 1. Symptom / Reported Bug:
* Creating git tag for v1.2.0 failed or hung when running `git tag -m 'v1.2.0'`.
* Tag message initially included redundant words like `"Release v1.2.0"` when the user specifically requested clean semantic versioning without the word "release".

#### 2. Root Cause:
* `git tag -m <msg>` without specifying the tag name argument is invalid syntax. Correct syntax requires `git tag -a <tagname> -m <msg>`.
* Prompt requirements specified: *"in tag we don't need release word inside"*.

#### 3. Resolution:
* Created annotated tag using exact syntax: `git tag -a v1.2.0 -m "v1.2.0"`.
* Verified tag with `git tag -n` to confirm only `v1.2.0` is present without the word "release".

#### 4. Lessons Learned:
* **WHAT TO DO**:
  - Always use `git tag -a <tagname> -m "<tagname>"` for annotated releases.
  - Respect exact user naming requirements (e.g. omit "Release" when asked).
* **WHAT NOT TO DO**:
  - **Do NOT** run incomplete git command strings that cause interactive shell prompts or timeouts.

---

### BUG-005: Unauthorized Git Commit / Push Actions

#### 1. Symptom / Reported Bug:
* In pairing sessions, automated assistants sometimes commit or push code changes to remote repositories before the user has reviewed or tested them locally.

#### 2. Root Cause:
* Presumptive agent workflows that bundle editing, committing, and pushing in a single turn without waiting for human approval.

#### 3. Resolution:
* Established strict workspace rule in `AGENTS.md`:
  > **NEVER execute `git commit` or `git push` without explicit user permission.**
  > Always leave changes uncommitted for the user to review and manually test in their browser.
* All changes remain in the working tree until the user explicitly commands: *"commit this fix and push"*.

#### 4. Lessons Learned:
* **WHAT TO DO**:
  - Run tests and builds locally (`npm test`, `npm run build`), verify correctness, and present a concise summary.
  - Keep all modified and new files uncommitted until the user explicitly requests committing/pushing.
* **WHAT NOT TO DO**:
  - **NEVER** run `git commit` or `git push` autonomously.

---

### BUG-006: Project Switcher Modal Squished Inside 400px Side Panel

#### 1. Symptom / Reported Bug:
When clicking the active project badge / "Switch or Link Projects" button in the side panel header or the dashboard banner, the `ProjectSwitcherModal` opened inside the native Chrome side panel. Because Chrome's side panel is fixed to ~400px width, the modal's multi-column project list, port matcher, variable stats, and action buttons were squished, distorted, and awkward to view and navigate.

#### 2. Root Cause:
* `PanelShell.tsx` was directly rendering `<ProjectSwitcherModal>` in its own internal React tree.
* Modals requiring wide tabular layouts or multi-column cards cannot fit gracefully in narrow 400px columns.
* Previous wide modals (`CommandPalette`, `ShortcutsModal`, `WorkflowEditorModal`, `QuickVariableModal`) had already moved to in-page Shadow DOM overlays, but `ProjectSwitcherModal` was still trapped inside `PanelShell`.

#### 3. Resolution:
* Created [`src/content/project-switcher-modal.tsx`](file:///p:/React%20native/OpenAPI_Companion/src/content/project-switcher-modal.tsx) providing `mountProjectSwitcherModal()` into `#oac-project-switcher-host` in Shadow DOM with isolated CSS and an imperative handle (`open`, `close`, `toggle`, `destroy`).
* Integrated lazy loader `withProjectSwitcherModal()` in [`src/content/index.tsx`](file:///p:/React%20native/OpenAPI_Companion/src/content/index.tsx) and exposed RPC method `'projectSwitcher.open'`.
* Added and exported `openPageProjectSwitcher()` in [`src/sidepanel/bridge.ts`](file:///p:/React%20native/OpenAPI_Companion/src/sidepanel/bridge.ts).
* Updated [`src/sidepanel/main.tsx`](file:///p:/React%20native/OpenAPI_Companion/src/sidepanel/main.tsx) to pass `onOpenProjectSwitcher={openPageProjectSwitcher}` to `PanelShell`.
* Updated [`src/sidepanel/PanelShell.tsx`](file:///p:/React%20native/OpenAPI_Companion/src/sidepanel/PanelShell.tsx) to delegate the header project button and dashboard banner to `onOpenProjectSwitcher`, guarding `<ProjectSwitcherModal>` so it never renders inside the side panel when the bridge is active.

#### 4. Lessons Learned:
* **WHAT TO DO**:
  - Always host spacious, multi-column management modals directly on the webpage overlay via Shadow DOM rather than inside the narrow 400px side panel.
  - Expose an RPC method from content script (`projectSwitcher.open`) and delegate modal opening from the sidepanel bridge.
  - Import components directly (e.g. `@/components/ProjectSwitcherModal`) when bundling across multiple entry points to prevent circular rollup chunk warnings.
* **WHAT NOT TO DO**:
  - **Do NOT** render complex, wide modals inside the side panel when an in-page Shadow DOM overlay host is available.

---

### BUG-007: Project Linking Confusion & Complex Multi-Step Unlink/Link UX

#### 1. Symptom / Reported Bug:
The previous modal used technical "Link" and "Unlink Origin" buttons. Users found it difficult to understand which origins/ports belonged to which project, and moving an origin to a different project required a confusing multi-step dance (first finding and clicking "Unlink Origin", then searching for the target project, then clicking "Link").

#### 2. Root Cause:
* Technical terminology ("Link", "Unlink Origin", "Bindings") exposed internal storage implementation details rather than a user-friendly workspace concept.
* Projects did not visually group their connected URLs/ports, hiding which ports belonged to which project.
* `linkOriginToProject` did not automatically clean up previous project associations, forcing manual unlinking prior to re-linking.

#### 3. Resolution:
* Redesigned `ProjectSwitcherModal.tsx` around **Workspaces & Projects**:
  - Each project is presented as a clean Card displaying its **Connected Ports & URLs as visual chips** (e.g. `[ :8008 (this tab) ]`, `[ :8009 ✕ ]`).
  - Added 1-Click **"Switch to This Project"** action which moves the current tab's origin directly to the target project in one atomic operation.
  - Enhanced `ProjectService.linkOriginToProject` to automatically remove the origin from any previous project's `linkedOrigins`, eliminating the need for manual pre-unlinking.
  - Added individual `✕` button to each extra port chip to disconnect ports directly without switching.
  - Replaced "Unlink Origin" with plain-English "Disconnect Tab" (reverting the tab to its own independent workspace).
* Added unit tests in `project-service.test.ts` and `project-switcher-modal.test.tsx` verifying 1-click re-linking and chip rendering.

#### 4. Lessons Learned:
* **WHAT TO DO**:
  - Use visual tags/chips to make multi-origin relationships immediately transparent to the developer.
  - Provide 1-click atomic actions ("Switch to This Project") that handle internal cleanup under the hood.
  - Use plain-English terminology ("Workspaces", "Connected Ports", "Switch", "Disconnect").
* **WHAT NOT TO DO**:
  - **Do NOT** require users to manually unlink/deregister an entity before moving it to a new target.
  - **Do NOT** hide relationship mappings inside technical labels like "Link" without showing which URLs are actually connected.

---

### BUG-008: Cyclic Component Barrel Imports & Hoisted `vi.mock` Scoping in Vitest

#### 1. Symptom / Reported Bug:
When running Vitest on new modal test suites (`OnboardingModal.test.tsx`, `FeedbackModal.test.tsx`), tests crashed with:
`ReferenceError: Cannot access '__vi_import_4__' before initialization`
and in `feedback-service.test.ts`:
`ReferenceError: chrome is not defined`.

#### 2. Root Cause:
* **Cyclic Barrel Imports**: Components in `src/components/` imported shared primitives from `@/components` (the barrel `index.ts`), while `index.ts` re-exported those same modals. When Vitest evaluated test files with hoisted mocks, this cyclic dependency triggered an uninitialized module access.
* **Hoisted `vi.mock` Factory Scope**: In Vitest, `vi.mock` factories are hoisted to the top of the file above top-level imports. Referencing an imported symbol (such as `ok` from `@/types`) inside the factory causes a ReferenceError at runtime.
* **Unstubbed Chrome Global**: Node test environments do not have a global `chrome` object by default unless stubbed.

#### 3. Resolution:
* **Relative Imports Inside Component Directory**: Switched all sibling component imports in `OnboardingModal.tsx` and `FeedbackModal.tsx` to direct relative paths (e.g. `./Dialog`, `./Button`, `./Input`, `./Spinner`, `./icons`) instead of importing from the `@/components` barrel.
* **Inline Result Objects in Mock Factories**: Replaced calls to imported functions like `ok(...)` inside `vi.mock` factories with plain `{ ok: true, value: ... }` objects.
* **Storage Stub with `createFakeArea`**: Used `createFakeArea()` and `vi.stubGlobal('chrome', { storage: { local: fakeArea } })` to provide realistic, isolated in-memory Chrome storage.
* All 102 test files (953 tests) and `tsc --noEmit` pass with 0 errors.

#### 4. Lessons Learned:
* **WHAT TO DO**:
  - Within `src/components/`, always import sibling components relatively (`./Dialog`), never via the barrel (`@/components`).
  - Keep `vi.mock` factory functions free of external top-level imported variables; use inline mocks or literals.
  - In unit tests exercising `chrome.storage.local`, use `createFakeArea()` from `@/tests/fake-storage` with `vi.stubGlobal('chrome', ...)`.
* **WHAT NOT TO DO**:
  - **Do NOT** import from `@/components` inside any file inside `src/components/` to prevent cyclic import deadlocks.
  - **Do NOT** reference top-level imports inside `vi.mock` factories.

---

### BUG-009: Extension Update Lifecycle: Missing `onUpdateAvailable` & Data Loss on Manual Reinstall

#### 1. Symptom / Reported Bug:
When updating the extension, Chrome did not display an update notification or update button to users. Users assumed they had to **Remove** and reinstall the extension from `chrome://extensions`, which permanently wiped out their `chrome.storage.local` database (all saved projects, auth tokens, history records, and variables).

#### 2. Root Cause:
* **Deferred Chrome Updates**: Chrome downloads Web Store updates in the background but suppresses applying them while the extension's side panel or background worker is active. Without `chrome.runtime.onUpdateAvailable`, the update sits dormant until browser restart.
* **Missing In-Extension Update Checks**: The extension had no mechanism to trigger `chrome.runtime.requestUpdateCheck()` on demand.
* **Storage Destruction on Uninstallation**: Clicking the trash can / "Remove" button in `chrome://extensions` is an explicit uninstall, which causes Chrome to drop all extension storage partitions. Clicking the circular **Reload (⟳)** button or calling `chrome.runtime.reload()`, however, preserves 100% of storage.

#### 3. Resolution:
* **Background Update Listener**: Added `chrome.runtime.onUpdateAvailable` listener in `src/background/index.ts` to capture downloaded updates and persist `oac_update_available: { version, at }`.
* **Top Update Banner in Side Panel**: In `PanelShell.tsx`, added a live notification banner that surfaces when a new build is ready:
  `⚡ Update ready (v1.2.1)! [Update Now] [Dismiss]`.
* **Safe In-Place Reload**: Clicking **"Update Now"** calls `applyUpdateAndReload()` (`chrome.runtime.reload()`), instantly restarting the extension with the new code while retaining 100% of projects, tokens, and history.
* **Manual Check Button in Settings**: Added a **"Check for updates"** button in `SettingsPanel.tsx` using `chrome.runtime.requestUpdateCheck()`. If running unpacked, informs developers to use the ⟳ reload icon instead of removing the extension.
* **Version Bump to `1.2.1`**: Bumped `package.json` to `1.2.1` to trigger Chrome Web Store and browser update listeners.

#### 4. Lessons Learned:
* **WHAT TO DO**:
  - Always listen to `chrome.runtime.onUpdateAvailable` in MV3 background workers to give users control over applying updates.
  - Use `chrome.runtime.reload()` for updates — it never deletes `chrome.storage.local` data.
  - In local development, always use the circular **Reload (⟳)** button in `chrome://extensions`, NEVER the "Remove" trash can.
  - Always bump `version` in `package.json` before uploading to Chrome Web Store.
* **WHAT NOT TO DO**:
  - **Do NOT** advise users or developers to remove and reinstall the extension to update it.
---

### BUG-010: Feedback Modal Squished Inside 400px Side Panel Column & Migration to In-Page Swagger Overlay

#### 1. Symptom / Reported Bug:
When opening the **Share Feedback & Suggestions** modal from either the Side Panel header or Settings tab, the modal opened inside the narrow (~400px) Chrome Side Panel column. This severely constrained the modal layout:
- The 3-category selector buttons (`💡 Feature Idea`, `🐛 Bug Report`, `💬 General`) were squished into narrow columns.
- The 5-star experience rating labels and stars felt crowded.
- The message textarea had limited horizontal space for typing detailed suggestions.
- The metadata footer and action buttons were cramped at the bottom.

#### 2. Root Cause:
- `PanelShell.tsx` and `SettingsPanel.tsx` were directly rendering `<FeedbackModal>` in their local React component trees inside the Side Panel iframe/window.
- Modals styled with standard dialog dimensions (`max-w-lg` = 512px) overflow or get crushed when rendered inside a 400px-wide side panel container.

#### 3. Resolution:
- **In-Page Shadow DOM Overlay Mount**: Created `src/content/feedback-modal.tsx` exporting `mountFeedbackModal(bus, doc)` mounting into `#oac-feedback-modal-host` directly in the active Swagger page DOM.
- **Isolated Styling & Backdrop**: Uses Shadow DOM with injected `styles/index.css` and `Dialog.tsx`'s full-viewport fixed overlay (`fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/60 backdrop-blur-[1px]`), giving it generous 512px–672px width and centering over the Swagger documentation.
- **RPC Exposure**: Registered `feedbackModal.open` in `src/content/index.tsx` with lazy loading via dynamic import (`await import('./feedback-modal')`).
- **Side Panel Bridge & Fallback**: Exported `openPageFeedbackModal()` in `src/sidepanel/bridge.ts`. Wired into `PanelShell.tsx` header button and `SettingsPanel.tsx` "Share Feedback" button via `PanelOutlet.tsx`, with automatic graceful fallback to opening locally inside the panel if disconnected from an active Swagger tab.
- **Automated Test Coverage**: Added `src/content/feedback-modal.test.tsx` verifying Shadow DOM mounting, opening/closing, initial category passing, and clean DOM unmounting on destroy. All 104 test files (963 tests) pass cleanly. Dual bundle build (`npm run build` and `npm run build:firefox`) verified with 0 errors.

#### 4. Lessons Learned:
* **WHAT TO DO**:
  - Always host multi-column forms, star-rating dialogs, and feedback prompts directly in the webpage viewport via Shadow DOM rather than confining them to the 400px side panel.
  - Provide graceful local fallbacks in the Side Panel so users can still submit feedback even when viewing empty or disconnected tabs.
  - Lazily load modal bundles in the content script so initial page script footprint remains minimal.
* **WHAT NOT TO DO**:
  - **Do NOT** render 500px+ dialogs inside a 400px side panel without checking if an in-page overlay host can provide full viewport space.

---





## Quick Reference: Checklist for Future Features & Fixes

1. [ ] **Scope Check**: Does this feature belong to the active **Project** (1-to-1 with Swagger origin) or does it truly require multi-origin handling? (Avoid adding redundant environment dropdowns).
2. [ ] **State Persistence**: When the user navigates, closes a tab, or closes the panel, is their active view saved to storage so it reopens where they left off?
3. [ ] **Smooth Transitions**: Are modal updates performed in-place without jarring full-screen loading spinners?
4. [ ] **Zero Unsolicited Git Actions**: Are all files left uncommitted for user review?
5. [ ] **Dual Build Validation**: Have both Chrome (`npm run build`) and Firefox (`npm run build:firefox`) targets been verified?

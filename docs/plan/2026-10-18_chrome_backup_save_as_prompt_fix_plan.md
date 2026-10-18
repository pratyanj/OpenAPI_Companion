# Implementation Plan: Prevent "Save As" Prompt in Chrome for Backup Downloads

## Problem Description
When running OpenAPI Companion in Google Chrome, downloading a backup (either manual or scheduled) into a configured subfolder (e.g. `OpenAPI-Companion-Backups-ch`) causes Chrome to open the native Windows "Save As" file dialog, asking the user where to store the file.
In Firefox, the backup saves directly to the designated folder without displaying the "Save As" prompt.

The user specifically requested:
> *"in chrome it still ask me where to store but in firefox it is working so make change that does not effect the firefox save setting"*

## Root Cause Analysis
1. **Missing `chrome.downloads.onDeterminingFilename` in Chrome**:
   In Chromium, `chrome.downloads.download({ saveAs: false, conflictAction: 'uniquify' })` delegates path and conflict resolution to the browser's download manager. If Chrome's global setting *"Ask where to save each file before downloading"* is enabled or Chrome's heuristic flags the subfolder, Chrome opens the Save As file dialog unless the extension listens to `chrome.downloads.onDeterminingFilename` and calls `suggest({ filename: item.filename, conflictAction: 'uniquify' })`.
2. **Blob URL Heuristics in Chrome vs Firefox**:
   `downloader.ts` passes a `blob:chrome-extension://...` URL to `chrome.downloads.download()`. In Chromium, extension blob URLs with relative subfolders trigger security heuristics because blob URLs have no origin/content-disposition headers. Firefox, in contrast, fully honors `saveAs: false` with Blob URLs.
3. **Firefox API Constraints**:
   Firefox does **not** support `chrome.downloads.onDeterminingFilename` (it is `undefined` on `browser.downloads`). Attempting to call or register it without guards in shared code would break Firefox. Firefox already works correctly without it.
4. **Browser-level Policy Override**:
   If a user has *"Ask where to save each file before downloading"* turned ON in `chrome://settings/downloads`, Chrome may still prompt unless guidance is provided.

---

## Proposed Changes

### 1. `src/background/index.ts` (Chrome `onDeterminingFilename` Handler)
- Register a listener for `chrome.downloads.onDeterminingFilename` guarded with `if (chrome.downloads?.onDeterminingFilename)` so it is completely inert in Firefox.
- In the listener:
  - Check if `item.byExtensionId === chrome.runtime.id`.
  - If initiated by OpenAPI Companion, immediately call `suggest({ filename: item.filename, conflictAction: 'uniquify' })`. This informs Chromium that the extension has determined the destination path and instructs it to resolve any duplicate filenames with `(1)` rather than opening a Save As dialog.
  - If not initiated by our extension, call `suggest()` without arguments to preserve standard browser behavior.

### 2. `src/modules/settings/downloader.ts` (Dual-Browser Optimized URL Resolution)
- Detect Firefox using `typeof navigator !== 'undefined' && /firefox/i.test(navigator.userAgent)`.
- **For Firefox**: Keep the exact existing `URL.createObjectURL(new Blob([content], { type: mime }))` logic unchanged to ensure 0 regression on Firefox.
- **For Chrome/Chromium**:
  - For payloads under 1.5MB (standard for JSON backups and settings), use an inline Data URL `data:${mime};charset=utf-8,${encodeURIComponent(content)}`. This bypasses Chromium's extension blob security heuristics while staying well under Chrome's 2MB IPC URL limit.
  - For payloads $\ge$ 1.5MB, fallback to `URL.createObjectURL`.
- Keep `saveAs: false` and `conflictAction: 'uniquify'`.

### 3. `src/modules/settings/SettingsPanel.tsx` (Chrome User Guidance)
- Below the **Backup Subfolder** input and path preview in `SettingsPanel.tsx`, add a helpful guidance note:
  > *Tip: To save silently in Chrome without the "Save As" prompt, ensure "Ask where to save each file before downloading" is turned off in `chrome://settings/downloads`.*

### 4. Tests
- Update `src/modules/settings/downloader.test.ts` to test both Firefox Blob URL and Chrome Data URL handling.
- Add unit tests verifying `onDeterminingFilename` registers and suggests `conflictAction: 'uniquify'` when `byExtensionId` matches.

---

## Verification Plan

### Automated CI Quality Gates (Mandatory across all 7 gates)
1. Pre-gate formatting: `npm run format`
2. Gate 1: `npm run lint` (ESLint — 0 errors, 0 warnings)
3. Gate 2: `npm run format:check` (Prettier — 100% conforming)
4. Gate 3: `npm run typecheck` (`tsc --noEmit` — 0 errors)
5. Gate 4: `npm test` (All Vitest suites 100% green)
6. Gate 5: `npm audit --omit=dev --audit-level=high` (0 vulnerabilities)
7. Gate 6: `npm run build` (Chrome bundle + Firefox AMO release zip)
8. Gate 7: `npm run test:e2e` (Playwright Chromium smoke tests)

### Git Commit
- Once all 7 quality gates pass green:
  `fix(settings): prevent Save As prompt in Chrome for backup downloads`

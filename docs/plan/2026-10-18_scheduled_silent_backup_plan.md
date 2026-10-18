# Implementation Plan: Scheduled Silent Background Backup

## Problem Description
When scheduled auto-backup triggers in the background:
1. It must save directly to the pre-configured directory path (e.g., `Downloads/OpenAPI-Companion-Backups/` or custom folder) without presenting any interactive "Save As" prompts or dialogs.
2. It should run completely silently in the background and **not show or clutter the browser's download tab / download shelf** (`chrome://downloads`).

## Root Cause & Proposed Architecture
1. **Direct Path & SaveAs Prevention**:
   - In `chrome.downloads.download({ ... })`, `saveAs: false` is supplied.
   - When users provide a custom subfolder path in settings (e.g. `Backups/Daily`), `sanitizeSubfolder` normalizes and ensures valid relative formatting so Chromium writes directly into the selected subfolder under Downloads without falling back to prompt dialogs.
2. **Download Shelf & History Suppression**:
   - Chromium's `chrome.downloads` API provides `chrome.downloads.erase({ id: downloadId }, callback)` which explicitly removes the download item from Chrome's download history / tab / shelf **without deleting the physical file from the user's disk**.
   - When auto-backup runs in the background (`auto: true`), we pass `silent: true` to the downloader.
   - Once the download reaches `state: 'complete'` via `chrome.downloads.onChanged` (or a fallback timeout if `onChanged` isn't available), `universalDownloader` immediately calls `chrome.downloads.erase({ id: downloadId })`.
   - This ensures the backup file is safely stored on the user's local disk while leaving the browser download tab and download shelf completely clean.

---

## Proposed File Changes

### 1. `src/modules/settings/downloader.ts`
- Extend `DownloadOptions` with `silent?: boolean`.
- In `universalDownloader`:
  - When `options?.silent` is `true` and `downloadId` is received:
  - Register a listener on `chrome.downloads.onChanged` for that specific `downloadId`.
  - When `delta.state?.current === 'complete'`, remove the listener and call `chrome.downloads.erase({ id: downloadId })`.
  - Add a safety cleanup timeout (15s) in case the completion event was missed or already finished.

### 2. `src/modules/settings/import-export-service.ts`
- In `backup(auto = false, ...)`:
  - Pass `silent: auto` in the download options so scheduled/automated backups run silently in the background while manual user-initiated downloads keep their standard browser download indicator.

### 3. `src/modules/settings/downloader.test.ts`
- Add unit test verifying that when `silent: true` is passed, `universalDownloader` listens to `chrome.downloads.onChanged` and triggers `chrome.downloads.erase({ id: downloadId })` upon download completion.

### 4. `src/background/backup-scheduler.test.ts`
- Verify that `runScheduledBackup()` invokes `io.backup()` with `auto = true` (which triggers `silent: true`), ensuring seamless background execution.

---

## Verification Plan

### Automated CI Quality Gates (Mandatory)
1. Pre-gate formatting: `npm run format`
2. Gate 1: `npm run lint` (ESLint — 0 errors, 0 warnings)
3. Gate 2: `npm run format:check` (Prettier)
4. Gate 3: `npm run typecheck` (`tsc --noEmit` — 0 errors)
5. Gate 4: `npm test` (All 123 test suites 100% green)
6. Gate 5: `npm audit --omit=dev --audit-level=high` (0 vulnerabilities)
7. Gate 6: `npm run build` (Chrome bundle + Firefox AMO release zip)
8. Gate 7: `npm run test:e2e` (Playwright Chromium smoke tests)

### Git Commit
- Once all 7 quality gates are verified green, commit with message:
  `fix(settings): execute scheduled backups silently without download shelf pollution`

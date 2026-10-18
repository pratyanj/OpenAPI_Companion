# Implementation Plan: Restrict Scheduled Automated Backups to Firefox Only

## Problem Description
In Google Chrome, background downloads initiated by extensions are subject to browser-level download prompts and download shelf behavior when writing to subfolders. In contrast, Firefox handles background downloads silently without prompting.
The user requested:
> *"I think we can remove this nable Scheduled Backup from the chrome or wee can disable this and only available for firefox make it like this"*

## Proposed Solution

### 1. Browser Detection Helper (`isScheduledBackupSupported`)
- Define a helper function `isScheduledBackupSupported()` in `src/background/backup-scheduler.ts` and `src/modules/settings/downloader.ts`:
  - Returns `true` if running in Firefox (`/firefox/i.test(navigator.userAgent)` or `usesSidebarAction()`).
  - Returns `false` in Chrome/Chromium.

### 2. Settings UI Update (`src/modules/settings/SettingsPanel.tsx`)
- Detect if running in Firefox using `isScheduledBackupSupported()`.
- **In Firefox**:
  - Render the full "Automated Backups" section with the toggle, frequency selector, interval, delta detection, and subfolder input.
- **In Chrome**:
  - Render the "Automated Backups" section in an informative disabled state:
    - Badge: `[Firefox Only]`
    - Clear explanatory text:
      *"Automated scheduled backups are available exclusively in Firefox. Chrome's download manager requires manual user confirmation for subfolder writes. Please use the 1-click manual backup below in Chrome."*
    - The checkbox is disabled / un-toggleable in Chrome.

### 3. Background Alarm Protection (`src/background/backup-scheduler.ts`)
- In `syncBackupAlarm(prefs)`:
  - If `!isScheduledBackupSupported()`, clear any existing `oac-auto-backup-alarm` alarm immediately and exit early.
- In `runScheduledBackup()`:
  - If `!isScheduledBackupSupported()`, exit immediately with `{ executed: false, reason: 'Scheduled backup is only supported in Firefox' }`.

### 4. Tests
- Update `src/background/backup-scheduler.test.ts` to test that `syncBackupAlarm` and `runScheduledBackup` abort cleanly when running in a non-Firefox environment.
- Update `src/modules/settings/SettingsPanel.test.tsx` to verify the "Firefox Only" badge and message render in Chrome.

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
- Once verified:
  `feat(settings): restrict scheduled backup to Firefox and display notice in Chrome`

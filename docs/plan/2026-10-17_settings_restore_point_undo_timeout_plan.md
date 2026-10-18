# Implementation Plan — Bug Fix: Settings Restore Point "Undo Import" 1-Minute Auto-Dismiss Timeout

**Date:** 2026-10-17  
**Status:** Planned  

---

## Context & Bug Description
When a user restores a backup file in the Settings tab, OpenAPI Companion captures a pre-import snapshot to allow the user to roll back unintended imports via an "Undo Import" button.
**Issue**: The "Undo Import" button stays visible indefinitely instead of auto-dismissing after 1 minute (60 seconds). If the panel is reopened, stale restore points are also restored indefinitely.

---

## Proposed Changes

### 1. Backend Service (`src/modules/settings/import-export-service.ts`)
- Define `RESTORE_POINT_TTL_MS = 60_000` (1 minute).
- In `getPreImportSnapshot()`:
  - Check snapshot age: `this.now() - snapshot.timestamp > RESTORE_POINT_TTL_MS`.
  - If older than 60 seconds, automatically delete `SNAPSHOT_KEY` from storage, flush, and return `null`.
- In `rollbackLastImport()`:
  - If snapshot is expired, fail gracefully with `Restore point has expired (valid for 1 minute).`

### 2. UI Banner Timer (`src/modules/settings/SettingsPanel.tsx`)
- Add a `useEffect` hook listening to `hasRestorePoint`:
  - Compute remaining time: `remainingMs = Math.max(0, 60_000 - (Date.now() - hasRestorePoint.timestamp))`.
  - If `remainingMs <= 0`, immediately set `setHasRestorePoint(null)`.
  - Otherwise, register a `setTimeout` for `remainingMs` that sets `setHasRestorePoint(null)`.
  - Clean up timer on unmount or when `hasRestorePoint` changes.
- Update banner helper text to indicate: `"Available for 1 minute after import"`.

### 3. Unit Tests
- `src/modules/settings/import-export-service.test.ts`:
  - Verify snapshot returns within 60s.
  - Advance time past 60s and verify `getPreImportSnapshot()` returns `null` and clears storage.
- `src/modules/settings/SettingsPanel.test.tsx`:
  - Verify restore point banner is displayed initially.
  - Advance timers by 60,000ms and verify the "Undo Import" banner automatically disappears from the DOM.

---

## Quality Gate Verification
After implementing changes:
1. Run `npm run format` (Prettier)
2. Run `npm run format:check`
3. Run `npm run lint`
4. Run `npm run typecheck`
5. Run `npm test`
6. Run `npm audit --omit=dev --audit-level=high`
7. Run `npm run build`
8. Run `npm run test:e2e`

---

## Commit Strategy
Following the user's rule ("one bug fix in one plan so we have simple one bug one commit"):
- Once verified, commit this fix with a targeted commit message:
  `fix(settings): auto-dismiss restore point undo button after 1 minute`

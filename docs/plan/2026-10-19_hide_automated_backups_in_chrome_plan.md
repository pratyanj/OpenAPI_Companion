# Implementation Plan: Hide Automated Backups Section in Chrome

## Overview
In the Settings panel, the "Automated Backups" section currently displays an informative card with a `[Firefox Only]` badge when viewed in Google Chrome. The user requested to completely hide this section in Chrome instead of showing the notice card, keeping the Settings UI clean while leaving the manual download backup buttons in the "Data" section 100% functional in all browsers.

---

## User Review Items & Design Decisions
1. **Chrome Settings View**:
   - The entire `<Section title="Automated Backups">...</Section>` is conditionally rendered only when `isScheduledBackupSupported()` is true.
   - In Chrome, `isScheduledBackupSupported()` is `false`, so the "Automated Backups" header and card will be completely omitted from the DOM.
2. **Firefox Settings View**:
   - In Firefox, `isScheduledBackupSupported()` is `true`, so the section renders normally with all controls (enable toggle, frequency dropdown, custom interval, change detection toggle, subfolder path input).
3. **Manual Backup Integrity**:
   - The manual backup actions under the "Data" section ("Download backup (all projects)" and "Download backup (current project)") remain completely untouched and fully functional in both Chrome and Firefox.

---

## Proposed File Modifications

### 1. `src/modules/settings/SettingsPanel.tsx`
- Wrap the `<Section title="Automated Backups">` block with `{isScheduledBackupSupported() && ( ... )}`.
- Remove the `!isScheduledBackupSupported()` placeholder notice card since the section is hidden when unsupported.

### 2. `src/modules/settings/SettingsPanel.test.tsx`
- Update the Chrome test case to verify that `Automated Backups` and `Firefox Only` do not exist in the DOM when running in Chrome.
- Verify that in Firefox, `Automated Backups` and `Enable scheduled backup` are present.

---

## Verification Plan

### Automated CI Quality Gates (All 7 Quality Gates)
1. `npm run lint` — ESLint 0 errors, 0 warnings.
2. `npm run format:check` — Prettier verification.
3. `npm run typecheck` — `tsc --noEmit` 0 errors.
4. `npm test` — Vitest unit & component suites (including `SettingsPanel.test.tsx`).
5. `npm audit --omit=dev --audit-level=high` — 0 vulnerabilities.
6. `npm run build` — Chrome bundle + Firefox manifest generation.
7. `npm run test:e2e` — Playwright smoke tests.

# Implementation Plan: Fix Inverted Import and Export Icons

The Import and Export action buttons currently display inverted icons:
- **Import** displays `UploadIcon` (tray with arrow pointing up $\uparrow$).
- **Export** displays `DownloadIcon` (tray with arrow pointing down $\downarrow$).

In standard UI design and user mental models, **Import** ingests data into the application (downward arrow / `DownloadIcon`), while **Export** extracts data out of the application (upward arrow / `UploadIcon`). We will swap the icons on these buttons to correctly reflect their actions.

---

## Proposed Changes

### 1. `src/modules/environment/EnvironmentsPanel.tsx`
- **Toolbar Action Buttons (lines 567-585):**
  - Change the **Import** button icon from `<UploadIcon className="h-3 w-3" />` to `<DownloadIcon className="h-3 w-3" />`.
  - Change the **Export** button icon from `<DownloadIcon className="h-3 w-3" />` to `<UploadIcon className="h-3 w-3" />`.
- **Empty State Action Button (lines 621-624):**
  - Change the "Import .env" empty state button icon from `<UploadIcon className="h-3 w-3 mr-1" />` to `<DownloadIcon className="h-3 w-3 mr-1" />`.

### 2. `src/modules/workflows/WorkflowsPanel.tsx`
- **Toolbar Action Buttons (lines 345-365):**
  - Change the "Import workflows" button icon from `<UploadIcon className="h-3.5 w-3.5" />` to `<DownloadIcon className="h-3.5 w-3.5" />`.
  - Change the "Export workflows" button icon from `<DownloadIcon className="h-3.5 w-3.5" />` to `<UploadIcon className="h-3.5 w-3.5" />`.

---

## Verification Plan

### Automated CI Quality Gates
1. Run `npm run format` (`prettier --write .`) to ensure styling conformity.
2. Run `npm run lint` (ESLint — 0 errors, 0 warnings).
3. Run `npm run format:check` (Prettier — 100% compliant).
4. Run `npm run typecheck` (`tsc --noEmit` — 0 errors).
5. Run `npm test` (All Vitest suites pass).
6. Run `npm audit --omit=dev --audit-level=high` (0 high/critical).
7. Run `npm run build` (Vite Chrome & Firefox builds succeed).
8. Run `npm run test:e2e` (Playwright Chromium smoke tests pass).

# Implementation Plan: Editable Auto-Extraction Rules & Fix Inverted Import/Export Icons

## Overview
This plan addresses two user requests:
1. **Editable Auto-Extraction Rules**: Currently, configured auto-extraction rules in the Environment panel can only be toggled (on/off) or deleted; there is no way to edit an existing rule. We will add an Edit action button to each rule row, support edit mode in `ExtractionRuleModal` and in-page overlays, and hook it up to `service.updateRule`.
2. **Fix Inverted Import & Export Icons**: In the Project Variables toolbar and empty state, the Import and Export button icons are currently inverted (Import has `UploadIcon` $\uparrow$ and Export has `DownloadIcon` $\downarrow$). We will swap them so Import uses `DownloadIcon` ($\downarrow$, incoming) and Export uses `UploadIcon` ($\uparrow$, outgoing).

---

## User Review Items & Design Decisions
- **Rule Edit UI Affordance**: Each rule row in `ExtractionRulesList` will feature an `EditIcon` (pencil icon) button with `title="Edit rule"` and `aria-label="Edit rule"`, placed alongside the active toggle switch and delete button.
- **Modal Reusability**: `ExtractionRuleModal` will accept an optional `ruleId?: string` prop:
  - If `ruleId` is provided, the dialog title is `"Edit Auto-Extraction Rule"`, submit button is `"Save Changes"`, and the form is populated with the rule's current values.
  - If `ruleId` is omitted, the dialog title remains `"Add Auto-Extraction Rule"` and button is `"Create Rule"`.
- **In-Page Overlay & Sidepanel Support**:
  - `ExtractionRuleModalOpenOptions` in `src/sidepanel/bridge.ts` and `src/content/extraction-rule-modal.tsx` will include `ruleId?: string`.
  - When opened with `ruleId`, in-page modal saves via `envService.updateRule` and publishes success notification `"Auto-extraction rule updated for <endpoint>"`.
  - When opened without `ruleId`, in-page modal continues using `envService.saveRule` and publishes `"Auto-extraction rule added for <endpoint>"`.
- **Standalone Fallback Support**:
  - In `ExtractionRulesList.tsx`, if the in-page modal overlay is unavailable (or in standalone tests), an internal modal will open in edit mode and invoke `onUpdateRule(ruleId, input)`.

---

## File-by-File Proposed Changes

### 1. `src/modules/environment/EnvironmentsPanel.tsx`
- **Icon Fixes:**
  - Swap `<UploadIcon>` with `<DownloadIcon>` for the **Import** button in the toolbar.
  - Swap `<DownloadIcon>` with `<UploadIcon>` for the **Export** button in the toolbar.
  - Swap `<UploadIcon>` with `<DownloadIcon>` for the "Import .env" button in the empty state.
- **Rule Editing:**
  - Add `ruleId?: string` to `onOpenExtractionRuleModal` parameter type in `EnvironmentsPanelProps`.
  - Implement `handleOpenEditRuleModal(rule: ExtractionRule)` to call `onOpenExtractionRuleModal({ ruleId: rule.id, endpointId: rule.endpointId, property: rule.property, targetVariable: rule.targetVariable, isSecret: rule.isSecret })`.
  - Implement `handleUpdateRule(id: string, patch: Partial<ExtractionRule>)` using `service.updateRule`.
  - Pass `onUpdateRule={handleUpdateRule}` and `onOpenEditModal={handleOpenEditRuleModal}` to `<ExtractionRulesList>`.

### 2. `src/modules/workflows/WorkflowsPanel.tsx`
- Align icon conventions:
  - Swap `<UploadIcon>` with `<DownloadIcon>` on "Import workflows".
  - Swap `<DownloadIcon>` with `<UploadIcon>` on "Export workflows".

### 3. `src/modules/environment/extraction-rules-types.ts`
- Ensure type definitions support partial rule updates for inputs.

### 4. `src/modules/environment/ExtractionRuleModal.tsx`
- Add optional `ruleId?: string` prop to `ExtractionRuleModalProps`.
- Set title: `ruleId ? 'Edit Auto-Extraction Rule' : 'Add Auto-Extraction Rule'`.
- Set submit button: `saving ? 'Saving...' : ruleId ? 'Save Changes' : 'Create Rule'`.
- Ensure initial values (`initialEndpointId`, `initialProperty`, `initialTargetVariable`, `initialIsSecret`) correctly initialize state for editing.

### 5. `src/modules/environment/ExtractionRulesList.tsx`
- Update `ExtractionRulesListProps` to add:
  - `onUpdateRule?: (id: string, patch: Partial<ExtractionRule>) => Promise<void>`
  - `onOpenEditModal?: (rule: ExtractionRule) => Promise<boolean | Result<void> | void> | boolean | Result<void> | void`
- Add Edit button `<button title="Edit rule" aria-label="Edit rule" onClick={() => void handleEditRule(rule)}><EditIcon className="h-3.5 w-3.5" /></button>` next to toggle and delete.
- Support modal state for editing (`activeModalRule: 'new' | ExtractionRule | null`).
- If `onOpenEditModal` fails or is not provided, open local `ExtractionRuleModal` with pre-filled rule values and invoke `onUpdateRule` on save.

### 6. `src/content/extraction-rule-modal.tsx` & `src/sidepanel/bridge.ts`
- Update `ExtractionRuleModalOpenOptions` to include `ruleId?: string`.
- In `mountExtractionRuleModal`:
  - Pass `ruleId={opts.ruleId}` to `ExtractionRuleModal`.
  - In `onSave`: if `opts.ruleId && envService.updateRule`, call `envService.updateRule(opts.ruleId, rule)` and notify `"Auto-extraction rule updated for <endpoint>"`.

### 7. Unit Tests
- `src/modules/environment/ExtractionRulesList.test.tsx`:
  - Add tests for editing rules: clicking edit button, updating values, submitting changes, delegating to `onOpenEditModal`, and calling `onUpdateRule`.
- `src/modules/environment/ExtractionRuleModal.test.tsx`:
  - Add test verifying edit mode rendering (title "Edit Auto-Extraction Rule", button "Save Changes") and save payload.
- `src/content/extraction-rule-modal.test.tsx`:
  - Add test verifying edit mode in in-page overlay.

---

## Verification Plan

### Automated CI Quality Gates (Mandatory)
Execute all quality checks via `run_command` with `BypassSandbox: true`:
1. `npm run format` (`prettier --write .`)
2. `npm run lint` (ESLint — 0 errors, 0 warnings)
3. `npm run format:check` (Prettier — 100% compliant)
4. `npm run typecheck` (`tsc --noEmit` — 0 errors)
5. `npm test` (All Vitest suites green)
6. `npm audit --omit=dev --audit-level=high` (0 high/critical)
7. `npm run build` (Vite Chrome & Firefox builds succeed)
8. `npm run test:e2e` (Playwright Chromium smoke tests pass)

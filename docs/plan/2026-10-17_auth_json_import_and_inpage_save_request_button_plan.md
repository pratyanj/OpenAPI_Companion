# Implementation Plan — Auth Tab JSON User Import & In-Page Swagger "Save Request" Button

**Date:** 2026-10-17  
**Status:** Planned  

---

## Overview
This implementation plan addresses two key user experience improvements:
1. **Auth Tab JSON Account Import**: Allow developers to paste raw JSON directly in the Auth tab to create or edit accounts/personas. Automatically extracts `email`/`username`, `password`, and custom payload fields (such as `force_logout: true`), and auto-derives the account name from the email prefix (e.g., `admin@example.com` → `admin`) if a custom name is not specified.
2. **In-Page Swagger UI "Save Request" Button**: Directly inject a "Save Request" action button into Swagger UI's rendered response section when an endpoint executes successfully (2xx status). Clicking it captures the executed operation parameters, query, and request body, opening the in-page Preset Editor with pre-populated data for 1-click saving without having to switch to the side panel.

---

## Proposed Changes

### Feature 1: Auth Tab JSON Account Import

#### File: `src/modules/authentication/AuthPanel.tsx`
- Add mode toggle in the "Add account" card: `[Form]` vs `[Paste JSON]`.
- In `Paste JSON` mode:
  - Provide a spacious monospace textarea for pasting arbitrary JSON payloads (e.g. `{ "email": "admin@example.com", "password": "pass", "force_logout": true }`).
  - **Auto-Extraction Logic**:
    - **Username/Email**: Detects `email`, `username`, `user`, `login`, or `user_name`.
    - **Password**: Detects `password`, `pass`, or `secret`.
    - **Account Name / Persona**: Detects `name`, `label`, `persona`, or `title`. **If missing**, auto-extracts the prefix before `@` from the email (e.g., `dev.tester@company.com` → `dev.tester`, or plain username if no `@`).
    - **Extra Payload Fields**: Automatically parses all other keys (e.g. `force_logout: true`, `tenant_id: "123"`, `role: "admin"`) and preserves their exact primitive types (`boolean`, `number`, `string`).
  - **Live Preview & Validation**:
    - Real-time syntax validation (syntax error message vs valid indicator).
    - Compact pill preview showing detected Account Name, Email, Password status, and extra field count.
  - **Actions**:
    - **"Sign in & save"**: Directly executes `service.addByLogin(name, username, password, extraFields)` and closes the form on success.
    - **"Switch to Form"**: Automatically maps the parsed values into the standard form inputs and switches tabs, allowing manual adjustment before saving.
- Also support "Import from JSON" in the edit credentials modal (`openLoginForm`).

#### Tests: `src/modules/authentication/AuthPanel.test.tsx`
- Test adding account via raw JSON.
- Test auto-derivation of account name from email prefix (`admin@example.com` → `admin`).
- Test extra payload fields extraction (`force_logout: true`).
- Test switching between JSON and Form modes.

---

### Feature 2: In-Page Swagger UI "Save Request" Button

#### File: `src/content/swagger-response-save-request.ts` (New module)
- Implements `mountSwaggerResponseSaveRequest(presetEditorHandle, doc)`:
  - Scans for live response cells (`.live-responses-table .response-col_description`).
  - Verifies response success: checks for 2xx status code via `isSuccessResponse(cell)`. Does **not** render on 4xx/5xx errors or before execution.
  - Inserts a styled `Save Request` button into the response action bar (`.oac-response-action-bar`), styled with matching HTTP method themes (GET blue, POST green, PUT orange, DELETE red, PATCH teal).
  - On click:
    - Reads the operation block DOM (`endpointId`, method, path parameters, query parameters, request body).
    - Invokes `presetEditor.open({ initialEndpointId, initialBody, initialPath, initialQuery, initialName })`.
    - Shows immediate visual feedback (`✓ Saved!` / `Opening editor...`).

#### File: `src/content/swagger-response-variable.ts`
- Coordinate `.oac-response-action-bar` layout so `Save Request` and `Save to Variable` sit side-by-side with clean spacing and matching styles.

#### File: `src/content/index.tsx`
- Mount `mountSwaggerResponseSaveRequest` inside content script initialization, wired to `withPresetEditor()`.

#### Tests: `src/content/swagger-response-save-request.test.ts` (New test file)
- Test button mounts only on successful 2xx responses.
- Test button does not mount on 4xx/5xx responses.
- Test clicking button extracts operation parameters & body and opens the preset editor.

---

## Quality Gate Verification Plan
After making code changes, run and verify all 7 gates locally:
1. `npm run format` (Prettier)
2. `npm run format:check`
3. `npm run lint`
4. `npm run typecheck`
5. `npm test`
6. `npm audit --omit=dev --audit-level=high`
7. `npm run build`
8. `npm run test:e2e`

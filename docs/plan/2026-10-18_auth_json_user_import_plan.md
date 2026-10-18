# Implementation Plan: Auth Tab Raw JSON User / Persona Import

## Problem Description
Currently, adding a new account/persona in the Auth tab requires developers to manually type the token name, email/username, password, and click "+ Add field" repeatedly for any custom payload parameters (e.g. `tenant_id`, `force_logout`, `scope`).
Developers frequently have credentials formatted as JSON from Postman, test fixtures, or login requests. They want to paste the raw JSON directly, with automatic extraction of email, password, and extra payload fields, and automatic derivation of account name from the email prefix (`admin@example.com` -> `admin`) when name is not explicitly provided.

## Proposed Architecture & Workflow

### 1. JSON Extraction Utility (`src/modules/authentication/auth-json-utils.ts`)
- `deriveAccountNameFromUsername(username: string)`:
  - If username contains `@`, extracts everything before the `@` (e.g. `admin@example.com` -> `admin`, `john.doe@company.org` -> `john.doe`).
  - If no `@`, uses username as fallback.
- `parseAccountJson(jsonString: string)`:
  - Parses JSON object.
  - Matches username/email from keys: `['username', 'email', 'user', 'login', 'identifier']`.
  - Matches password from keys: `['password', 'pass', 'secret', 'pwd']`.
  - Matches token name from keys: `['name', 'account', 'persona', 'title']`, or auto-derives from the email prefix if absent.
  - Automatically captures remaining primitive fields (boolean, number, string) as `ExtraFieldEntry` (e.g. `force_logout: true`, `tenant_id: "org_1"`).

### 2. UI Mode Toggle in Add Account Card (`src/modules/authentication/AuthPanel.tsx`)
- In the "Add account" card header, provide a segmented toggle:
  - `[Form]` (default field-by-field editor)
  - `[Paste JSON]` (raw JSON textarea with live parsing preview)
- In `[Paste JSON]` mode:
  - Textarea with placeholder showing sample JSON (`{ "email": "admin@example.com", "password": "...", "tenant_id": 1 }`).
  - Real-time detection feedback banner showing extracted details:
    `✓ Name: "admin" · Username: "admin@example.com" · Password: set · 1 extra field`
  - "Switch to Form" button (populates form state from JSON so user can review or customize).
  - 1-Click "Sign in & save" button (directly signs in and saves from parsed JSON).

### 3. Comprehensive Unit Tests
- `src/modules/authentication/auth-json-utils.test.ts`:
  - Validates extraction of username, email, password, and extra fields.
  - Validates auto-derivation of account name from email prefix (`admin@example.com` -> `admin`).
  - Validates graceful handling of invalid JSON and missing fields.
- `src/modules/authentication/AuthPanel.test.tsx`:
  - Validates switching to Paste JSON mode, entering JSON, and 1-click "Sign in & save" invoking `service.addByLogin(...)`.

---

## Verification Plan

### Automated CI Quality Gates (Mandatory)
1. Pre-gate formatting: `npm run format`
2. Gate 1: `npm run lint` (ESLint — 0 errors, 0 warnings)
3. Gate 2: `npm run format:check` (Prettier)
4. Gate 3: `npm run typecheck` (`tsc --noEmit` — 0 errors)
5. Gate 4: `npm test` (All Vitest suites 100% green)
6. Gate 5: `npm audit --omit=dev --audit-level=high` (0 vulnerabilities)
7. Gate 6: `npm run build` (Chrome bundle + Firefox AMO release zip)
8. Gate 7: `npm run test:e2e` (Playwright Chromium smoke tests)

### Git Commit
- Once all 7 quality gates are verified green, commit with message:
  `feat(auth): add raw JSON persona import with auto-derived account name`

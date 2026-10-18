# Implementation Plan: Feature 7.4 — Variable Import Raw JSON Support

## Overview
Developers frequently copy JSON payloads directly from API responses, Swagger execution outputs, or JSON configuration files. Currently, the Environment Variables Import modal only accepts standard `.env` (`KEY=VALUE`) or Postman export JSON (`{"values": [...]}`). Pasting standard JSON objects results in parsing failure or empty imports.

This feature enables developers to paste any raw JSON payload into the Import modal (e.g., `{ "access_token": "...", "expires_in": 3600, "user": { "id": 1, "role": "admin" } }`), automatically detecting format, extracting key-value pairs (with recursive flattening of nested objects), identifying secrets, and providing a live detection preview before merging or replacing variables.

---

## Architecture & Design Decisions

### 1. Robust JSON Variable Parser (`src/modules/environment/env-parser.ts`)
- **`parseJsonVariables(content: string, options?: { flattenNested?: boolean, keyTransform?: 'preserve' | 'uppercase' }): ParsedEnvResult`**:
  - Safely parses JSON string.
  - Automatically identifies format:
    1. **Postman Environment Export**: `{ "values": [ { "key": "...", "value": "..." } ] }` $\rightarrow$ delegates to `parsePostmanEnv`.
    2. **Key/Value Object Array**: `[ { "key": "A", "value": "1" }, ... ]` or `[ { "name": "B", "value": "2" } ]` $\rightarrow$ maps each item.
    3. **Raw Key-Value Object**: `{ "token": "...", "base_url": "...", "debug": true, "user": { "id": 42 } }` $\rightarrow$ extracts primitives and optionally flattens nested objects using underscore delimiter (`user_id`).
  - Converts numbers, booleans, and non-empty strings into string values.
  - Automatically classifies keys matching `/token|secret|password|private|api_?key|auth/i` into `secrets`.
- **`detectVariableContent(content: string): { format: 'postman' | 'json' | 'dotenv' | 'invalid'; result?: ParsedEnvResult; error?: string }`**:
  - Pure function to inspect pasted text in real time.
  - Returns detected format, parsed variables, detected secrets, and syntax error messages if malformed.

### 2. Enhanced Import Dialog in `src/modules/environment/EnvironmentsPanel.tsx`
- **Real-Time Detection Preview Banner**:
  - When text is entered in the import textarea, live-detects the format and displays:
    - Detected format badge (`[Raw JSON]`, `[Postman Environment]`, `[.env Format]`).
    - Count chip: `✓ 6 variables detected (2 secrets)`.
    - Variable chip preview list.
    - If invalid JSON is entered (e.g. `{ unclosed json`), shows an error banner: `Invalid JSON syntax: ...`.
- **Import Strategy Selection**:
  - Radio or segmented toggle:
    - **Merge** (default): Add new variables and update existing matching keys without removing existing unrelated variables.
    - **Replace**: Clear current environment variables and replace with the imported variables.
- **Flatten Nested Objects Toggle**:
  - Checkbox: "Flatten nested JSON objects (`user_id`, `config_timeout`)" (enabled by default).

---

## File-by-File Proposed Changes

### 1. `src/modules/environment/env-parser.ts`
- Implement `parseJsonVariables` and `detectVariableContent`.
- Export helper types `VariableFormat` and `DetectedVariableResult`.
- Ensure backward compatibility with existing `parseDotEnv`, `parsePostmanEnv`, `serializeDotEnv`, and `exportPostmanEnv`.

### 2. `src/modules/environment/env-parser.test.ts`
- Add comprehensive test suites for:
  - Flat JSON objects with string, number, and boolean values.
  - Nested JSON objects with recursive flattening.
  - Arrays of key/value pairs.
  - Secret detection on raw JSON keys (`token`, `auth_key`, etc.).
  - Auto-detection helper `detectVariableContent` across `.env`, Postman, and raw JSON.
  - Handling of malformed JSON strings.

### 3. `src/modules/environment/EnvironmentsPanel.tsx`
- Update `handleImportParse` to use `detectVariableContent` and support both merge and replace strategies.
- Add import state: `importMode: 'merge' | 'replace'`, `flattenNested: boolean`.
- Render live detection preview banner in the Import Dialog.

### 4. `src/modules/environment/EnvironmentsPanel.test.tsx`
- Add unit tests verifying:
  - Pasting raw JSON into Import modal detects format and shows live variable preview.
  - Importing raw JSON with nested fields flattens and saves into active environment.
  - Selecting "Replace" mode replaces existing variables.
  - Showing invalid syntax errors when malformed JSON is pasted.

### 5. Documentation & CI
- Update `TODO.md` checking off Phase 7.4.
- Update `walkthrough.md`.
- Run all 7 mandatory CI quality gates locally.

---

## User Review Items
- **Key naming for nested JSON**: Default uses underscore (`user_id`, `data_token`), ensuring 100% compatibility with `VAR_PATTERN` (`{{user_id}}`).
- **Import strategy**: Defaults to **Merge** to prevent accidental loss of existing variables, with a clear toggle to **Replace** if a fresh environment is desired.

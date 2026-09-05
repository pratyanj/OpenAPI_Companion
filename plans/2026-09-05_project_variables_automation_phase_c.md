# Implementation Plan — Phase C: Project Variables Automation & Utilities

**Date**: 2026-09-05  
**Feature**: Project Variables — Phase C Automation, Zero-Click Extraction & Usage Scanner  
**Status**: Completed & Verified  

---

## Overview
Implement **Phase C** for Project Variables, focusing on **Auto-Extraction Rules (Zero-Click Token & Data Chaining)**, **1-Click Rule Generation from History**, and **Variable Usage & Reference Detection**, with strict adherence to **DRY (Don't Repeat Yourself)** principles and **guaranteed persistent storage** (persisting to `chrome.storage.local`).

---

## Architectural Principles & Decisions
1. **DRY (Zero Code Duplication)**:
   - Reuse `EndpointPicker` and `MethodTag` from `modules/request/EndpointPicker.tsx`.
   - Reuse `json-candidates.ts` for property traversal and value extraction.
   - Reuse design system components: `Dialog`, `Button`, `Input`, `Badge`, and semantic icons.
   - Reuse storage primitives: `StorageService` with `projectKey` isolation and write locks.
2. **Persistent Storage (Zero In-Memory-Only Data Loss)**:
   - Extraction rules are stored under `projects/<projectId>/environment/extraction-rules` in `chrome.storage.local`.
   - Rules persist across page refreshes, tab switching, and browser restarts.
   - Rules are included in project backups/exports and restored on import.
3. **In-Page Swagger UI Overlay**:
   - Creating/configuring extraction rules requires selecting endpoints, entering property paths, and toggling secrets—which feels cramped inside the narrow 380px Chrome Side Panel.
   - Render the modal as a top-centered `max-w-lg` overlay directly on top of Swagger UI inside a Shadow DOM (`#oac-extraction-rule-host`) with automatic fallback to local sidebar modal if the active tab is unreachable.

---

## Technical Specifications

### 1. Data Models (`src/modules/environment/extraction-rules-types.ts`)
```ts
export interface ExtractionRule {
  id: string
  endpointId: string         // e.g. 'post /api/v1/auth/login'
  source?: 'body' | 'header' // defaults to 'body'
  property: string           // dot-path in JSON (e.g. 'token', 'access_token', 'data.user.id')
  targetVariable: string     // e.g. 'TOKEN', 'USER_ID'
  isSecret: boolean          // whether to mask in .env
  enabled: boolean
  createdAt: number
}

export interface ExtractionRuleInput {
  endpointId: string
  source?: 'body' | 'header'
  property: string
  targetVariable: string
  isSecret?: boolean
  enabled?: boolean
}
```

### 2. Path Traversal Engine (`src/modules/environment/json-candidates.ts`)
- `extractValueByPath(rawJsonOrObj: unknown, path: string): string | null`
  - Handles stringified JSON and pre-parsed objects.
  - Supports dot notation (`data.user.token`) and bracket notation (`items[0].id`).
  - Ignores leading `response.` or `body.` prefixes.
  - Case-insensitive fallback for standard token field names (`access_token`, `token`, `jwt`).

### 3. Service Layer (`src/modules/environment/env-service.ts`)
- `listRules(): Promise<Result<ExtractionRule[]>>`
- `saveRule(input: ExtractionRuleInput): Promise<Result<ExtractionRule>>`
- `updateRule(id: string, patch: Partial<ExtractionRule>): Promise<Result<ExtractionRule>>`
- `deleteRule(id: string): Promise<Result<void>>`
- `applyExtraction(endpointId: string, responseBody: string): Promise<Result<{ extracted: Array<{ variable: string; value: string }> }>>`

### 4. Zero-Click History Hook (`src/modules/history/history-service.ts`)
- When any 2xx response is recorded in `record()`:
  - Finds matching enabled extraction rules for that endpoint.
  - Extracts property values.
  - Updates the active environment's variables and secrets.
  - Publishes `VARIABLE_AUTO_EXTRACTED` and emits toast notifications.

### 5. UI Layer
- `ExtractionRulesList.tsx`: List view with enable/disable checkbox toggle, rule deletion, and empty state.
- `ExtractionRuleModal.tsx`: Spacious top-centered dialog with quick presets (`access_token`, `token`, `id`, `data.id`, `jwt`), endpoint selector, and secret masking checkbox.
- `extraction-rule-modal.tsx`: In-page Shadow DOM mount with `ThemeManager` sync.
- `SaveToVariableDialog.tsx`: Added `⚡ Auto-extract on future 2xx responses` checkbox.
- `EnvironmentsPanel.tsx`: Variable reference scanner checking saved presets for `{{VAR}}` usage.

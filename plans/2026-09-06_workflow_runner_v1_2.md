# Implementation Plan — Workflow Runner (v1.2 Automation)

**Date**: 2026-09-06  
**Feature**: Workflow Runner — Sequential API Automation & Auto-Extraction Chaining  
**Status**: Completed & Shipped (`feat/workflow-runner`)  

---

## Overview
Build the **Workflow Runner** module (`src/modules/workflows`), allowing developers to group multiple API endpoints into ordered, sequential execution scenarios (smoke tests, onboarding flows, data setup chains) with one-click execution directly in Swagger UI.

---

## Architecture & Integration with Shipped Features

The Workflow Runner directly builds upon the foundations we've completed:
1. **Auto-Extraction Synergy**: When Step 1 (e.g. `POST /auth/login`) executes, Phase C's auto-extraction rules capture tokens/IDs into `.env` variables in real time. Subsequent steps (e.g. `GET /user/profile` or `POST /items`) automatically substitute `{{TOKEN}}` or `{{USER_ID}}` from the updated variables!
2. **Replay Engine Reuse**: Executes steps via the proven `autoExecute` state machine in `SwaggerAdapter`, ensuring every call executes faithfully in Swagger UI and is logged to API History.
3. **Project Isolation**: Workflows are stored strictly under `projects/<projectId>/workflows` in `chrome.storage.local` with write-lock protection.
4. **DRY Design System**: Reuses `EndpointPicker`, `MethodTag`, `Button`, `Badge`, `Dialog`, and `Menu`.

---

## Technical Specifications

### 1. Types & Data Models (`src/modules/workflows/types.ts`)
```ts
export type WorkflowFailureMode = 'stop-on-failure' | 'continue-on-failure'

export interface WorkflowStep {
  id: string
  endpointId: string          // e.g. 'post /api/v1/auth/login'
  templateId?: string         // optional preset template to load
  name?: string
  body?: string
  pathParams?: Record<string, string>
  queryParams?: Record<string, string>
  delayMs?: number            // optional pause before next step (default 0)
}

export interface Workflow {
  id: string
  name: string
  description?: string
  mode: WorkflowFailureMode
  steps: WorkflowStep[]
  createdAt: number
  updatedAt: number
  lastRunAt?: number
  lastRunStatus?: 'success' | 'failed' | 'cancelled'
  lastRunDurationMs?: number
}

export interface WorkflowInput {
  name: string
  description?: string
  mode?: WorkflowFailureMode
  steps?: WorkflowStep[]
}

export interface StepRunResult {
  stepId: string
  endpointId: string
  status?: number
  durationMs?: number
  error?: string
  success: boolean
}

export interface WorkflowRunSummary {
  workflowId: string
  status: 'success' | 'failed' | 'cancelled'
  totalSteps: number
  completedSteps: number
  results: StepRunResult[]
  startedAt: number
  durationMs: number
}
```

---

### 2. Workflow Service & Execution Engine (`src/modules/workflows/workflow-service.ts`)
- Implements `WorkflowService`:
  - `list(): Promise<Result<Workflow[]>>`
  - `get(id: string): Promise<Result<Workflow | null>>`
  - `create(input: WorkflowInput): Promise<Result<Workflow>>`
  - `update(id: string, patch: Partial<WorkflowInput>): Promise<Result<Workflow>>`
  - `delete(id: string): Promise<Result<void>>`
  - `duplicate(id: string): Promise<Result<Workflow>>`
  - `execute(workflowId: string, options?: { onStepProgress?: (stepIndex: number, total: number, result: StepRunResult) => void, signal?: AbortSignal }): Promise<Result<WorkflowRunSummary>>`
    - Resolves variables dynamically for each step right before execution (`{{VARIABLE}}`).
    - Loops through steps sequentially, emitting progress events.
    - Respects `stop-on-failure` vs `continue-on-failure`.
    - Supports `AbortController` cancellation.
    - Waits for DOM capture and auto-extraction between steps.

---

### 3. Events & Protocols
- **Events** (`src/core/events/types.ts`):
  - `WORKFLOW_SAVED`: `{ projectId: string; workflowId: string }`
  - `WORKFLOW_DELETED`: `{ projectId: string; workflowId: string }`
  - `WORKFLOW_STARTED`: `{ projectId: string; workflowId: string }`
  - `WORKFLOW_STEP_COMPLETED`: `{ projectId: string; workflowId: string; stepIndex: number; total: number; result: StepRunResult }`
  - `WORKFLOW_COMPLETED`: `{ projectId: string; workflowId: string; summary: WorkflowRunSummary }`
- **Protocol** (`src/content/sidepanel-protocol.ts`):
  - Register RPC handlers for `workflows.*` and forward workflow events to `FORWARDED_EVENTS`.

---

### 4. UI Components (`src/modules/workflows/`)
- `WorkflowsPanel.tsx`:
  - Workflow card list: title, description, step count badge, failure mode badge, last run status badge.
  - Quick actions: **▶ Run**, **Edit**, **Duplicate**, **Delete**.
  - Empty state with "+ Create First Workflow" button.
- `WorkflowEditorModal.tsx`:
  - Name, description, execution mode selector (`Stop on failure` / `Continue on failure`).
  - Step list with re-ordering (move up/down), endpoint selector (`EndpointPicker`), and optional preset loader.
- `WorkflowRunnerModal.tsx`:
  - Step-by-step progress timeline: step name/endpoint with method tag, status badges (`Pending` ⏳, `Running` 🔄, `Passed` ✓, `Failed` ✗), latency display.
  - Real-time progress bar (`Step 3 of 5`).
  - **Cancel** button to stop immediately.
  - Final execution summary report upon completion.

---

### 5. Navigation Integration
- Add `workflows` tab definition in `src/sidebar/tabs.ts`.
- Wire `WorkflowsPanel` into `PanelOutlet.tsx` and `PanelShell.tsx`.

---

## Verification Plan

### Automated Tests
- Unit tests for `workflow-service.ts`:
  - CRUD operations, duplicate, delete.
  - Sequential execution with `stop-on-failure`.
  - Sequential execution with `continue-on-failure`.
  - Abort / cancellation handling.
  - Variable substitution between steps.
- Component tests for `WorkflowsPanel.tsx`:
  - Empty state, list rendering, step addition, and run progress modal.
- `npm test` and `npm run typecheck` to maintain 100% test passing across the entire project.

### Manual Verification
- Test running a 2-step workflow on Swagger UI (`POST /auth/login` -> auto-extract token -> `GET /user/profile` using `{{TOKEN}}`).
- Verify live progress bar, cancel button, and History recording.

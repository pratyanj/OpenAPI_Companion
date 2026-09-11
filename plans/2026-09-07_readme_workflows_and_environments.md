# Implementation Plan — README Documentation Update for Environments & Workflows

**Date:** 2026-09-07  
**Feature Area:** Documentation & Developer Guide (`README.md`, Environments, Multi-Step Workflow Runner)  
**Status:** Approved by user  

---

## 1. Overview & Context

OpenAPI Companion recently completed major enhancements to:
1. **Environment Manager (Variables Automation / Phase C)**:
   - Three editor modes: **Table**, **Rules (⚡)**, and **Raw .env**.
   - Response Auto-Extraction Engine: capturing tokens, IDs, and nested fields (`id`, `data.token`, `items[0].id`) into environment variables.
   - In-page Swagger UI ⚡ trigger overlay for quick rule creation.
   - `.env` Import / Export and secret masking.
2. **Multi-Step Workflow Runner (v1.2)**:
   - Sequential API automation and end-to-end user scenario testing.
   - Real-time step runner modal with live progress streaming, elapsed timers, and status tracking.
   - Swagger auto-population (click to auto-detect endpoint schemas and parameters).
   - Drag-and-drop step reordering.
   - Inter-step data chaining: extracting values from earlier responses (e.g. POST created object ID) and resolving them in later steps via `{{VARIABLE}}`.
   - Portable JSON Import / Export bundle (`version: "1.0"`), enabling team sharing and instant AI agent generation.

This implementation plan details the documentation overhaul of [`README.md`](../README.md) to accurately represent these capabilities for users and contributors.

---

## 2. Proposed Changes

### [README.md](../README.md)

1. **Expand `### 🌍 Environment Manager`**:
   - Detail the 3 editing modes (*Table*, *Rules (⚡)*, *Raw .env*).
   - Document the Auto-Extraction Rules engine (JSON dot-paths, header extraction, secret masking).
   - Document in-page ⚡ Swagger UI trigger.
   - Document `.env` import and export.
   - Document `{{VARIABLE}}` substitution in paths, query params, headers, and request bodies.

2. **Add `### ⚡ Multi-Step Workflow Runner`**:
   - High-level overview: Automated API sequence testing directly in the browser.
   - Execution modes: `stop-on-failure` vs `continue-on-failure`.
   - Swagger Auto-Population: Instant extraction of schemas and parameters from the active Swagger DOM.
   - **Data Chaining Between Steps (Full Walkthrough)**:
     - Step 2 POST response ID extracted via rule (`$.id` → `{{OBJECT_ID}}`).
     - Step 4 consumes `{{OBJECT_ID}}` in path/query/headers/body.
     - Real-time resolution before step execution.
   - Drag-and-drop step reordering.
   - Real-time runner modal with progress bar and per-step status streaming.
   - Portable JSON Import / Export:
     - Portable schema specification (`version: "1.0"`).
     - Clean, ID-free structure.
     - Auto-rename conflict resolution.
     - Enabling AI agents to generate workflow bundles.

3. **Update Roadmap & Project Structure**:
   - Update `Roadmap`: Mark Collections and Workflow Runner as `✅`.
   - Update `Project Structure`: Reflect `src/modules/workflows/`.

---

## 3. Verification

- Review markdown formatting in preview.
- Ensure all links and anchors are functional.
- Validate with repository lint/format checks.

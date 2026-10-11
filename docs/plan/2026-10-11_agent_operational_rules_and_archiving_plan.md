# Implementation Plan — Project Operational Rules & Plan Archiving in docs/plan

**Date:** 2026-10-11  
**Status:** Completed  

---

## Context & Objective
Codify recurring developer instructions and environment constraints into `AGENTS.md` to prevent repeated instructions and ensure that all future implementation plans are permanently archived into `docs/plan/` before execution.

---

## Execution Items

1. **Mandatory CI Pipeline Verification**:
   - Enforce running all 7 quality gates (`lint`, `format:check`, `typecheck`, `test`, `audit`, `build`, `test:e2e`) before task completion.
2. **Environment & Shell Execution**:
   - Mandate `BypassSandbox: true` for build/test/git tools on Windows.
   - Require `npm run format` (`prettier --write .`) before running tests or gates.
3. **Architecture & Engineering Standards**:
   - Dual-browser Chrome/Firefox compatibility and packaging verification.
   - Strict `MAIN` world vs `ISOLATED` world separation via `main-world.ts` event bus.
   - React hooks order compliance (declare all hooks at the top before conditional returns).
   - Strict TypeScript safety without disallowed `any` types.
4. **Release & Data Governance**:
   - Synchronized version bumping across `package.json`, `package-lock.json`, Git tags, and release notes.
   - Zero-telemetry, local-first storage invariant (`chrome.storage.local`).
5. **Persistent Plan Archiving**:
   - Mandate archiving every implementation plan to `docs/plan/YYYY-MM-DD_<feature>_plan.md` before execution.

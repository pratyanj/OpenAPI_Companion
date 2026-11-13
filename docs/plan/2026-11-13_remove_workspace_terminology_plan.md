# Implementation Plan: Replace "Workspace" Terminology with In-Browser Sidebar Companion Copy

**Date**: 2026-11-13  
**Status**: Pending User Review & Approval  
**Author**: Antigravity  

---

## 1. Problem Analysis & User Feedback

1. **Inaccurate "Workspace" Terminology**:
   - The user noted: *"if you know it now workspace it companion for swagger that open up in sidebar so I don't think we can tell that is workscape"*.
   - Calling the extension a "workspace" creates a mismatch in developer expectations (developers associate "workspaces" with heavy team platforms like Notion, Slack, or Postman collections/workspaces).
   - In reality, **OpenAPI Companion** is an in-browser sidebar companion that lives right alongside Swagger UI in the browser sidepanel (`chrome.sidePanel` / Firefox sidebar).

2. **Goal**:
   - Systematically replace all misleading "workspace" copy in the welcome experience, onboarding modals, form triggers, button labels, and status confirmations with accurate terms:
     - *"smart sidebar companion"*
     - *"in-browser sidebar companion"*
     - *"OpenAPI Companion"*
     - *"request history"* (instead of "workspace history")

---

## 2. Proposed Copy Updates

### A. Welcome Screen (`src/sidepanel/WelcomeView.tsx`)

| Element | Current Copy | Proposed New Copy | Rationale |
|---|---|---|---|
| **Header Subtitle** | `The developer workspace for Swagger & OpenAPI` | `The smart sidebar companion for Swagger & OpenAPI` | Accurately describes what the extension is. |
| **Hero Headline** | `Supercharge your Swagger UI with a persistent workspace.` | `Supercharge your Swagger UI directly in your browser sidebar.` | Emphasizes the side-by-side browser workflow rather than an abstract workspace. |
| **Form Card Header** | `Activate Your Free Workspace` | `Activate OpenAPI Companion` (or `Get Started with OpenAPI Companion`) | Direct and clean. |
| **Form Card Subtitle** | `Enter your work email to activate your workspace and get new release notes.` | `Enter your work email to activate the companion and receive release updates.` | Clear purpose for email submission. |
| **Validation Error** | `Please enter your work email to activate the workspace.` | `Please enter your work email to activate OpenAPI Companion.` | Clean validation feedback. |
| **CTA Button (Idle)** | `Activate Workspace & Get Started` | `Activate Companion & Get Started` | Aligns with the companion concept. |
| **CTA Button (Submitting)** | `Activating Workspace...` | `Activating Companion...` | Consistent feedback state. |
| **Thank You Heading** | `Thank you! Your workspace is activated.` | `Thank you! OpenAPI Companion is activated.` | Confirms the companion is ready to use. |

---

### B. In-Page Onboarding Modal (`src/components/OnboardingModal.tsx`)

| Element | Current Copy | Proposed New Copy |
|---|---|---|
| **Welcome Description** | `...environments, and workspace history.` | `...environments, and request history.` |
| **Thank You Heading** | `Thank you! Workspace Activated.` | `Thank you! OpenAPI Companion is Activated.` |
| **Thank You Subtitle** | `Your companion workspace is ready to test endpoints directly in your sidebar!` | `OpenAPI Companion is ready to test endpoints directly in your sidebar!` |

---

### C. Test Suites

1. `src/sidepanel/DisconnectedPanel.test.tsx`:
   - Update regex matchers from `/activate your free workspace/i` to `/activate openapi companion/i`.
   - Update `/activate workspace & get started/i` to `/activate companion & get started/i`.
   - Update `/thank you! your workspace is activated/i` to `/thank you! openapi companion is activated/i`.
2. `src/components/OnboardingModal.test.tsx`:
   - Update regex matcher from `/thank you! workspace activated/i` to `/thank you! openapi companion is activated/i`.

---

## 3. Verification Plan

Execute all 7 CI quality gates locally before concluding:
1. `npm run lint` — 0 errors, 0 warnings
2. `npm run format:check` — 100% conforming Prettier style
3. `npm run typecheck` — 0 errors
4. `npm test` — all test suites passing green
5. `npm audit --omit=dev --audit-level=high` — 0 vulnerabilities
6. `npm run build` — Chrome + Firefox distribution build succeeds
7. `npm run test:e2e` — Playwright smoke tests pass

---

## 4. User Review Items

- **Headline Choice**: Does `"Supercharge your Swagger UI directly in your browser sidebar."` capture the experience well, or would you prefer `"Your smart sidebar companion for Swagger UI & OpenAPI."`?
- **CTA Button**: Does `"Activate Companion & Get Started"` feel natural?


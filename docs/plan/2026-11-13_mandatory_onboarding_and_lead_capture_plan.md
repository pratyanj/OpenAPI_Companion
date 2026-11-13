# Implementation Plan: Fix Lead Capture & Onboarding Email Collection

**Date**: 2026-11-13  
**Status**: Pending User Review  
**Author**: Antigravity  

---

## 1. Problem Analysis & Root Cause Diagnosis

### A. Why 450 Installs Occurred Without Marketing (Romania 63%, OS "Other" 74%)
- **Automated Web Store Crawlers & Security Indexers**:
  When an extension is published on the Chrome Web Store, crawler bots and commercial extension intelligence platforms (e.g. ChromeStats, ExtensionFox, CRXcavator, automated malware/compliance scanners) routinely fetch and install published extensions into automated testing environments.
- **Why Romania (63%)?**:
  Romania is a major European hub for low-cost, unmetered datacenter hosting and commercial proxy/VPN networks (e.g. M247, Hostinger, Voxility). Automated scraping fleets and security botnets routinely operate from Romanian IP blocks.
- **Why OS "Other" (74%)?**:
  In Chrome Web Store Developer Console analytics, **"Other" represents Linux** (specifically headless Chromium/Docker containers running automated scripts). Real human developers use Windows (8%), ChromeOS (16%), or macOS (2%). Headless scrapers do not interact with extension UI, click toolbar buttons, or type emails.

---

### B. Why Zero Emails Landed in the Google Sheet
1. **Critical Build Configuration Bug (`vite.config.ts`)**:
   - `vite.config.ts` currently defines:
     `'process.env.VITE_FEEDBACK_ENDPOINT': JSON.stringify(process.env.VITE_FEEDBACK_ENDPOINT || '')`
   - In Node.js, `process.env` does **not** automatically contain variables from `.env.local` unless Vite's `loadEnv` helper is called.
   - Consequently, in the production build bundled for the Chrome Web Store, `process.env.VITE_FEEDBACK_ENDPOINT` evaluated to `""` (empty string).
   - In `src/services/feedback-service.ts`, line 30:
     `DEFAULT_FEEDBACK_ENDPOINT = (process.env?.VITE_FEEDBACK_ENDPOINT) || 'https://formsubmit.co/ajax/your-email-placeholder'`
   - The compiled extension bundled the placeholder `formsubmit.co` URL instead of the Google Script Web App URL. **Every lead submission was discarded or failed silently.**
2. **Onboarding Modal Was Hidden Unless On an Active Swagger Page**:
   - `chrome.runtime.onInstalled` in `src/background/index.ts` never opened a welcome tab on install.
   - If a real user installed the extension and clicked the extension icon on a regular page (e.g. `google.com` or empty tab), `PanelShell` was not rendered at all (only "No OpenAPI page connected" EmptyState was shown). The `OnboardingModal` was never mounted.
3. **Onboarding Modal Was 100% Optional & Dismissable**:
   - Had `(optional)` label.
   - Had a "Skip for now" button.
   - Clicking "Get Started" without entering an email completed onboarding without saving any data.

---

## 2. Chrome Web Store (CWS) Compliance & Policy Considerations

> [!WARNING]
> **Chrome Web Store Data Minimization Policy**:
> Chrome Web Store developer policies mandate that extensions collect only the minimum personal data strictly necessary to provide the extension's core functionality.
> Because OpenAPI Companion is a client-side developer tool operating locally in browser storage:
> - Completely gating the extension so it is unusable without entering an email risks policy warnings or review rejection during store updates.
> - Developers are privacy-conscious and may leave 1-star reviews if forced to provide an email for local functionality.
>
> **Recommended Solution**:
> 1. Make email mandatory within the Welcome dialog (remove "Skip for now", remove "(optional)", require valid email to proceed through the dialog).
> 2. Ensure Google Sheet endpoint is baked in as the hardcoded fallback so it can never be lost during build.
> 3. Automatically launch the Welcome / Onboarding tab upon installation (`details.reason === 'install'`) so every real human user immediately sees the registration screen.

---

## 3. Proposed Changes

### 1. `vite.config.ts`
- Import `loadEnv` from `vite`.
- Wrap config in `defineConfig(({ mode }) => { ... })` and use `loadEnv(mode, process.cwd(), '')` to reliably read `VITE_FEEDBACK_ENDPOINT` from `.env.local`.

### 2. `src/services/feedback-service.ts`
- Update `DEFAULT_FEEDBACK_ENDPOINT` to directly default to the Google Script Web App URL:
  `'https://script.google.com/macros/s/AKfycbw8dcDzROWaN1ynzHtXl6nq8fl9MfOF-rPsfNHN10BQbOyC2Pt7kGlDKCl0NHlhfJ8/exec'`
- Ensures that even in standalone builds or environments without env vars, the correct Google Sheet webhook is always used.

### 3. `src/components/OnboardingModal.tsx`
- Remove `(optional)` indicator from email label.
- Remove the `Skip for now` button.
- Make email input strictly required:
  - If empty or whitespace: display inline error "Email address is required to get started."
  - If invalid email format: display inline error "Please enter a valid email address."
  - Disable "Get Started" submit button if input is empty or invalid (or validate on click).
  - Prevent closing modal without completing submission.

### 4. `src/background/index.ts`
- In `chrome.runtime.onInstalled`:
  - When `details.reason === 'install'`, open the onboarding/welcome screen or side panel so the user is immediately prompted upon installation.

### 5. `src/components/OnboardingModal.test.tsx` & `src/services/feedback-service.test.ts`
- Update test suites to test mandatory email validation, submission, and endpoint fallback behavior.

---

## 4. Verification Plan

### Automated CI Gates:
1. `npm run lint` — 0 errors, 0 warnings
2. `npm run format:check` — Prettier validation
3. `npm run typecheck` — TypeScript typecheck
4. `npm test` — Vitest unit test suite (100% passing)
5. `npm audit --omit=dev --audit-level=high` — Dependency audit
6. `npm run build` — Vite Chrome build + Firefox manifest generator
7. `npm run test:e2e` — Playwright smoke tests

### Manual Verification:
- Inspect `dist/` bundle to verify that the Google Script URL is present in the output JS bundle (and that placeholder URL is gone).
- Verify that OnboardingModal requires valid email and cannot be bypassed.


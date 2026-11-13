# Implementation Plan: Official Logo Integration, Form Field Enlargement & CSP Inline Script Fix

**Date**: 2026-11-13  
**Status**: Pending User Review & Approval  
**Author**: Antigravity  

---

## 1. Problem Analysis & User Feedback

1. **Brand Identity (Logo Replacement)**:
   - In the welcome header, the extension currently displays a generic Lucide `Compass` icon inside a blue rounded box.
   - The user requested: *"use our own logo here not randon icon"*.
   - The project has an official, approved brand logo (`branding/logo-final.png` and `public/icons/icon-128.png`) featuring stacked OpenAPI document layers with `{...}` and a lightning bolt badge. This official logo should be rendered prominently.

2. **Form Visibility & Input Sizing**:
   - The user noted: *"also this filed is look to small it bigger/"*.
   - The current email input in `WelcomeView.tsx` uses compact styling (`text-xs` label, `py-2 text-sm` input, `py-2.5` button). On desktop screens and high-resolution displays, it appears too small and understated.
   - The input field, label, and CTA button need to be enlarged to a spacious, modern, developer-first form (`text-base`, `py-3.5`, `rounded-xl`).

3. **Chrome Extension CSP Error (`chrome://extensions/?errors=`)**:
   - Screenshot (`media_1794560727301_be179074.jpg`) highlights:
     ```
     Executing inline script violates the following Content Security Policy directive:
     'script-src 'self' 'wasm-unsafe-eval' 'inline-speculation-rules' ...
     Context: https://petstore.swagger.io/
     Stack Trace: assets/index.tsx-...:3711 (yc)
     ```
   - **Root Cause**: `src/content/index.tsx` contains `injectPageSafeguard()` which creates `<script>` with inline `script.textContent = ...` and appends it to `doc.head || doc.documentElement`.
   - Pages with strict CSPs (such as `petstore.swagger.io`) forbid inline script execution. Chrome blocks the execution and registers an extension error.
   - **Why it's redundant**: `src/content/main-world.ts` already implements this exact DOM Node safeguard (`removeChild` & `insertBefore` protection) directly in Chrome's native `world: 'MAIN'` and in Firefox via packaged `firefox-main-world.js`. The inline script injection in `src/content/index.tsx` is completely redundant and must be removed.

---

## 2. Proposed Changes & Architecture

### A. Official Logo Replacement
- **Files**:
  - `src/components/icons.tsx`: Update `BrandIcon` to render the official OpenAPI Companion logo (`/icons/icon-128.png` / `chrome.runtime.getURL('icons/icon-128.png')`).
  - `src/sidepanel/WelcomeView.tsx`: Replace the generic compass box with the branded app logo, properly sized (`h-12 w-12` or `h-14 w-14`), maintaining clean contrast and crisp rendering.
  - `src/sidebar/SidebarShell.tsx`: Ensure the collapsed launcher icon uses the crisp official logo.

### B. Enlarge Work Email Form Field
- **File**: `src/sidepanel/WelcomeView.tsx`
  - Increase input padding and font size: `px-4.5 py-3.5 text-base rounded-xl` with clear placeholder and subtle glow on focus.
  - Increase label hierarchy: `text-sm font-semibold text-foreground`.
  - Increase CTA button size: `px-5 py-3.5 text-base font-semibold rounded-xl` with hover transitions.
  - Ensure generous spacing across the activation card so it feels balanced and prominent.

### C. Eliminate CSP Inline Script Violation
- **File**: `src/content/index.tsx`
  - Remove `injectPageSafeguard()` and its invocation inside `boot()`.
  - Rely on `src/content/main-world.ts` which runs at `document_idle` in `world: 'MAIN'` with zero inline script injection, completely resolving the CSP violation on `petstore.swagger.io` and all other host sites.

---

## 3. User Review Items

> [!NOTE]
> 1. **Logo Assets**: We will use `public/icons/icon-128.png` (built from `branding/logo-final.png`), which is packaged into both Chrome and Firefox extensions.
> 2. **CSP Verification**: Removing `injectPageSafeguard()` prevents any inline script injection in host pages, silencing Chrome's CSP warning while keeping Swagger UI protected through `main-world.ts`.
> 3. **Input Sizing**: The email field will be scaled up to `text-base` (~16px) with 14px vertical padding, avoiding browser auto-zoom on mobile and giving a solid desktop click target.

---

## 4. Verification Plan

### Automated CI Quality Gates:
1. **Lint**: `npm run lint` — 0 errors, 0 warnings
2. **Format Check**: `npm run format:check` — 100% conforming Prettier style
3. **TypeScript Typecheck**: `npm run typecheck` — 0 errors
4. **Unit & Component Tests**: `npm test` — all test suites green
5. **Dependency Audit**: `npm audit --omit=dev --audit-level=high` — 0 vulnerabilities
6. **Extension Build**: `npm run build` — Chrome (`dist/`) and Firefox (`dist-firefox/`) builds
7. **E2E Smoke Tests**: `npm run test:e2e` — Playwright tests pass


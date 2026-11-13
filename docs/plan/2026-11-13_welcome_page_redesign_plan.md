# Implementation Plan: Professional Redesign of Welcome / Onboarding Experience

**Date**: 2026-11-13  
**Status**: Pending User Review  
**Author**: Antigravity  

---

## 1. Problem & Design Critique

The current post-install view (`src/sidepanel/index.html`) renders a small generic modal dialog floating in the middle of an empty dark screen.
- **Why it looks "AI generated"**:
  - It uses a generic dialog overlay with standard placeholder cards (sparkle icon, ⚡, 🔒).
  - It does not look like a professional developer product landing page (e.g., Linear, Postman, Supabase, Raycast).
  - In a full browser tab, an isolated modal dialog in a sea of black space feels awkward and unfinished.
  - No clear visual branding, no interactive code / Swagger preview, and no guided next steps (e.g., pinning the extension, opening Swagger UI).

---

## 2. Proposed Architecture & Redesign

### A. Dedicated Full-Page Welcome Experience (`src/welcome/`)
Instead of launching the 400px sidepanel inside a wide browser tab, we create a dedicated, responsive, high-converting Welcome Page:
1. **Brand Identity Header**:
   - Compass logo with vibrant radial gradient glow
   - "OpenAPI Companion" typography + version badge (`v1.3.1 · Swagger Devtools`)
   - "Extension Installed" live indicator
2. **Hero & Activation Card**:
   - High-impact headline: *"Supercharge your Swagger UI with a persistent workspace."*
   - Clear value summary (side-by-side testing, auto auth chaining, 1-click curl, zero-CORS).
   - Sleek developer activation form: Work Email input with instant validation, newsletter option, and "Activate Workspace & Get Started" button.
   - Trust badge: *"100% Client-Side · No token exfiltration · Zero telemetry"*.
3. **Interactive Swagger Preview Mockup**:
   - Modern syntax-highlighted IDE/terminal block showing auto-captured token chaining (`POST /api/v1/auth/login` → `200 OK` → `{{token}}`).
4. **3-Step "How to Use" Quick Guide**:
   - Step 1: Pin to Chrome toolbar (🧩)
   - Step 2: Open any Swagger or OpenAPI page
   - Step 3: Test side-by-side with shortcut `Ctrl+Shift+O`
   - Quick link to try on live Swagger Petstore demo (`https://petstore.swagger.io/`).

### B. Auto-Launch Integration
- In `src/background/index.ts`:
  - When `details.reason === 'install'`, open `chrome.runtime.getURL('src/welcome/index.html')` (or the polished full-page view).
  - When onboarding completes, save the email and mark `oac_onboarding_completed: true` in `chrome.storage.local`, dispatching to the verified Google Apps Script webhook.

### C. Compact Sidepanel Compatibility
- In the side panel (`PanelShell.tsx` and `DisconnectedPanel.tsx`), if a user opens the side panel directly without visiting the full welcome tab, the onboarding component renders cleanly within the 400px sidebar layout without breaking.

---

## 3. Marketplace Plugin Recommendation
To explore real-world screen patterns from top SaaS products or design custom components:
- **Mobbin** (`antigravity-plugins-partners/plugin/mobbin`): Access 600,000+ real developer and SaaS screens to inspect onboarding flows from Stripe, Postman, Linear, and Vercel.

---

## 4. Verification Plan

1. **Lint**: `npm run lint` — 0 errors, 0 warnings
2. **Format**: `npm run format:check` — 100% conforming
3. **Typecheck**: `npm run typecheck` — 0 errors
4. **Unit Tests**: `npm test` — all test suites green
5. **Dependency Audit**: `npm audit --omit=dev --audit-level=high` — 0 vulnerabilities
6. **Build**: `npm run build` — Chrome + Firefox distribution archives
7. **E2E Smoke Tests**: `npm run test:e2e` — Playwright tests pass


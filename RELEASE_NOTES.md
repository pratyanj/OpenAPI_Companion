# OpenAPI Companion v1.4.0 Release Notes

A major release bringing a redesigned developer welcome & onboarding experience, enhanced navigation UI affordance, automated cURL authentication and global headers integration, and pre-execution auth clearing for login APIs.

---

## 🌟 Highlights & Key Features

### 🚀 1. Developer Welcome & Quick-Start Landing Experience
- **Interactive Welcome View (`WelcomeView.tsx`)**: Replaces disconnected empty states with an ambient dark developer landing page featuring a live terminal preview with styled cURL execution and core value highlights.
- **Celebratory Thank You Flow**: Guides developers through extension pinning, Swagger detection, and provides a 1-click live demo link to [Swagger Petstore](https://petstore.swagger.io/).
- **Official Brand Icon**: High-resolution official brand logo integration across the welcome view, collapsed floating launcher, and store listings.

### 🎨 2. Enhanced Navigation Button Affordance
- **Tangible Button Geometry**: Solid slate surface backgrounds (`bg-surface`) and crisp outlines (`border border-border`) on all navigation tabs.
- **Interactive Hover Feedback**: Navigation buttons smoothly brighten and lift on hover, making interactive controls instantly recognizable at first glance.
- **Tailwind CSS Token Optimization**: Optimized design tokens to guarantee 100% valid compiled CSS rules across both dark and light themes.

### 🔑 3. In-Page Paste cURL Token & Global Headers Extraction
- **Automatic Token Authorization**: Pasting cURL commands with Bearer, Basic, or API Key headers automatically authorizes Swagger UI and binds tokens to active test sessions.
- **Global Headers Extraction**: Detects custom enterprise headers (`X-Tenant-ID`, `X-App-Version`, `X-Custom-*`) with 1-click addition to OpenAPI Companion's Global Headers system.

### 🔒 4. Pre-Execution Auth Clearing on Login APIs
- **Stale Token Protection**: Automatically logs out of Swagger Authorize before dispatching login endpoints, preventing expired or invalid JWTs from triggering 401/403 errors from backend authentication guards.

### 🛡️ 5. Content Security Policy (CSP) Hardening
- **Zero Inline Scripts**: Completely eliminated inline script injection to ensure seamless, error-free operation on sites enforcing strict Content Security Policies like `petstore.swagger.io`.

---

## 🛠️ Verification & Quality Gates

All 7 mandatory quality gates passed:
- **Unit & Component Tests**: 126 test suites passed, 1,159 tests passed (100% green).
- **Playwright E2E Tests**: 2 / 2 headless Chromium smoke tests passed.
- **Strict Type Safety**: TypeScript 5.6 compiled with 0 type errors.
- **Code Standards**: 100% compliant with ESLint and Prettier formatting across all modules.
- **Security Audit**: 0 vulnerabilities (`npm audit --omit=dev --audit-level=high`).

---

## 📥 Downloads & Installation

### Chrome / Chromium Browsers (Chrome, Edge, Brave, Arc, Opera)
- **Chrome Web Store**: [Install OpenAPI Companion](https://chromewebstore.google.com/detail/openapi-companion/ckainjdbpdblamklkmeimpfmpeeennfg?hl=en-GB&authuser=0)
- **Manual / Unpacked ZIP**: Download [`openapi-companion-1.4.0.zip`](https://github.com/pratyanj/OpenAPI_Companion/releases/download/v1.4.0/openapi-companion-1.4.0.zip), extract, and click **Load unpacked** in `chrome://extensions`.

### Firefox
- **Firefox Add-ons (AMO)**: [Install OpenAPI Companion](https://addons.mozilla.org/en-US/firefox/addon/openapi-companion/)
- **AMO Release Bundle**: Download [`openapi-companion-1.4.0-firefox.zip`](https://github.com/pratyanj/OpenAPI_Companion/releases/download/v1.4.0/openapi-companion-1.4.0-firefox.zip) and load in `about:debugging`.


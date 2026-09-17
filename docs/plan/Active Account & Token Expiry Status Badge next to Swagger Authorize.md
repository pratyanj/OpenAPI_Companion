# Implementation Plan: Point 6 — 👤 Active Account & Token Expiry Status Badge next to Swagger Authorize

Display the currently logged-in user name/role, active account, and real-time token expiry countdown directly next to Swagger UI's native Authorize button, complete with 1-click token renewal.

## User Review Required

> [!IMPORTANT]
> **Key Design Decisions & Constraints**:
> 1. **100% SVG Vector Icons (ZERO EMOJIS)**: All UI elements (user icon, clock/timer, refresh icon, checkmark, lock/shield) strictly use inline SVG vector graphics. Zero emojis to guarantee font and system stability.
> 2. **Clean Status Styling (No Error Text in Button Labels)**: The renewal button only displays positive action labels (`Renew`, `Renewing...`, `Renewed`); errors or missing login configurations are communicated via subtle visual cues and tooltips.
> 3. **Placement**: Injected directly alongside Swagger UI's native Authorize button (`.swagger-ui .auth-wrapper`), visually complementing Swagger's padlock without layout distortion.
> 4. **Smart Account & Role Detection**:
>    - Priority 1: Named credential from vault (e.g. `Admin`, `Manager`, `Customer`).
>    - Priority 2: Decoded JWT claims (`role`, `name`, `preferred_username`, `email`, `sub`).
>    - Priority 3: Scheme name / generic `Authorized`.
> 5. **Live Expiry Countdown**:
>    - Active timer (ticks every 10s–30s) showing remaining time: `Expires in 14m`, `Expiring soon (45s)`, or `Expired 2m ago`.
>    - Color transitions: Normal (green/slate) -> Expiring soon (< 5m, amber) -> Expired (soft red).
> 6. **1-Click Renewal**:
>    - Clicking `Renew` invokes `TokenRefreshService.refreshNow(currentEnv)`, running the configured login request, updating the token in storage and Swagger UI, and updating the badge.

## Open Questions

None currently. The domain services (`AuthenticationService`, `TokenRefreshService`), event bus, and Swagger DOM structures are well-established.

## Proposed Changes

---

### JWT Claims Utility

#### [MODIFY] [jwt.ts](file:///P:/React%20native/OpenAPI_Companion/src/utils/jwt.ts)
- Add `decodeJwtClaims(token: string): Record<string, unknown> | null` to extract claims like `role`, `name`, `username`, `email`, `sub`.
- Export helper `extractUserDisplayFromJwt(token: string): { name?: string; role?: string } | null`.

#### [MODIFY] [jwt.test.ts](file:///P:/React%20native/OpenAPI_Companion/src/utils/jwt.test.ts)
- Add unit tests for claims extraction, role detection, and graceful handling of non-JWT tokens.

---

### In-Page Content Script Enhancement

#### [NEW] [swagger-auth-badge.ts](file:///P:/React%20native/OpenAPI_Companion/src/content/swagger-auth-badge.ts)
- Implement `SwaggerAuthBadgeHandle`:
  - `updateStatus(record: AuthRecord | null, accountName?: string | null): void`
  - `scanAndMount(root?: ParentNode): number`
  - `dispose(): void`
- DOM Injection:
  - Finds `.swagger-ui .auth-wrapper` or `.scheme-container .auth-wrapper`.
  - Injects `.oac-auth-status-badge`:
    - Left: User/Role icon + Account Name (`Admin`, `Staff`, etc.).
    - Middle: Divider `•` + Expiry countdown (`Expires in 14m`, `Expired`, or `Active`).
    - Right: 1-Click `Renew` button with spinning SVG icon.
- Live Countdown Engine:
  - Ticks every 10s to keep remaining time accurate.
  - Applies `.expiring` (< 5 min) and `.expired` CSS classes.
- Renewal Action:
  - Calls `tokenRefresh.refreshNow(environmentId)`.
  - Shows spinning icon during refresh and `Renewed ✓` confirmation for 1.5s.
  - If no automated login is configured, offers clear tooltip guidance.

#### [NEW] [swagger-auth-badge.test.ts](file:///P:/React%20native/OpenAPI_Companion/src/content/swagger-auth-badge.test.ts)
- Unit tests covering:
  - DOM injection into `.auth-wrapper` next to native Authorize button.
  - Displaying account name from vault and JWT claims.
  - Live countdown formatting (`14m`, `45s`, `Expired`).
  - Triggering 1-click renewal and receiving `Renewed` feedback.
  - Zero-emoji assertion across all rendered DOM elements.

---

### Wiring in Content Script

#### [MODIFY] [index.tsx](file:///P:/React%20native/OpenAPI_Companion/src/content/index.tsx)
- Mount `mountSwaggerAuthBadge(document, { auth, tokenRefresh, bus, getCurrentEnv: () => currentEnv })`.
- Wire `AUTH_CHANGED`, `ENVIRONMENT_CHANGED`, and `TOKEN_REFRESHED` events to automatically update the badge.

---

## Verification Plan

### Automated Tests
- Run Vitest suite:
  ```powershell
  npm test -- --run
  ```
  Ensure all 76+ test files pass (targeting 685+ passing tests, 0 failures).
- Run production bundle build:
  ```powershell
  npm run build
  ```
  Ensure TypeScript compiles cleanly with zero type errors and asset bundles emit successfully.

### Manual Verification
- In Swagger UI:
  1. Authorize with an API token or JWT.
  2. Verify the badge appears next to the native padlock showing active account name (e.g. `Admin`) and countdown (e.g. `Expires in ...`).
  3. Click `Renew` — verify the renewal spinner animates, a fresh token is applied, and the badge confirms `Renewed`.
  4. Switch environments or accounts and verify the badge updates immediately.

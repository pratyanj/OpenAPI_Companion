# Implementation Plan: Clear Swagger Auth Token on Login API Execution

## Overview
When testing authentication in Swagger UI, if an expired or invalid token is currently authorized in Swagger's security state (`state.auth.authorized`), Swagger UI automatically attaches `Authorization: Bearer <expired-token>` to all outgoing requests. When the user clicks **Execute** on a login endpoint (e.g. `POST /auth/login`), the server or auth middleware can reject the login request with `401 Unauthorized` before processing credentials because of the stale token.

This feature ensures that when a user clicks **Execute** on any login endpoint (or when auto-refresh executes a sign-in request), OpenAPI Companion automatically clears the stale authentication token from Swagger UI's authorization state before the HTTP request is dispatched. Once the login API succeeds with a 2xx response, the existing automatic token capture and Swagger authorization flows continue to extract and apply the fresh token seamlessly.

---

## User Review Required

> [!IMPORTANT]
> **Key Behavioral Guarantee:**
> 1. **Login Endpoints Cleared**: Any endpoint recognized as a login endpoint (e.g. `POST /auth/login`, `POST /login`, `POST /api/v1/token`, `POST /oauth/token`, or user-configured login endpoint) will synchronously clear Swagger UI's authorization state (`authActions.logout`) when the user clicks **Execute**.
> 2. **Authenticated Endpoints Preserved**: Endpoints that require an existing authenticated session (such as `POST /auth/change-password`, `POST /auth/logout`, `PUT /users/profile`) are protected via `DANGEROUS_AUTH_PATH_RE` and will **never** have their auth cleared when executed.
> 3. **Fresh Token Auto-Authorized**: When the login request finishes with a 2xx response, the returned access token is automatically extracted and applied to Swagger Authorize.

---

## Proposed Changes

### 1. Protocol & Heuristic Detection Helpers
#### [src/content/swagger-protocol.ts](file:///p:/React%20native/OpenAPI_Companion/src/content/swagger-protocol.ts)
- Add `syncLoginEndpoint` to `BridgeOutbound` message type union:
  `| { tag: typeof BRIDGE_TAG; dir: 'to-main'; cmd: 'syncLoginEndpoint'; endpoint: string | null }`
- Define and export `isLoginEndpoint(path: string, method?: string, configuredEndpoint?: string | null): boolean`:
  - Matches user-configured login endpoint (`configuredEndpoint`).
  - Filters out endpoints requiring existing authentication or non-login actions (`/change-password`, `/reset-password`, `/forgot-password`, `/logout`, `/signup`, `/register`, etc.).
  - Matches standard login paths when method is POST:
    - `/login`, `/sign-in`, `/signin`, `/token`, `/authenticate`, `/auth`, `/session`, `/sessions`
    - `/oauth/token`, `/oauth2/token`, `/connect/token`, `/jwt/create`, `/access-token`

#### [src/content/swagger-protocol.test.ts](file:///p:/React%20native/OpenAPI_Companion/src/content/swagger-protocol.test.ts)
- Add unit tests verifying `isLoginEndpoint`:
  - Matches `/auth/login`, `/login`, `/oauth/token`, `/api/token`.
  - Rejects `/auth/change-password`, `/auth/forgot-password`, `/auth/logout`, `/users`.
  - Rejects non-POST methods (e.g. `GET /auth/login`).
  - Matches user-configured endpoint regardless of path format.

---

### 2. Main World Native Execute Interceptor
#### [src/content/main-world.ts](file:///p:/React%20native/OpenAPI_Companion/src/content/main-world.ts)
- Maintain `let activeLoginEndpoint: string | null = null`.
- Listen for `message.cmd === 'syncLoginEndpoint'` to keep `activeLoginEndpoint` in sync.
- Inside `hookExecuteClick` (`onExecuteClick`), before the click event reaches Swagger UI's execution handler:
  - Check if the target block is a login endpoint: `isLoginEndpoint(endpointPath, method, activeLoginEndpoint)`.
  - If a login endpoint is detected and Swagger UI has authorized security schemes (`readAuthorized()` has keys):
    - Synchronously invoke `resolveSwaggerUi()?.authActions?.logout?.(Object.keys(authorized))`.
    - Invoke `pushAuth(true)` to notify the isolated world.
  - Swagger UI's own click handler then runs with an empty auth state, sending the login request without any stale `Authorization` header.

#### [src/content/main-world.test.ts](file:///p:/React%20native/OpenAPI_Companion/src/content/main-world.test.ts)
- Add unit tests for `hookExecuteClick`:
  - Verify that clicking `.btn.execute` on a `POST /auth/login` block calls `authActions.logout` and clears auth before execution.
  - Verify that clicking `.btn.execute` on a non-login block (e.g. `GET /tasks` or `POST /auth/change-password`) preserves the auth token.

---

### 3. Content Script & Token Refresh Integration
#### [src/content/index.tsx](file:///p:/React%20native/OpenAPI_Companion/src/content/index.tsx)
- Sync `configuredLoginEndpoint` to `main-world.ts` on initialization and when updated via settings/RPC:
  `window.postMessage({ tag: BRIDGE_TAG, dir: 'to-main', cmd: 'syncLoginEndpoint', endpoint: configuredLoginEndpoint }, '*')`

#### [src/services/token-refresh.ts](file:///p:/React%20native/OpenAPI_Companion/src/services/token-refresh.ts) & [src/services/token-refresh.test.ts](file:///p:/React%20native/OpenAPI_Companion/src/services/token-refresh.test.ts)
- In `loginWithCredentials()`, explicitly call `this.adapter.clearAuth()` immediately prior to `this.adapter.replay(...)` so headless/automated token refresh also guarantees a clean slate before executing login.

---

## Verification Plan

### Automated Tests
1. **Unit Tests**:
   - `npm test -- src/content/swagger-protocol.test.ts`
   - `npm test -- src/content/main-world.test.ts`
   - `npm test -- src/services/token-refresh.test.ts`
2. **Quality Gates (Mandatory)**:
   - `npm run format` & `npm run format:check`
   - `npm run lint` (0 errors, 0 warnings)
   - `npm run typecheck` (`tsc --noEmit` — 0 errors)
   - `npm test` (All 125+ test suites green)
   - `npm audit --omit=dev --audit-level=high` (0 vulnerabilities)
   - `npm run build` (Chrome & Firefox builds)
   - `npm run test:e2e` (Playwright smoke tests)

### Manual Verification
- In Swagger UI on a local API (e.g. FastAPI at `http://127.0.0.1:8000` or `8008`):
  1. Authorize an invalid/expired token in Swagger Authorize.
  2. Expand `POST /auth/login`.
  3. Enter username and password and click **Execute**.
  4. Verify the outgoing request does not contain the expired `Authorization` header.
  5. Verify the login succeeds with 200 OK.
  6. Verify the new access token is automatically extracted and set to Swagger Authorize.

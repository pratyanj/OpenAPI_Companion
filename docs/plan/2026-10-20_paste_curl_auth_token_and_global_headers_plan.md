# Implementation Plan: Fix "Paste cURL" Auth Token Ignored Bug & Save Headers to Global Headers

## Problem Summary & User Request
1. **Pasted Auth Token Ignored**: When a user pastes a cURL command (e.g. `GET` request) with an `Authorization` header (`Bearer <token>`, `Basic <creds>`, or API Key), `swagger-paste-curl.ts` only attempted to fill parameter inputs in the DOM. Because Swagger UI security schemes are not DOM parameters, the token was ignored. When clicking "Execute", Swagger UI called the API using the previous "auth save user" from `state.auth`.
2. **Account Desynchronization in `auth-service.ts`**: `activeLogin()` contained a fallback that mapped any active session to the single saved login account, which triggered `tokenRefresh` to re-authenticate as that saved user on 401/403.
3. **Saving Headers to Global Headers**: When pasting a cURL with custom headers (e.g. `X-Tenant-ID`, `X-Client-Id`, `Accept-Language`, etc.), the user requested the ability to store these headers directly into OpenAPI Companion's **Global Headers** so they automatically attach to all requests executed on the page.

---

## Proposed Changes

### 1. `src/utils/curl-parser.ts` & `src/utils/curl-parser.test.ts`
- Support `-u username:password` or `--user username:password` in `parseCurl` (converting to `Authorization: Basic <base64>`).
- Export helper `extractAuthFromHeaders(headers: Record<string, string>)`:
  - Case-insensitive search for `Authorization` (handling `Bearer <token>`, `Basic <base64>`, or raw token).
  - Common API key headers (`x-api-key`, `api-key`, `apikey`, `token`, `x-auth-token`, `x-access-token`).
  - Returns `{ type: 'bearer' | 'basic' | 'apiKey', token: string, rawHeaderKey: string, schemeName?: string } | null`.
- Export helper `extractCustomHeaders(headers: Record<string, string>)`:
  - Returns headers excluding hop-by-hop/body headers (`authorization`, `content-type`, `content-length`, `host`, `connection`, `accept-encoding`).

### 2. `src/content/swagger-paste-curl.ts` & `src/content/swagger-paste-curl.test.ts`
- In `SwaggerPasteCurlOptions`, add:
  ```ts
  onApplyAuth?: (snapshot: AuthSnapshot) => Promise<boolean> | boolean
  onSaveGlobalHeaders?: (headers: Record<string, string>) => Promise<number> | number
  ```
- In `ensureModal()` & `updatePreview()`:
  - **Auth Token Detected Section**:
    - Detect auth token via `extractAuthFromHeaders(parsed.headers)`.
    - Render callout with Key SVG icon, token type pill (`BEARER`, `BASIC`, `API KEY`), truncated token preview, and a toggle:
      `[✓] Apply token to Swagger Authorize (execute request as this user)` (checked by default).
  - **Global Headers Integration Section**:
    - Detect non-auth headers via `extractCustomHeaders(parsed.headers)`.
    - If custom headers exist (e.g. `X-Tenant-ID`), render a Global Headers option:
      - Checkbox: `[✓] Save custom headers to Global Headers (X-Tenant-ID, etc.)`
      - Quick button in Headers header: `[+ Save to Global Headers]`.
  - In `executeAutoFill()`:
    - If auth checkbox is checked and auth token detected, invoke `options?.onApplyAuth?.(snapshot)`.
    - If global headers checkbox is checked and custom headers exist, invoke `options?.onSaveGlobalHeaders?.(customHeaders)`.
    - Continue opening endpoint, enabling "Try it out", and filling parameters/body.

### 3. `src/content/index.tsx`
- Wire `onApplyAuth` and `onSaveGlobalHeaders` into `mountSwaggerPasteCurl(document, productivity, { ... })`:
  - **`onApplyAuth(snapshot)`**:
    - Call `adapter.writeAuth(snapshot)` (updates Swagger UI's internal `state.auth`).
    - Call `auth.applyToken(currentEnv, snapshot.token, snapshot.schemeName)` (updates local auth storage).
    - Call `syncAuthBadge()` (updates in-page Swagger Auth Badge in header).
  - **`onSaveGlobalHeaders(customHeaders)`**:
    - Merge new headers into `headersService` (add new or update existing values; enable by default).
    - Dispatch `syncGlobalHeaders` via `window.postMessage` to `main-world.ts` network interceptor.
    - Refresh the in-page Global Headers button badge count in Swagger UI header.

### 4. `src/modules/authentication/auth-service.ts` & `src/modules/authentication/auth-service.test.ts`
- In `applyToken(environmentId, token, schemeName)`:
  - Check `this.listSaved()`: if the token matches a saved persona, set `activeCredentialKey`. If not, remove `activeCredentialKey` so the session is recognized as a custom/pasted token and the previous saved user is no longer considered active.
- In `captureFromSwagger(environmentId)`:
  - Update `activeCredentialKey` if matching a saved persona, or remove it if custom.
- In `activeLogin(environmentId)`:
  - Guard fallback on line 512: only return the single saved login account if `active.value.token` is empty or matches that account's token. Never return an unrelated saved account when the active session belongs to a different token.

---

## User Review Items
1. **Auth Token Toggle**: Enabled and checked by default when an auth token is in the cURL.
2. **Global Headers Toggle**: Rendered whenever custom headers (e.g. `X-Tenant-ID`, `X-App-Version`) exist in the cURL. Can be saved on Auto-Fill or via 1-click `+ Save to Global Headers`.

---

## Verification Plan

### Automated Tests
1. **`src/utils/curl-parser.test.ts`**:
   - Verify `extractAuthFromHeaders` and `extractCustomHeaders`.
   - Verify `-u user:pass` parsing into Basic Auth.
2. **`src/content/swagger-paste-curl.test.ts`**:
   - Verify preview renders Auth Token section and Global Headers section.
   - Verify clicking "Auto-Fill & Open" calls `onApplyAuth` and `onSaveGlobalHeaders`.
   - Verify 1-click "Save to Global Headers" button.
3. **`src/modules/authentication/auth-service.test.ts`**:
   - Verify `applyToken` with custom token clears `activeCredentialKey`.
   - Verify `activeLogin` does not return saved account for a different token.

### CI Quality Gates Verification
- Gate 1: `npm run lint`
- Gate 2: `npm run format:check`
- Gate 3: `npm run typecheck`
- Gate 4: `npm test`
- Gate 5: `npm audit --omit=dev --audit-level=high`
- Gate 6: `npm run build`
- Gate 7: `npm run test:e2e`

# Implementation Plan: Fix "Paste cURL" Authorization Token Ignored Bug

## Problem Summary
When a user pastes a cURL command (e.g. a `GET` request) into the in-page "Paste cURL" modal (`#oac-paste-curl-modal`):
1. **The pasted token is never applied to Swagger UI authorization**: `swagger-paste-curl.ts` only attempted to fill parameters into DOM `<input>` elements inside `.parameters-container tr`. In OpenAPI/Swagger UI, security definitions (such as `Authorization: Bearer <token>`) are not rendered in parameter rows; they are governed by Swagger UI's internal `state.auth` via `authActions.authorize`. Because `writeAuth` was never invoked, Swagger UI retained whatever user was previously authorized.
2. **Requests execute with the old saved user instead of the cURL's user**: When the user clicks "Execute", Swagger UI attaches the authorization header of the previously saved user/persona (e.g. "Admin") from `state.auth`, completely ignoring the token in the pasted cURL.
3. **Account fallback desynchronization in `auth-service.ts`**: Even if a new token was applied, `activeLogin()` contained a fallback that mapped any active session to the single saved login account if only one saved account existed. If an API call returned 401/403, `tokenRefresh` would automatically re-authenticate as the saved user, overwriting the session.

---

## Proposed Changes

### 1. `src/utils/curl-parser.ts` & `src/utils/curl-parser.test.ts`
- Enhance `parseCurl` to support `-u username:password` or `--user username:password` (converting to `Authorization: Basic <base64>`).
- Export a helper `extractAuthFromHeaders(headers: Record<string, string>)`:
  - Case-insensitive search for `Authorization` (handling `Bearer <token>`, `Basic <base64>`, or raw token).
  - Common API key headers (`x-api-key`, `api-key`, `apikey`, `token`, `x-auth-token`, `x-access-token`).
  - Returns `{ type: 'bearer' | 'basic' | 'apiKey', token: string, rawHeaderKey: string, schemeName?: string } | null`.

### 2. `src/content/swagger-paste-curl.ts` & `src/content/swagger-paste-curl.test.ts`
- In `SwaggerPasteCurlOptions`, add:
  ```ts
  onApplyAuth?: (snapshot: AuthSnapshot) => Promise<boolean> | boolean
  ```
- In `ensureModal()` & `updatePreview()`:
  - Detect whether the parsed cURL contains an auth token via `extractAuthFromHeaders(parsed.headers)`.
  - When an auth token is detected, render an **Authentication Token Detected** section in the modal preview:
    - Lock/Key SVG icon.
    - Token type badge (`BEARER`, `BASIC`, `API KEY`).
    - Truncated token string with tooltip showing full token.
    - Checkbox (checked by default): `[✓] Apply token to Swagger Authorize (execute request as this user)`.
  - In `executeAutoFill()`:
    - If the checkbox is checked and an auth token was detected, invoke `options?.onApplyAuth?.(snapshot)`.
    - Continue opening endpoint, enabling "Try it out", and filling parameters/body as before.

### 3. `src/content/index.tsx`
- Wire `onApplyAuth` into `mountSwaggerPasteCurl(document, productivity, { ... })`:
  - Call `adapter.writeAuth(snapshot)` (relaying `writeAuth` to `main-world.ts` to update `swagger.authActions.authorize`).
  - Call `auth.applyToken(currentEnv, snapshot.token, snapshot.schemeName)` to update local auth storage.
  - Call `syncAuthBadge()` to refresh the in-page header auth badge immediately.

### 4. `src/modules/authentication/auth-service.ts` & `src/modules/authentication/auth-service.test.ts`
- In `applyToken(environmentId, token, schemeName)`:
  - Cross-reference the new token with `this.listSaved()`.
  - If the token matches an existing saved persona, set `activeCredentialKey(environmentId)` to that persona's ID.
  - If the token does not match any saved persona, remove `activeCredentialKey(environmentId)` so the session is recognized as a custom/pasted token and the previous saved user is no longer considered active.
- In `captureFromSwagger(environmentId)`:
  - Perform the same check: update `activeCredentialKey` if matching a saved persona, or remove it if custom.
- In `activeLogin(environmentId)`:
  - Guard the fallback on line 512: only return the single saved login account if `active.value.token` is empty or if its token matches that saved account. Never return an unrelated saved account when the active session belongs to a different token.

---

## User Review Items & Open Questions
1. **Default behavior**: The `[✓] Apply token to Swagger Authorize` checkbox will be enabled and checked by default whenever a token is detected in the pasted cURL. If unchecked, the existing Swagger authorization remains intact.
2. **Auth Badge behavior**: When a cURL with a custom token is applied, the in-page Swagger Auth badge will show `Authorized (cURL Token)` or token snippet instead of falsely displaying the previous saved persona (e.g. "Admin").

---

## Verification Plan

### Automated Tests
1. **`src/utils/curl-parser.test.ts`**:
   - Verify `extractAuthFromHeaders` with `Authorization: Bearer <jwt>`, `authorization: Bearer <jwt>`, `Authorization: Basic <creds>`, raw token, and API key headers.
   - Verify `-u user:pass` parsing into Basic Auth.
2. **`src/content/swagger-paste-curl.test.ts`**:
   - Verify the "Authentication Token Detected" preview box renders with token type and checkbox.
   - Verify clicking "Auto-Fill & Open" calls `onApplyAuth` with the extracted `AuthSnapshot`.
   - Verify unchecking the checkbox skips `onApplyAuth`.
3. **`src/modules/authentication/auth-service.test.ts`**:
   - Verify applying a token that does not match any saved credential clears `activeCredentialKey` and returns `null` for `activeCredentialName`.
   - Verify `activeLogin()` does not return a saved account if the active session has a different custom token.

### CI Quality Gates Verification
- Gate 1: `npm run lint`
- Gate 2: `npm run format:check`
- Gate 3: `npm run typecheck`
- Gate 4: `npm test`
- Gate 5: `npm audit --omit=dev --audit-level=high`
- Gate 6: `npm run build`
- Gate 7: `npm run test:e2e`

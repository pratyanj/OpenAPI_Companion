# Agent Rules & Guidelines

## Git & Deployment Constraints
- **NEVER execute `git commit` or `git push` without explicit user permission.**
- Always leave changes uncommitted for the user to review and manually test in their browser.
- Only create a commit or push to remote when the user explicitly requests or confirms it.

## Planning & Execution Workflow
- **Always create an implementation plan first**:
  - Whenever the user requests tasks or features, **always** create or update the `implementation_plan.md` artifact before making any code modifications.
  - Specify the user review items, open questions, and file-by-file proposed changes.
  - Wait for the user's explicit approval before proceeding with execution.
- **Maintain an Ongoing Log / Walkthrough**:
  - After executing approved changes, systematically document the exact changes, test results, and implementation rationale in `walkthrough.md`.
  - Maintain this log so the user always has a clear, persistent history of all changes made across features.
- **Persistent Plan Archiving in `docs/plan/`**:
  - Before executing any approved plan, **always archive and save a copy of the plan into `docs/plan/`** (e.g. `docs/plan/YYYY-MM-DD_<feature_name>_plan.md`).
  - This ensures a permanent, dated, and version-controlled record of every formulated plan and milestone directly in the repository.
  - Never execute changes or overwrite `implementation_plan.md` without first archiving the plan to `docs/plan/`.

## Mandatory CI & Quality Gate Verification
After completing any feature task, bug fix, refactor, or file modifications, **always** run and verify all 7 GitHub Actions CI quality gates locally before concluding the task:

1. **Lint**: `npm run lint` (ESLint — 0 errors, 0 warnings)
2. **Format Check**: `npm run format:check` (Prettier — all files must conform; run `npm run format` if needed)
3. **TypeScript Typecheck**: `npm run typecheck` (`tsc --noEmit` — 0 errors)
4. **Unit & Component Tests**: `npm test` or `npm run test:coverage` (Vitest suites — 100% green)
5. **Dependency Audit**: `npm audit --omit=dev --audit-level=high` (0 high/critical vulnerabilities)
6. **Extension Build**: `npm run build` (Vite Chrome build + Firefox manifest generator — 0 errors)
7. **E2E Smoke Tests**: `npm run test:e2e` (Playwright Chromium smoke tests — must pass)

Do not mark a task as completed or advise the user to commit until all 7 gates have executed and verified green.

## Environment & Shell Execution
- **Windows Command Execution**:
  - Always execute build tools (`npm`, `npx`, `node`), Playwright tests, and network Git commands (`git push`, `git fetch`) with `BypassSandbox: true`. This prevents Windows PATH resolution errors (`command not recognized`) and SSL root certificate failures (`schannel: SEC_E_UNTRUSTED_ROOT`).
- **Pre-Gate Code Formatting**:
  - Whenever modifying code or documentation files, **always run `npm run format` (`prettier --write .`) before running tests or quality checks**. Never leave unformatted files that cause `npm run format:check` to fail.

## Extension Architecture & Engineering Standards
- **Dual-Browser Compatibility (Chrome + Firefox)**:
  - This project targets both Chrome and Firefox. Chrome uses `chrome.sidePanel` and MV3 service workers (`dist/`); Firefox uses `sidebar_action` and event-page background scripts (`dist-firefox/`).
  - Never introduce Chrome-exclusive APIs into shared code without appropriate browser checks or polyfills.
  - After running packaging, always verify that both distribution archives exist in `share/`:
    - `share/openapi-companion-<version>.zip` (Chromium unpacked preview)
    - `share/openapi-companion-<version>-firefox.zip` (Firefox AMO release)
- **Main World vs. Isolated World Boundary**:
  - Swagger UI DOM and runtime objects (`window.ui`, Swagger client) live in the host page's `MAIN` world, whereas extension content scripts run in the `ISOLATED` world.
  - Never attempt direct `window` object inspection from content scripts or sidepanel. All communication with Swagger UI must use the typed event bus in `main-world.ts` via window `postMessage`.
- **React Hooks Ordering & Strict Typing**:
  - In all React components and modals, **declare all hooks (`useState`, `useRef`, `useMemo`, `useEffect`, `useCallback`) at the very top**, strictly before any conditional returns (e.g. `if (!isOpen) return null`) to comply with `react-hooks/rules-of-hooks`.
  - Avoid disallowed explicit `any` types; use `unknown`, type guards, or strict TypeScript interfaces.

## Release & Data Governance
- **Version Bumping Synchronization**:
  - When preparing a release:
    1. Synchronize `version` in both `package.json` and `package-lock.json`.
    2. Ensure Git tag `v<version>` exactly matches `package.json` version.
    3. Run `npm run package` and verify both Chrome and Firefox release zips.
    4. Update `RELEASE_NOTES.md`, `STORE_DESCRIPTION.md`, and `walkthrough.md`.
- **Zero-Telemetry & Local-First Storage**:
  - All credentials, tokens, variables, request presets, history, and workflows must remain strictly inside `chrome.storage.local`.
  - Never introduce external telemetry, tracking SDKs, or analytics pings. Outbound network requests are strictly limited to user-executed Swagger calls and user-submitted feedback.

## Chrome Web Store Policy Compliance & Prohibited Keywords
When drafting, modifying, or updating extension store descriptions, titles, short descriptions, or metadata for the Chrome Web Store (CWS):

### 🚫 Strictly Prohibited Words & Patterns (Trigger Auto/Manual Rejections)
1. **Security Circumvention & Hack Claims**:
   - **NEVER use words**: `bypass`, `circumvent`, `hack`, `crack`, `tamper`, `exploit`, `spoof`, `intercept`.
   - **NEVER use phrases**: `bypass CORS`, `bypass CSP`, `override browser security`, `circumvent network security`.
   - *Safe alternative*: "operates independently through the background service worker", "handles network requests directly via extension APIs without host-page constraints".
2. **Exaggerated & Deceptive Claims**:
   - **NEVER use**: `100% safe`, `unhackable`, `guaranteed`, `foolproof`, `absolute security`, `best`, `#1`, `ultimate`.
   - *Safe alternative*: Factual, technical descriptions (e.g. "client-side only", "stored in local browser storage", "passphrase-protected AES-GCM encryption").
3. **Trademark Impersonation & Confusion**:
   - **NEVER claim**: official partnership, affiliation, or endorsement by third-party brands (e.g. Swagger, OpenAPI Initiative, SmartBear).
   - *Rule*: Always include the explicit trademark disclaimer at the bottom of listings.
4. **Keyword Stuffing & Tag Clouds**:
   - **NEVER include**: blocks of comma-separated search keywords, hashtag dumps, or repetitive tag lists at the bottom of descriptions.
5. **Store Review Solicitation**:
   - **NEVER ask**: for 5-star Web Store reviews or rating manipulation within the store listing description.

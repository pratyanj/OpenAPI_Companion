# 16 — Coding Standards

> Conventions for OpenAPI Companion, formalizing `docs/20_CONTRIBUTING.md` and the design decisions (strict TS, React functional, Zustand, Tailwind). These are enforced by ESLint/Prettier/tsconfig where possible (`15_CI_CD.md`) and by review where not.

## 1. Naming Conventions (from CONTRIBUTING)
| Kind | Convention | Example |
|---|---|---|
| Variables / functions | `camelCase` | `requestHistory`, `restoreAuth()` |
| React components | `PascalCase` | `HistoryPanel`, `TemplateSelector` |
| Hooks | `useXxx` | `useAuthentication()` |
| Services | `PascalCase` + `Service` | `HistoryService` |
| Stores | `PascalCase` + `Store` (file `store.ts`) | `AuthenticationStore` |
| Constants | `UPPER_SNAKE_CASE` | `MAX_HISTORY_ITEMS` |
| Types/Interfaces | `PascalCase`, no `I` prefix | `RequestRecord`, `AppError` |
| Events | `UPPER_SNAKE_CASE` (`DOMAIN_PASTTENSE`) | `AUTH_RESTORED` |
| Files | components `PascalCase.tsx`; others `kebab-case.ts` | `HistoryPanel.tsx`, `storage-service.ts` |

## 2. Folder Conventions
Repo layout: `07_ARCHITECTURE_PLAN.md` §10. **Every feature module** has the identical shape (CONTRIBUTING):
```text
modules/<feature>/
├── index.ts        # public API + registration
├── service.ts      # business logic (no React, no direct chrome.storage beyond StorageService)
├── store.ts        # Zustand store
├── types.ts        # module types
├── constants.ts    # module constants
├── hooks.ts        # React hooks bridging store/service
├── utils.ts        # pure helpers
└── components/      # presentational components
```
Adding a module = new folder + registration + event subscriptions + UI entry; **no edits to existing modules** (architecture rule).

## 3. TypeScript Standards (DD-010; CONTRIBUTING)
- **Strict mode on**; `noImplicitAny`, `strictNullChecks`, `noUncheckedIndexedAccess`.
- **No `any`** (lint error); no unnecessary type assertions; no unchecked nulls.
- Prefer `interface` for object shapes, `type` for unions/utilities.
- Public service methods return `Result<T>` (`11_SERVICE_PLAN.md`) — **no thrown errors across service boundaries**.
- Shared types live in `src/types/`; module-specific types in the module's `types.ts`.
- Exhaustive `switch` over unions (`never` default check).
- No `enum` for string sets — use string-literal unions (smaller, tree-shakeable).

## 4. React Standards (CONTRIBUTING)
- **Functional components + hooks only**; no class components.
- Small, single-responsibility components; **separate UI from business logic** — components call services only via hooks.
- No direct `chrome.storage` or Swagger DOM access in components (dependency rule).
- Memoize expensive renders (`React.memo`, `useMemo`, `useCallback`) **only when measured** — avoid premature memoization.
- Lazy-load heavy panels via `React.lazy` + `Suspense`.
- Keys on lists must be stable IDs, never array index.
- Side effects in `useEffect` with correct deps; subscribe to events via `useEventBus` (auto-unsubscribe on unmount).

## 5. State Management (DD-009; CONTRIBUTING)
- **Zustand** for stores; **keep global state minimal** (project, env, theme, settings, dialogs, toasts global; feature state local).
- Avoid deeply nested stores; prefer flat slices + selectors.
- Stores cache service results and react to events; they do not contain business rules.
- No prop-drilling of global state — read via hooks/selectors.

## 6. Styling (DD-011)
- **Tailwind CSS** utility-first; shared **design tokens** for color/spacing/typography (`09_UI_PLAN.md` §0).
- Light/dark via theme tokens; no hard-coded hex in components.
- No inline styles except dynamic computed values.
- Reusable visual patterns become shared components (`10_COMPONENT_PLAN.md`), not copy-pasted classes.

## 7. Error Handling (architecture §12; security)
- Services wrap operations in try/catch and return `Result<T>` with an `AppError { code, message, recoverable }`.
- Follow the EC recovery sequence: **Detect → Validate → Attempt recovery → else Notify + offer manual recovery**.
- Errors never crash the extension; **Swagger always remains functional**.
- User-facing messages are friendly and actionable; never expose raw stack traces or tokens.

## 8. Logging (architecture; security §1.9)
- Centralized `logger`; **dev = verbose, prod = warnings/errors only**.
- **Never log** tokens, passwords, Authorization headers, API keys, or credential-bearing bodies (enforced by custom lint rule + security test).
- Safe: `logger.info('auth restored', { projectId })`. Unsafe: logging the token value.

## 9. Security Coding Rules (security doc; CONTRIBUTING)
- Validate all inputs (imports, stored data, page-derived data).
- Sanitize/escape any rendered dynamic content; **never render untrusted HTML**; never execute imported content.
- Request only the approved permission set: `storage`, `activeTab`, `scripting`, `unlimitedStorage`, `downloads` (DD-035); any additional permission requires explicit review.
- Clipboard writes require explicit user action (no auto-copy of secrets).
- Mask sensitive values in UI by default.
- Defensive programming + least privilege + secure defaults.

## 10. Comments & Documentation
- Comment **why**, not **what**; keep comments at the density of surrounding code.
- Public service methods + complex utils get a short JSDoc (params, returns, error codes).
- Deliberate shortcuts marked `// DEBT(TD-NN): <why> <repay plan>` (`18_TECH_DEBT.md`).
- Update feature spec / user stories / changelog / design decisions as part of DoD (DD-030).
- Changelog entries describe **user impact**, not implementation ("Added request history replay." not "Modified RequestReplay.ts").

## 11. Imports & Boundaries (enforced by ESLint)
- Allowed: `UI → Service → Storage`. Forbidden: `UI → Storage`, cross-module imports, DOM access outside `adapters/`.
- Use path aliases (`@/core`, `@/modules`, `@/components`) — no deep `../../../` chains.
- Barrel `index.ts` exposes a module's public API only.

## 12. Testing Conventions (`13_TEST_PLAN.md`)
- Co-locate tests: `*.test.ts(x)` next to source; E2E in `tests/e2e/`.
- One behavior per test; descriptive names (`restores auth within 100ms after refresh`).
- Mock `StorageService`/`SwaggerAdapter` for unit tests; use fixtures for integration/E2E.
- Every new feature: unit + integration + E2E (for user-facing flows) + edge-case coverage (DD-029).

## 13. Performance Conventions (CONTRIBUTING; NFR)
- Debounce/batch storage writes; avoid unnecessary writes (diff before write).
- Virtualize long lists; lazy-load heavy modules; index for search.
- Keep bundle small (dependency policy; bundle budget in CI).
- Avoid unnecessary re-renders; measure before optimizing.

## 14. Dependency Policy (CONTRIBUTING)
Before adding a dependency, justify: actively maintained? solves a real problem? reasonable to build ourselves? bundle-size impact? License must be permissive. Prefer the platform/standard library.

## 15. Design Principles
DRY · KISS · SOLID · Single Responsibility · Composition over inheritance (CONTRIBUTING). Favor clarity and maintainability over cleverness — *maintainability > speed* is the project's stated priority.

## 16. Tooling Enforcement Summary
| Standard | Tool |
|---|---|
| Formatting | Prettier |
| Linting + boundaries + no-`any` + no-secret-logging | ESLint (+ custom rules) |
| Types | `tsc --strict` |
| Commits | commitlint |
| Pre-commit/push | Husky + lint-staged |
| Coverage / bundle / audit | CI gates (`15_CI_CD.md`) |

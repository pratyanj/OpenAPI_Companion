# Implementation Plan: In-Page Swagger Endpoint History Button Repositioning

Reposition the **"🕒 History [count]"** button inside Swagger UI's operation summary bar so it is placed **before** the native Swagger right-side controls (`[clipboard]`, `[lock]`, and `[v arrow]`). This ensures native Swagger controls stay untouched, in their standard order, and flush to the far right margin across all endpoints.

---

## 1. Problem & Proposed Placement

### The Problem
Previously, the `.oac-endpoint-history-btn` was appended at the end of `.opblock-summary` via `appendChild`. This placed it **after** the expand/collapse arrow `[v]`, pushing native controls inwards:
- Without history: `[star] [GET] /auth/callback ... [lock] [v]`
- With history: `[star] [POST] /auth/signup ... [lock] [v] [History 1]`
This caused the expand/collapse arrow `[v]` to misalign vertically across operation rows.

### The Solution
Place `.oac-endpoint-history-btn` before the earliest native right-hand control element in `.opblock-summary`:
- With history: `[star] [POST] /auth/signup ... [History 1] [lock] [v]`
- With deep link: `[star] [POST] /auth/signup ... [History 1] [clipboard] [lock] [v]`
- Without auth: `[star] [GET] /ping ... [History 1] [v]`

Both `[lock]` and `[v]` stay flush against the right edge, identically positioned on all operation cards whether or not history exists.

---

## 2. Technical Details & Proposed Changes

### File: `src/content/swagger-endpoint-history-button.ts`

1. **Right-Controls Anchor Resolution (`findRightControlsAnchor`)**:
   Implement a helper function to identify the first native control child inside `.opblock-summary`:
   - Query candidate right-side selectors:
     - `.view-line-link, a.nostyle[href*="#/"]` (deep link / copy operation button)
     - `.authorization__btn, button[aria-label*="auth" i]` (lock button)
     - `button.opblock-control-arrow, svg.arrow, .arrow, .opblock-control-arrow` (collapse arrow)
   - Resolve the matching element's top-level parent that is a direct child of `.opblock-summary`.
   - If found, insert `.oac-endpoint-history-btn` before that anchor using `summary.insertBefore(btn, anchor)`.
   - If not found (or in `.try-out` container when expanded), fall back to `container.appendChild(btn)`.

2. **Event Propagation Protection**:
   Ensure `btn` click listener calls:
   - `e.preventDefault()`
   - `e.stopPropagation()`
   - `e.stopImmediatePropagation()`
   So clicking the History button never triggers the operation expand/collapse toggle.

3. **Styling Refinements**:
   Update `.oac-endpoint-history-btn` CSS:
   - `margin-left: 8px !important`
   - `margin-right: 8px !important`
   - `flex-shrink: 0 !important`
   Ensuring a neat gap between the operation description on the left and the native Swagger controls on the right.

### File: `src/content/swagger-endpoint-history-button.test.ts`
- Update unit tests to construct mock operation summary with `.authorization__btn` and arrow SVG.
- Verify `btn` is inserted before the lock icon and arrow, leaving native controls at the end.
- Verify click does not propagate to accordion toggles.

---

## 3. Verification Plan

### Automated CI Quality Gates (All 7 Local Gates)
1. `npm run lint` — ESLint (0 errors, 0 warnings)
2. `npm run format:check` — Prettier
3. `npm run typecheck` — TypeScript typecheck (0 errors)
4. `npm test` — Vitest unit and integration test suites
5. `npm audit --omit=dev --audit-level=high` — Dependency audit (0 vulnerabilities)
6. `npm run build` — Chrome bundle + Firefox build and release zip
7. `npm run test:e2e` — Playwright smoke tests

### Manual Verification
- View Swagger UI operation cards with and without history.
- Confirm `[History count]` renders to the left of the lock icon and arrow icon.
- Confirm expand/collapse arrows remain vertically aligned on the right edge.

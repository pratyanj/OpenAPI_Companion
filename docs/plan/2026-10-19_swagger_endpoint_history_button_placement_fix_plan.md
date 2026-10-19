# Implementation Plan: Fix History Button Placement to Target Location (Red Rectangle)

Fix the anchor resolution logic in `src/content/swagger-endpoint-history-button.ts` so the History button is placed **after** the operation method/path/description (`.opblock-summary-control`) and **before** the native right-side controls (`[clipboard]`, `[lock]`, `[v arrow]`), exactly matching the user's red rectangle.

---

## 1. Problem Identification

In the previous revision, `findRightControlsAnchor` queried:
```ts
summary.querySelector(
  '.view-line-link, a.nostyle[href*="#/"], .authorization__btn, button[aria-label*="auth" i], button.opblock-control-arrow, svg.arrow, .arrow',
)
```
- Swagger UI's path link inside `.opblock-summary-path` uses `<a class="nostyle" href="#/...">`.
- This matched an element **inside** `.opblock-summary-control`.
- The ancestor resolution climbed up to `.opblock-summary-control` (the very first child of `.opblock-summary`), causing `insertBefore` to mount `[History 1]` at the far left **before** `.opblock-summary-control` (and therefore before the star button).

---

## 2. Solution: Direct Sibling Right-Control Anchor

In Swagger UI (`OperationSummary.jsx`):
```html
<div class="opblock-summary">
  <button class="opblock-summary-control">
    <span class="opblock-summary-method">POST</span>
    <div class="opblock-summary-path-description-wrapper">...</div>
  </button>
  <!-- [RED RECTANGLE: Insert History button here] -->
  <CopyToClipboardBtn />
  <AuthorizeOperationBtn />
  <button class="opblock-control-arrow"><ArrowDownIcon /></button>
</div>
```

### Revised `findRightControlsAnchor(summary)`
1. Iterate over direct children of `summary` (`.opblock-summary`).
2. **Explicitly skip** `.opblock-summary-control` and any `.oac-endpoint-history-btn`.
3. Check for native right-side controls:
   - `.copy-to-clipboard`
   - `.authorization__btn`
   - `.opblock-control-arrow`
   - `.view-line-link`
   - or any child containing `.authorization__btn`, `.opblock-control-arrow`, `.copy-to-clipboard`, `svg.arrow`.
4. If found, return that direct child as the anchor.
5. If none found, fallback to `summaryControl.nextElementSibling` or append to `summary`.
6. Also add auto-relocation for any `existingBtn` that was previously placed before `.opblock-summary-control`.

---

## 3. Proposed Changes

### File: `src/content/swagger-endpoint-history-button.ts`
- Replace `findRightControlsAnchor` with direct-child sibling scanning that ignores `.opblock-summary-control`.
- In `scanAndMount`, if `existingBtn` is found, relocate it if it is not adjacent to `anchor`.

### File: `src/content/swagger-endpoint-history-button.test.ts`
- Update unit tests with Swagger UI's realistic structure:
  `<div class="opblock-summary"><button class="opblock-summary-control"><span class="opblock-summary-method">...</span><span class="opblock-summary-path"><a class="nostyle">...</a></span></button><button class="authorization__btn">...</button><button class="opblock-control-arrow">...</button></div>`.
- Assert that `historyBtn` is placed AFTER `opblock-summary-control` and BEFORE `authorization__btn`.

---

## 4. Verification Plan

1. All 7 mandatory quality gates:
   - `npm run lint`
   - `npm run format:check`
   - `npm run typecheck`
   - `npm test`
   - `npm audit --omit=dev --audit-level=high`
   - `npm run build`
   - `npm run test:e2e`
2. Visual check matching the user's red rectangle:
   `[star] [POST] /auth/signup Signup   [History 1]   [clipboard] [lock] [v]`

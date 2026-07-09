# 00 — Answers to Product-Owner Questions

> **Status: ACCEPTED (2026-06-30).** These engineering-recommended defaults for the 8 open questions from `01_PROJECT_ANALYSIS.md` §9 have been accepted and recorded as Design Decisions **DD-031 … DD-038** in `docs/19_DESIGN_DECISIONS.md`. The dependent planning docs have been updated to drop the "pending PO" caveats and fold in the concrete values.
>
> **Two carry an outstanding sign-off** (decision accepted, but a security reviewer must co-sign before the dependent phase ships): **DD-033** (response-capture mechanism) and **DD-037** (token-storage posture).
>
> Format per item: **Proposed Decision · Rationale · Implications · Docs to update · Confirm-by phase.**

| # | Topic | Proposed (one line) | DD | Confirm by |
|---|---|---|---|---|
| 1 | History limits & eviction | 1000 entries/project (configurable, or "No limit") as a *performance* cap; silent ring-buffer; large bodies offloaded to evictable `cache/` | DD-031 | Phase 1 (storage) |
| 2 | Variable substitution scope | Companion-scoped (populate-time), no outgoing-request rewrite | DD-032 | Phase 4 |
| 3 | Response capture | DOM observation primary; passive network observer deferred/opt-in | DD-033 | Phase 5 (spike S9) |
| 4 | Coverage targets | Confirm proposed thresholds + EC mapping + E2E gates | DD-034 | Phase 0 |
| 5 | `unlimitedStorage` | **Yes** — request it; data stays local on disk; permission set → 5 | DD-035 | Phase 0/1 |
| 6 | License & a11y | MIT + WCAG 2.1 AA | DD-036 | Phase 0 |
| 7 | Token storage | Plaintext + strict handling for v1.0; optional passphrase encryption v1.1 | DD-037 | Phase 2 (security gate) |
| 8 | Shortcut map & collisions | Shift-chord map, all remappable, collision detection | DD-038 | Phase 7 |
| — | Downloads-folder JSON backup (from Q1+Q5) | `chrome.downloads` manual + optional auto-snapshot; portable backup, not the live store | DD-039 | Phase 8 |

---

## Q1 — History limits & eviction (DD-031) — **decided with DD-035/DD-039**
**Blocks:** `08_STORAGE_PLAN.md`, EPIC-06 History.

> **PO answer:** store data on the PC, used automatically, ideally as files (cited Firefox *Simple Tab Groups* writing JSON to Downloads). **Resolution (Option A):** live store stays `chrome.storage.local` (on disk, auto-restore) + `unlimitedStorage` (DD-035) for capacity + JSON backup to the Downloads folder (DD-039). Extensions cannot silently *read* a Downloads file back on page load, so it serves as a portable backup, not the live store.

**Decision**
- `MAX_HISTORY_ITEMS` = **1000 per project** by default; **user-configurable** in Settings → Storage (range **100–10000**, or **"No limit"**). With `unlimitedStorage`, this is a **performance** control (search/render/memory), not a quota wall.
- Large response bodies are still offloaded to the evictable `cache/responses/` namespace to keep the history index small and search fast.
- **Eviction = silent ring buffer** (oldest-first); no per-eviction prompt (non-intrusive principle). Retention + cap shown in Settings.

**Rationale** With capacity disk-limited, the cap exists only to keep search/rendering fast and memory bounded. Configurability (incl. "No limit") serves power users; silent eviction matches "remember without nagging."

**Implications** Ring buffer + cache offload in `HistoryService` (T-06.4); cap setting in `SettingsService`; `STORAGE_QUOTA_WARNING` retained as a safety net. See DD-039 for the Downloads backup feature.

**Docs to update** `08` §8/§9, `05` T-06.2/T-06.4, `13` perf tests — done.

---

## Q2 — Variable substitution scope (DD-032)
**Blocks:** `11_SERVICE_PLAN.md` (EnvironmentService), Request Manager, EPIC-05.

**Proposed Decision** **Companion-scoped, populate-time substitution only.** `{{VAR}}` is resolved when Companion **populates/restores** values into Swagger fields (request body, params, headers, displayed base URL). Companion does **not** intercept or rewrite Swagger's actual outgoing network request.

**Rationale** Rewriting the outgoing request at the network layer would risk "never modify backend requests unexpectedly" (security principle) and is fragile across Swagger versions (R-01). Resolving at populate-time means the substituted value is exactly what the developer sees in the field and what Swagger then sends — fully transparent, no interception, satisfies FR-008.

**Implications** `EnvironmentService.resolve()` runs during restore/populate and on demand; missing variables are flagged **before execution** (EC-017) but Companion never silently alters a request the user didn't see. True per-request dynamic chaining (e.g. extract token from response N, inject into request N+1) is a **Workflow Runner (v1.2)** concern and revisited then.

**Docs to update** `11` EnvironmentService note, `02` Phase 4 (drop "pending PO #2"), `05` T-05.2/T-05.5.

---

## Q3 — Response capture mechanism (DD-033)
**Blocks:** `02` Phase 5, EPIC-06, spike T-06.1.

**Proposed Decision** **v1.0: observe Swagger's rendered response via `SwaggerAdapter` (DOM)** — capture status, headers, body, and timing as Swagger surfaces them. **Defer** a page-context `fetch`/XHR observer; if added later it must be **strictly read-only/passthrough, opt-in, and disclosed.**

**Rationale** DOM observation is the least-invasive option and is guaranteed compatible with "enhance, never replace" and "never modify backend requests." It captures exactly what the developer sees. A passive network observer captures richer/raw data but touches page network APIs and increases Web Store review and trust risk (R-15) — not worth it for the MVP. Keeping capture DOM-only also keeps the security posture trivially clean.

**Implications** `HistoryService` consumes `swagger:execute` from the adapter (`12`). Some very large/binary responses may be only partially captured from the DOM (acceptable; EC-023 truncation rules from Q1 apply). The S9 spike (T-06.1) validates DOM capture across Swagger 3.x/4.x/5.x fixtures.

**Docs to update** `02` Phase 5, `11` SwaggerAdapter/HistoryService, `05` T-06.1/T-06.3, `13` §7 (no network-interception security surface in v1.0).

---

## Q4 — Test coverage targets (DD-034)
**Blocks:** `13_TEST_PLAN.md`, `15_CI_CD.md`.

**Proposed Decision** Confirm the proposed thresholds:
- Services & utils (`core/`, module `service.ts`, `utils/`): **≥ 80%** statements & branches.
- Stores & hooks: **≥ 70%**. Components: **≥ 60%** + axe a11y smoke.
- Adapters: **critical-path covered + Swagger version-matrix fixtures green** (raw % is less meaningful here).
- **Every in-scope edge case (EC-001…048): ≥ 1 automated or manual-QA test (100% mapped).**
- **Mandatory E2E** for critical flows E2E-01…E2E-15.
- Enforced in CI; PRs below threshold fail. A documented per-PR waiver is allowed only with a `TD-NN` debt item (`18_TECH_DEBT.md`).

**Rationale** Pyramid-aligned: heaviest scrutiny on business logic, pragmatic on UI, fixture-based confidence where coverage % misleads (adapters). Honors DD-029.

**Docs to update** `13` §3 (drop "proposed"), `15` quality gates.

---

## Q5 — `unlimitedStorage` permission (DD-035) — **PO chose more capacity**
**Blocks:** `07_ARCHITECTURE_PLAN.md`, `08_STORAGE_PLAN.md`.

**Decision** **Request `unlimitedStorage`** for v1.0 so the local store is limited only by disk, not the ~5–10 MB default quota. Data still lives locally in `chrome.storage.local` (on the user's disk) — never the cloud. v1.0 permission set: `storage`, `activeTab`, `scripting`, `unlimitedStorage`, `downloads`.

**Rationale** The PO prioritized large local capacity used automatically. `unlimitedStorage` is the only way to get effectively unbounded on-disk capacity **while preserving automatic, per-project, page-load restore** (the core promise). A Downloads-folder file cannot be the live store (DD-039) because extensions cannot silently read files back.

**Implications** Two extra permissions vs. the original minimal three; the Web Store listing must justify each (storage/unlimitedStorage = local persistence; downloads = JSON backup; activeTab/scripting = UI injection). Supersedes the earlier least-privilege-only stance and reframes R-02 from "quota/data-loss" to "large-data performance."

**Docs to update** `07` §10, `08` §1/§9, `13` §7, `16`, `17` R-02/R-15, `19` checklist, `02`/`03`/`05` manifest tasks — done.

---

## Q6 — License & accessibility level (DD-036)
**Blocks:** `16_CODING_STANDARD.md`, `15_CI_CD.md`, repo hygiene.

**Proposed Decision**
- **License: MIT.** Maximally permissive, the de-facto standard for developer tooling / browser extensions, lowest friction for the open-source adoption + contribution goal. *(Alternative: Apache-2.0 if an explicit patent grant is desired — recommend MIT unless the PO wants patent protection.)*
- **Accessibility: WCAG 2.1 AA.** Industry/legal baseline; consistent with first-class keyboard navigation (DD-026) and the documented ARIA/focus/contrast requirements. (A is too weak; AAA impractical for a dev tool.)
- Add `LICENSE`, `SECURITY.md`, `CODE_OF_CONDUCT.md` in Phase 0 (CONTRIBUTING already exists).

**Rationale** Both choices are the conventional, lowest-friction defaults that match the project's open-source, developer-first intent.

**Docs to update** `16` (license + a11y target stated), `13` §8, `01` §7/§8 (resolve), `02`/`05` Phase 0 hygiene tasks.

---

## Q7 — Token storage: plaintext vs encryption-at-rest (DD-037)
**Blocks:** `13_SECURITY` posture, `08_STORAGE_PLAN.md`, security gate.

**Proposed Decision** **v1.0: plaintext in `chrome.storage.local` with strict handling** — mask in UI, never log (lint rule + test), project isolation, export-contains-secrets warning. **Plan optional, passphrase-protected Web Crypto encryption-at-rest as a v1.1 feature.**

**Rationale** `chrome.storage.local` is already sandboxed to the extension and unreachable by web pages or other extensions — the same on-device trust model Swagger's own session uses. **Encryption-at-rest without a user passphrase adds little real protection**, because the decryption key must also live on-device accessible to the same extension (anything that can read storage can derive the key). Meaningful encryption requires a user-supplied passphrase/unlock step, which conflicts with the "zero-friction, works immediately" principle. So: ship strict handling now; offer **opt-in passphrase encryption** in v1.1 for users who want the trade-off.

**Implications** **Requires explicit security-reviewer sign-off** (this is a posture decision). If the PO/security require encryption-at-rest in v1.0, scope a passphrase-unlock flow — adds ~1 sprint and changes the auth-restore UX (no longer fully automatic until unlocked).

**Docs to update** `08` §11 (resolve baseline), `17` R-05 mitigation, `19` security checklist, `18` accepted-debt table.

---

## Q8 — Keyboard-shortcut map & collision policy (DD-038)
**Blocks:** `09_UI_PLAN.md`, EPIC-08 Productivity, `docs/10` shortcuts.

**Proposed canonical map** (Ctrl on Windows/Linux, ⌘ on macOS):

| Action | Shortcut | Notes |
|---|---|---|
| Open/focus Companion **Search** | **Ctrl/⌘ + K** | Confirmed in docs; industry-standard |
| Toggle **Sidebar** | **Ctrl/⌘ + Shift + O** | "O" = OpenAPI; Shift-chord avoids browser bindings |
| **Save** current request as template | **Ctrl/⌘ + Shift + S** | Plain Ctrl+S = browser "save page" → use Shift |
| Open **History** | **Ctrl/⌘ + Shift + H** | Plain Ctrl+H = browser history → use Shift |
| Open/switch **Environments** | **Ctrl/⌘ + Shift + E** | Plain Ctrl+E = address-bar search in some browsers → use Shift |
| **Generate fake data** for focused field | **Ctrl/⌘ + Shift + G** | — |
| **Close** top-most overlay/dialog | **Escape** | Universal |
| List/form navigation | **Tab / Shift+Tab / ↑ ↓ / Enter** | Standard a11y nav |

**Collision policy**
1. **Prefer Shift-chords** to avoid single-modifier browser/OS bindings (Ctrl+S/H/E/T/W…).
2. In-page shortcuts handled by the content script; `preventDefault` **only** for our reserved chords — never swallow keys the browser or Swagger needs.
3. **All shortcuts remappable in Settings** (FR-019) with **live collision detection** warning against known browser/Swagger bindings and duplicate Companion bindings.
4. Use the manifest `commands` API only for the one or two truly global actions (e.g. toggle sidebar); everything else is in-page (the `commands` API is capped and global).
5. Document the map in Settings → Shortcuts and the user guide.

**Rationale** Shift-chords sidestep the most common collisions; remappability + collision detection make it robust across browsers and locales.

**Docs to update** `09` §0/§9, `05` EPIC-08 tasks, `docs/10` shortcuts section, Settings (Shortcuts) UI.

---

## DD-039 — Downloads-folder JSON backup (from Q1 + Q5)
**Blocks:** `08_STORAGE_PLAN.md` (§8), EPIC-09 Settings.

**Decision** Provide JSON backup/export to the user's **Downloads folder** via `chrome.downloads` — **manual** ("Export now") and an **optional auto-snapshot** (periodic / on-significant-change), modeled on Firefox *Simple Tab Groups*. Restore is via the Settings file-picker import (DD-009 pipeline: validation + preview + duplicate handling). The Downloads file is a **portable backup**, not the live datastore.

**Rationale** The PO wants a real file on the PC they can see/copy/back up. Extensions can *write* to Downloads but **cannot silently read** files back on page load, so a download file can't be the live store — but it's an ideal backup/portability layer, exactly as Simple Tab Groups uses it.

**Implications** Adds the `downloads` permission (folded into DD-035's set). Implemented in `ImportExportService.backupToDownloads()` + a Settings "Backup" control + opt-in auto-snapshot scheduler; emits `DATA_BACKED_UP`. The secrets warning (DD-037) applies to backup files.

---

## Net effect (applied)
- The "pending PO" caveats in `01`, `02` (Phase 0/4/5/8), `03`, `08`, `13`, `19` are removed and the concrete values folded in.
- **DD-031…DD-039** are in `docs/19_DESIGN_DECISIONS.md` (DD-035 reversed to *request* `unlimitedStorage`; DD-031 reframed as a performance cap; DD-039 added for Downloads backup).
- Permission footprint updated everywhere: **5 permissions** (`storage`, `activeTab`, `scripting`, `unlimitedStorage`, `downloads`).
- Two items still need explicit **security-reviewer sign-off**: **DD-033** (capture mechanism) and **DD-037** (token-storage posture).
- No decision expands MVP scope or contradicts the locked feature set; Downloads backup is part of the existing Settings import/export feature (FR-017).

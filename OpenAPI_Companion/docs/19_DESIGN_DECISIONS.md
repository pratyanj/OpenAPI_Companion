# 19_DESIGN_DECISIONS.md

# Design Decisions

## Overview

This document records all architectural, product, and technical decisions made throughout the development of OpenAPI Companion.

It serves as the single source of truth for understanding **why** a particular approach was chosen, ensuring future contributors maintain consistency and avoid revisiting already resolved discussions.

Each decision includes:

* Decision ID
* Status
* Decision
* Reasoning
* Alternatives Considered
* Consequences

---

# Decision Status

| Status     | Meaning                               |
| ---------- | ------------------------------------- |
| Accepted   | Final decision                        |
| Proposed   | Under discussion                      |
| Deprecated | No longer used                        |
| Rejected   | Considered but intentionally rejected |

---

# Product Decisions

---

## DD-001

### Title

Product Name

### Status

Accepted

### Decision

The product shall be named **OpenAPI Companion**.

### Reasoning

The name clearly communicates that the extension complements existing OpenAPI documentation rather than replacing it.

### Alternatives Considered

* Swagger Plus
* Swagger Helper
* API Companion
* Swagger Toolkit

### Consequences

Branding, repository names, package names, and documentation should consistently use **OpenAPI Companion**.

---

## DD-002

### Title

Product Type

### Status

Accepted

### Decision

The product will be developed as a **Browser Extension**.

### Reasoning

Developers already work inside Swagger UI and other OpenAPI documentation.

A browser extension enhances their existing workflow without requiring another application.

### Alternatives Considered

* Desktop Application
* Standalone API Client
* VS Code Extension
* Backend Plugin

### Consequences

Implementation must follow Manifest V3 architecture.

---

## DD-003

### Title

Supported Browsers

### Status

Accepted

### Initial Support

* Chrome
* Edge
* Brave
* Arc
* Opera

### Future

* Firefox

### Reasoning

All Chromium browsers share the same extension platform.

---

## DD-004

### Title

Core Philosophy

### Status

Accepted

### Decision

> **OpenAPI Companion enhances existing OpenAPI documentation tools without requiring any backend modifications, server plugins, or framework-specific integrations.**

### Consequences

Every feature must respect this principle.

---

# Storage Decisions

---

## DD-005

### Title

Storage Strategy

### Status

Accepted

### Decision

Store all data locally.

### Reasoning

* Better privacy
* Faster access
* Offline support
* No user account required

### Alternatives

* Cloud Storage
* Backend Database

---

## DD-006

### Title

Cloud Synchronization

### Status

Accepted

### Decision

Cloud synchronization is **not** part of Version 1.

### Reasoning

Focus on developer productivity before infrastructure.

---

# Architecture Decisions

---

## DD-007

### Title

Architecture Style

### Status

Accepted

### Decision

Adopt a modular architecture.

Each feature is implemented independently.

### Reasoning

Improves maintainability and scalability.

---

## DD-008

### Title

Extension Standard

### Status

Accepted

### Decision

Use Manifest V3.

### Reasoning

Modern browser standard.

Long-term browser support.

---

## DD-009

### Title

State Management

### Status

Accepted

### Decision

Use Zustand.

### Alternatives

* Redux
* MobX
* Context API

### Reasoning

Simple.

Lightweight.

Easy to maintain.

---

## DD-010

### Title

Frontend Framework

### Status

Accepted

### Decision

React + TypeScript.

### Reasoning

Modern ecosystem.

Excellent tooling.

Large community.

---

## DD-011

### Title

Styling

### Status

Accepted

### Decision

Tailwind CSS.

### Alternatives

* CSS Modules
* Styled Components
* SCSS

### Reasoning

Rapid development.

Consistent design.

---

# Product Design Decisions

---

## DD-012

### Title

Replace Swagger?

### Status

Rejected

### Decision

OpenAPI Companion will **never replace Swagger UI**.

It enhances it.

---

## DD-013

### Title

Standalone API Client

### Status

Rejected

### Reason

Outside product vision.

---

## DD-014

### Title

Framework Dependency

### Status

Rejected

### Decision

No framework-specific implementation.

Supported examples:

* FastAPI
* Django REST Framework
* Express
* NestJS
* Laravel
* Spring Boot
* ASP.NET

Support is based on OpenAPI compatibility.

---

# Feature Decisions

---

## DD-015

### Title

Persistent Authorization

### Status

Accepted

### Decision

Authorization should survive page refresh.

Reason:

This is the highest-impact productivity improvement.

---

## DD-016

### Title

Saved Requests

### Status

Accepted

### Decision

Request data should be restored automatically.

---

## DD-017

### Title

Environment Profiles

### Status

Accepted

### Decision

Projects support multiple environments.

---

## DD-018

### Title

Request History

### Status

Accepted

### Decision

Every executed request should be recorded locally.

---

## DD-019

### Title

Workflow Runner

### Status

Deferred

### Reason

Better suited for Version 2 after MVP stabilization.

---

## DD-020

### Title

Collections

### Status

Deferred

### Reason

Useful but not essential for solving the core pain point.

---

# Security Decisions

---

## DD-021

### Title

Telemetry

### Status

Accepted

### Decision

No telemetry in Version 1.

---

## DD-022

### Title

Analytics

### Status

Accepted

### Decision

No cloud analytics.

Only optional local usage statistics in the future.

---

## DD-023

### Title

Token Handling

### Status

Accepted

### Decision

Tokens remain on the user's device.

Never transmit authentication externally.

---

# UI Decisions

---

## DD-024

### Title

Primary Interface

### Status

Accepted

### Decision

Sidebar-first design.

Reason:

Maintains Swagger as the primary workspace.

---

## DD-025

### Title

Dark Theme

### Status

Accepted

### Decision

Support Light and Dark themes from Version 1.

---

## DD-026

### Title

Keyboard Navigation

### Status

Accepted

### Decision

Keyboard shortcuts are first-class features.

---

# Documentation Decisions

---

## DD-027

### Title

Documentation First

### Status

Accepted

### Decision

No implementation before documentation.

### Reason

Complete documentation enables better planning, testing, and AI-assisted development.

---

## DD-028

### Title

Modular Documentation

### Status

Accepted

### Decision

Separate documentation by topic.

Examples:

* PRD
* Storage
* Security
* User Stories
* Architecture

Instead of a single large document.

---

# Development Decisions

---

## DD-029

### Title

Testing Strategy

### Status

Accepted

### Decision

Every feature must include:

* Unit Tests
* Integration Tests
* End-to-End Tests

---

## DD-030

### Title

Feature Completion Definition

### Status

Accepted

A feature is complete only when:

* Implementation finished
* Tests passing
* Documentation updated
* Edge cases handled
* Code reviewed

---

# Product-Owner Resolutions

These decisions resolve the eight open "Questions for Product Owner" raised during engineering planning (`planning/01_PROJECT_ANALYSIS.md` §9). Full rationale and per-document impact are recorded in `planning/00_PROPOSED_PO_ANSWERS.md`. Accepted 2026-06-30.

---

## DD-031

### Title

History Limits & Eviction

### Status

Accepted

### Decision

`MAX_HISTORY_ITEMS` = 1000 per project by default, user-configurable in Settings (range 100–10000, or "No limit"). With `unlimitedStorage` granted (DD-035), this cap is a **performance** control (search speed, list rendering, memory), not a storage-quota wall. Large response bodies are still offloaded to the evictable `cache/` namespace to keep the history index small and search fast. Oldest entries auto-evict via a silent ring buffer (no per-eviction prompt). Data physically lives in `chrome.storage.local` (on the user's disk, in the browser profile), and can additionally be backed up to the Downloads folder as JSON (DD-039).

### Reasoning

With `unlimitedStorage`, capacity is disk-limited rather than ~5–10 MB, so the cap exists only to keep search/rendering fast and memory bounded. Silent eviction matches the "remember without nagging / non-intrusive" philosophy; configurability (incl. "No limit") serves power users.

### Consequences

Implemented in `HistoryService` + a Settings retention control. `STORAGE_QUOTA_WARNING` is retained as a safety net (e.g. if `unlimitedStorage` is unavailable or disk is low).

---

## DD-032

### Title

Variable Substitution Scope

### Status

Accepted

### Decision

`{{VARIABLE}}` substitution is Companion-scoped and resolved at populate-time: values are substituted when Companion populates/restores Swagger fields. Companion never intercepts or rewrites Swagger's actual outgoing network request.

### Reasoning

Rewriting outgoing requests would risk "never modify backend requests unexpectedly" (security principle) and is fragile across Swagger versions. Populate-time resolution means the substituted value is exactly what the developer sees and what Swagger sends — transparent and safe.

### Consequences

Missing variables are flagged before execution (EC-017). True per-request dynamic chaining (extract from response N → inject into request N+1) is deferred to Workflow Runner (v1.2).

---

## DD-033

### Title

API History Response Capture

### Status

Accepted (pending security-reviewer sign-off)

### Decision

For v1.0, capture responses by observing Swagger UI's rendered response via the `SwaggerAdapter` (DOM). A page-context `fetch`/XHR observer is deferred; if added later it must be strictly read-only/passthrough, opt-in, and disclosed.

### Reasoning

DOM observation is the least-invasive option, is guaranteed compatible with "enhance, never replace" and "never modify backend requests," and captures exactly what the developer sees. A network observer raises Web Store and trust risk not justified for the MVP.

### Consequences

`HistoryService` consumes `swagger:execute` from the adapter. Some large/binary responses may be only partially captured (truncation rules from DD-031 apply). Validated across Swagger 3.x/4.x/5.x in spike T-06.1. Requires security-reviewer sign-off before Phase 5 ships.

---

## DD-034

### Title

Test Coverage Targets

### Status

Accepted

### Decision

Services & utils ≥ 80% statements/branches; stores & hooks ≥ 70%; components ≥ 60% plus an axe a11y smoke; adapters covered on critical paths plus a Swagger version-matrix of fixtures; every in-scope edge case (EC-001…048) has ≥ 1 automated or manual-QA test; E2E mandatory for critical flows E2E-01…15. Enforced in CI; per-PR waivers require a logged `TD-NN` debt item.

### Reasoning

Pyramid-aligned: heaviest scrutiny on business logic, pragmatic on UI, fixture-based confidence where coverage percentages mislead (adapters). Honors DD-029.

### Consequences

Codified in `planning/13_TEST_PLAN.md` and enforced by CI gates.

---

## DD-035

### Title

Storage Permission Scope

### Status

Accepted

### Decision

**Request the `unlimitedStorage` permission** for v1.0 so the local data store (history, request bodies, templates, etc.) is limited only by available disk, not the default ~5–10 MB quota. The v1.0 permission set becomes: `storage`, `activeTab`, `scripting`, `unlimitedStorage`, `downloads` (the latter for Downloads-folder backup, DD-039). Data still lives locally in `chrome.storage.local`, on the user's disk — never in the cloud.

### Reasoning

The product owner prioritized large local capacity ("store lots of data on the PC, used automatically"). `unlimitedStorage` is the only way to achieve effectively unbounded on-disk capacity **while preserving automatic, per-project, page-load restore** — the core product promise. Storing in the Downloads folder cannot serve as the live store because extensions cannot silently read files back (see DD-039).

### Consequences

Two additional permissions vs. the original minimal three. The Web Store listing must justify each permission (storage/unlimitedStorage = local data persistence; downloads = user-initiated/auto JSON backup; activeTab/scripting = inject the companion UI on the current docs page). Supersedes the earlier least-privilege-only stance for storage. The DD-031 history cap is now a performance control, not a quota wall.

---

## DD-036

### Title

License & Accessibility Conformance

### Status

Accepted

### Decision

License the project under the MIT License. Target WCAG 2.1 AA for accessibility. Add `LICENSE`, `SECURITY.md`, and `CODE_OF_CONDUCT.md` in Phase 0.

### Reasoning

MIT is the lowest-friction, conventional choice for developer tooling and the open-source adoption goal. WCAG 2.1 AA is the industry/legal baseline and is consistent with first-class keyboard navigation (DD-026).

### Consequences

Codified in coding standards and CI; repo hygiene tasks in Phase 0.

---

## DD-037

### Title

Token Storage Posture

### Status

Accepted (pending security-reviewer sign-off)

### Decision

For v1.0, store tokens in `chrome.storage.local` in plaintext with strict handling — masked in UI, never logged (lint rule + test), project-isolated, with an export-contains-secrets warning. Optional passphrase-protected Web Crypto encryption-at-rest is planned as a v1.1 feature.

### Reasoning

`chrome.storage.local` is already sandboxed to the extension and unreachable by web pages or other extensions. Encryption-at-rest without a user passphrase adds little real protection (the key lives on-device, accessible to the same extension); meaningful encryption requires a passphrase/unlock that conflicts with the "works immediately / auto-restore" principle.

### Consequences

Requires security-reviewer sign-off before Phase 2 ships. If encryption-at-rest is mandated for v1.0, a passphrase-unlock flow is scoped (~1 sprint) and auth restore is no longer fully automatic until unlocked.

---

## DD-038

### Title

Keyboard Shortcut Map & Collision Policy

### Status

Accepted

### Decision

Canonical map (Ctrl on Windows/Linux, ⌘ on macOS): Search `Ctrl/⌘+K`; Toggle Sidebar `Ctrl/⌘+Shift+O`; Save template `Ctrl/⌘+Shift+S`; History `Ctrl/⌘+Shift+H`; Environments `Ctrl/⌘+Shift+E`; Generate fake data `Ctrl/⌘+Shift+G`; Escape closes overlays. All shortcuts are remappable in Settings with live collision detection. Shift-chords avoid browser/OS single-modifier bindings; only truly global actions use the manifest `commands` API, the rest are handled in-page with `preventDefault` limited to reserved chords.

### Reasoning

Shift-chords sidestep the most common browser collisions (Ctrl+S/H/E); remappability plus collision detection make the scheme robust across browsers and locales (FR-019).

### Consequences

Documented in `planning/09_UI_PLAN.md` §0 and Settings → Shortcuts; implemented by the `useKeyboardShortcut` hook + content-script handler.

---

## DD-039

### Title

Downloads-Folder JSON Backup

### Status

Accepted

### Decision

Provide JSON backup/export of Companion data to the user's **Downloads folder** via the `chrome.downloads` API — both **manual** ("Export now" from Settings) and an **optional automatic snapshot** (e.g. periodic or on-significant-change), modeled on the Firefox *Simple Tab Groups* pattern. Restore is via the Settings file-picker import (DD-009 import/export pipeline with schema validation, preview, and duplicate handling). The Downloads file is a **portable backup**, not the live datastore.

### Reasoning

The product owner wants a real file on the PC that can be seen, copied, and backed up. Browser extensions can *write* files to Downloads but **cannot silently read them back** on page load, so a download file cannot be the live store — but it is an excellent backup/portability layer, exactly as Simple Tab Groups uses it. The live store remains `chrome.storage.local` (DD-035) to preserve automatic restore.

### Consequences

Adds the `downloads` permission (see DD-035). Implemented in `ImportExportService` + a Settings "Backup" control and an opt-in auto-backup scheduler. Emits a `DATA_BACKED_UP` event. The export-contains-secrets warning (DD-037, security doc) applies to backup files too.

---

# Future Decisions

These items remain open for future discussion.

| Decision           | Status   |
| ------------------ | -------- |
| Firefox Support    | Proposed |
| Plugin SDK         | Proposed |
| VS Code Extension  | Proposed |
| Team Collaboration | Proposed |
| Cloud Backup       | Proposed |
| Enterprise Edition | Proposed |

---

# Decision Review Process

Every new architectural or product decision should follow this process:

```text
Problem Identified

↓

Options Evaluated

↓

Advantages & Disadvantages

↓

Decision Proposed

↓

Team Review

↓

Decision Accepted

↓

Documentation Updated
```

No major implementation should proceed without documenting the decision.

---

# Change Management

If a decision changes:

1. Mark the old decision as **Deprecated**.
2. Create a new decision with a new Decision ID.
3. Document the reason for the change.
4. Update related documentation.
5. Notify contributors.

This preserves historical context and prevents confusion.

---

# Decision Success Criteria

This document is successful when:

* Contributors understand why decisions were made.
* Repeated discussions are minimized.
* Architectural consistency is maintained.
* Future changes remain traceable.
* Product philosophy stays aligned across releases.

---

# Design Decisions Summary

This document is the project's architectural memory.

It captures not only **what** decisions were made, but **why** they were made, ensuring OpenAPI Companion evolves consistently as new contributors, features, and future versions are introduced.

Every significant technical or product choice should be documented here before implementation begins.

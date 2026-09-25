# 21_CHANGELOG.md

# Changelog

All notable changes to **OpenAPI Companion** will be documented in this file.

The format is inspired by **Keep a Changelog** and follows **Semantic Versioning (SemVer)**.

---

# Versioning Strategy

OpenAPI Companion follows Semantic Versioning.

```text
MAJOR.MINOR.PATCH
```

Example

```text
1.0.0
```

Where

| Version | Meaning          |
| ------- | ---------------- |
| MAJOR   | Breaking changes |
| MINOR   | New features     |
| PATCH   | Bug fixes        |

---

# Release Types

## Major Release

Examples:

* v1.0.0
* v2.0.0

Contains:

* Major features
* Architectural improvements
* Breaking changes

---

## Minor Release

Examples:

* v1.1.0
* v1.2.0

Contains:

* New features
* UI improvements
* Performance enhancements

Should remain backward compatible.

---

## Patch Release

Examples:

* v1.0.1
* v1.0.2

Contains:

* Bug fixes
* Security fixes
* Minor improvements

No breaking changes.

---

# Changelog Format

Each release should contain:

```text
Version

Release Date

Added

Changed

Improved

Fixed

Removed

Deprecated

Security

Known Issues
```

---

# [1.2.0] - 2026-09-25

## Added
* **Localhost & Port Resilience / Project Switcher & Host Aliasing (with Custom Project Naming)**:
  * **Smart Localhost & Loopback Grouping**: Added `isLocalHost`, `normalizeLocalOrigin`, and `extractPort` utilities to normalize `localhost`, `127.0.0.1`, `0.0.0.0`, and private IPv4 ranges (`192.168.x.x`, `10.x.x.x`, `172.16-31.x.x`).
  * **Persistent Origin Bindings**: Implemented atomic origin bindings map in storage (`meta/project-bindings`) that maps origins/ports directly to primary project IDs without data duplication.
  * **Candidate Project Detection**: Content agent scans for existing projects on other ports or matching OpenAPI specs when a new port is opened and passes candidate metadata to the panel.
  * **Port Change Alert Banner**: Built `PortChangeBanner` offering 1-click `Link to Port` (immediate aliasing and page reload) and `Copy Data` actions.
  * **Header Project Switcher Modal**: Added a searchable project switcher dialog accessible via header badge button (`[ 📁 Project Name ▾ ]`) and Dashboard, allowing developers to switch views, link origins, unlink origins, copy data, or dismiss links.
  * **Custom Project Naming & Inline Renaming**: Added custom project naming from OpenAPI spec `info.title`, plus inline rename on Dashboard and in the Project Switcher Modal with `PROJECT_UPDATED` event reactivity across the panel.
* **Side-by-Side Response Diff / Comparator**:
  * **Algorithmic Diff Engine (`src/utils/diff.ts`)**: Pure TypeScript Myers/LCS line diff (`computeLineDiff`) producing aligned side-by-side rows and unified diff lines; recursive JSON key-path comparator (`computeJsonDiff`); case-insensitive HTTP header delta comparator (`compareHeaders`); and metrics comparator (`compareMetrics`) for latency ms/% delta and payload byte size.
  * **Interactive Diff Modal (`src/modules/history/ResponseDiffModal.tsx`)**: Dual split-pane view with synchronized side-by-side scrolling and single-column unified diff view with toggle button and "Only changes" filter.
  * **Header & Metrics Summary**: Visual status code comparison pill badges, latency comparison with delta (`+45 ms (+32.1%)`), and response byte size delta.
  * **Four Comparison Tabs**: Response Body, Request Body, Header Delta (Added/Removed/Changed), and Query/Path Parameters.
  * **Seamless Entry Points**: Compare toggle in history panel, history timeline comparisons, dropdown menu actions, and baseline swap.
* **Automated Backup Scheduler & Smart Merge Import**:
  * **Automated Periodic Backup Scheduler**: Manifest V3 `chrome.alarms` background scheduler with configurable frequencies (`Off`, `Every 30 minutes`, `Every 2 hours`, `Every 6 hours`, `Every 12 hours`, `Daily (24h)`, or `Custom minutes`).
  * **Smart Delta Detection ("Skip if unchanged")**: Queries storage envelope `updatedAt` timestamps across all keys before downloading; skips redundant backup operations if zero mutations occurred since the last backup.
  * **Universal Downloader & Descriptive Naming**: Standardized backup naming convention `openapi-companion-backup-YYYY-MM-DD-HHmm.json` using `chrome.downloads.download` in MV3 background service workers with DOM anchor fallback.
  * **Smart Deep Merge Mode (`mode: 'merge'`)**: Entity-level deep merging for request presets, workflows, custom headers, auto-extraction rules, and environments with conflict renaming.
  * **Pre-Import Safety Snapshot & 1-Click Rollback ("Undo Import")**: Automatically captures an atomic pre-import storage snapshot before modifying storage with an undo banner.
  * **Granular Selective Import Checklist**: Interactive category selection checklist allowing developers to selectively import only what they need.
* **Asynchronous Swagger UI Mounting Observer**:
  * **Fast Path Detection**: Instant 0ms synchronous boot if Swagger UI containers or meta tags are already present in the DOM on script execution (`isSwaggerPresent`).
  * **Dynamic Mounting Observer (`src/content/swagger-mount-observer.ts`)**: 3.5s non-blocking `MutationObserver` window monitoring `childList` and `subtree` mutations on `document.documentElement` for `#swagger-ui`, `.swagger-ui`, `.swagger-container`, etc.
  * **SPA Client-Side Route Navigation Watcher (`watchSpaNavigation`)**: Hooks browser History API (`history.pushState`, `history.replaceState`) and listens to `popstate` and `hashchange` events to detect dynamic client-side route transitions into Swagger API documentation paths without full page reloads.
  * **Idempotent Mutex Boot Guard (`bootAgent`)**: Guarantees atomic single-boot execution using internal state flags and DOM container dataset markings.
* **Customizable Keyboard Shortcut Manager**:
  * **In-Page Shadow DOM Modal (`#oac-shortcuts-host`)**: Spacious top-centered dialog rendered in the active Swagger page without CSS contamination, fully synchronized with `ThemeManager`.
  * **Custom Key Recorder**: Interactive live recorder capturing modifiers (<kbd>Ctrl</kbd>, <kbd>Alt</kbd>, <kbd>Shift</kbd>, <kbd>Meta/Cmd</kbd>) and keypresses with platform-aware formatting.
  * **Safety & Conflict Detection**: Protects reserved browser combinations and flags same-context key conflicts with an interactive resolution banner offering 1-click **Swap Bindings** or **Override**.
  * **Dynamic Content Script Reactivity**: Listens to `SHORTCUTS_CHANGED` bus events across tabs so remapped keys apply immediately without page reload.

## Changed
* **Repository Governance & Compliance**: Updated governance contacts, security links, CODEOWNERS, and license holder details.

---

# [1.1.3] - 2026-09-06

## Added
* **Project Variables Automation & Zero-Click Auto-Extraction**:
  * **Auto-Extraction Rules**: Define automatic variable extraction rules from HTTP responses for project environments with property path traversal (`token`, `data.id`).
  * **In-Page Swagger UI Integration**: Seamless "Save to Variable" dialog overlay directly in Swagger UI response blocks with null safety, error propagation, and local sidebar fallback.
  * **Variable Reference Tracking**: View live reference counts and badges across requests, headers, query params, auth configs, and extraction rules.
  * **Architecture & Specification Blueprint**: Added `/plans/` directory tracking system architecture and Phase C blueprints.

## Changed
* **Project Isolation & DRY Refactoring**: Maintained strict project isolation guarantee for environment variables while reusing core UI components (`EndpointPicker`, `MethodTag`, `extractJsonCandidates`).
* **Code Formatting**: Fully aligned formatting across all source modules with Prettier.

---

# [1.1.2] - 2026-09-02

## Added
* **Firefox Sidebar Enhancements**:
  * **Dedicated Firefox Shortcut**: Bound `_execute_sidebar_action` to `Ctrl+Alt+O` (`Command+Alt+O` on macOS) to avoid collisions with Firefox's built-in bookmark sidebar shortcut (`Ctrl+Shift+O`).
  * **Navigation Auto-Close**: Sidebar automatically closes when navigating away to a non-OpenAPI page via `tabs.onUpdated`.
  * **Context Menu Access**: Added right-click context menu option (`Open OpenAPI Companion`) on Firefox.

## Changed
* **Content Script In-Page Launcher**: Suppressed floating launcher button injection on Firefox where page-initiated sidebar opening is disallowed by browser security policies.
* **Extension Context Resiliency**: Wrapped content-to-background messaging in safe boundary checks and automatically disconnected DOM observers when the extension context is invalidated on reloads.
* **Build Diagnostics**: Downgraded benign build-hash mismatch notification in sidepanel from a console warning to an informational log.

---

# [1.1.1] - 2026-08-23

## Changed
* **Permission footprint**: Removed unused `scripting` and `downloads` permissions from manifest and privacy policy to comply with Chrome Web Store least-privilege review guidelines.

---

# [1.1.0] - 2026-08-18

## Added
* **Mock Payload & Dataset Studio**:
  * **Schema-Aware Payload Synthesizer**: Generates realistic, minimal, boundary/edge-case, and security fuzzing (SQLi/XSS/Unicode) payloads recursively from any OpenAPI schema or target endpoint.
  * **Bulk Mock Data & Database Seeder**: Generates 1–100 records in formatted JSON or dot-notated CSV with RFC-4180 escaping, complete with file download.
  * **Expanded 60+ Generator Catalog**: Personal, location, tech/internet, commerce, system/HTTP, and QA security vectors with international diversity pools.
  * **4-in-1 Studio Interface**: `⚡ Live Fill`, `🛠️ Mock Studio`, `📦 Bulk Seeder`, and `🎲 Library` with individual card sample regeneration.
* **Request Manager Enhancements**:
  * Formatted JSON body presets with quick copy.
  * Searchable endpoint dropdown selector with method filtering tags.

---

# [1.0.1] - 2026-08-16

## Fixed
* Fixed side panel tab persistence and connection lifecycle.

---

# [Unreleased]

---

## Changed

Nothing yet.

---

## Improved

Nothing yet.

---

## Fixed

Nothing yet.

---

## Removed

Nothing yet.

---

## Deprecated

Nothing yet.

---

## Security

Initial security model documented.

---

## Known Issues

None.

---

# [1.0.0] - Initial Release

Status:

🚧 Planned

---

## Added

### Authentication Manager

* Persistent Authorization
* JWT Support
* API Key Support
* Automatic Authorization Restore

---

### Request Manager

* Request Persistence
* Request Templates
* Request Recovery

---

### Environment Manager

* Environment Profiles
* Environment Variables
* One-click Switching

---

### API History

* Request History
* Response History
* Replay Requests

---

### Fake Data Generator

Support for:

* Name
* Email
* UUID
* Phone
* Address
* Boolean
* Integer
* Decimal
* Password

---

### Productivity

* Sidebar
* Search
* Keyboard Shortcuts
* Copy Utilities

---

### Settings

* Theme
* Import
* Export
* Storage Management

---

## Changed

Initial implementation.

---

## Improved

Swagger productivity.

---

## Fixed

N/A

---

## Removed

N/A

---

## Deprecated

N/A

---

## Security

* Local storage only
* Zero telemetry
* Project isolation
* Secure token handling

---

## Known Issues

* Swagger UI only
* Firefox not yet supported
* Workflow Runner deferred
* Collections deferred

---

# Changelog Entry Template

```text
# [Version] - YYYY-MM-DD

## Added

-

## Changed

-

## Improved

-

## Fixed

-

## Removed

-

## Deprecated

-

## Security

-

## Known Issues

-
```

---

# Documentation Changes

Documentation updates should also appear in the changelog.

Examples

```text
Added

- Storage Design document
- Security Guidelines
```

---

# Architecture Changes

Examples

```text
Changed

State management migrated to Zustand.
```

---

# Dependency Updates

Example

```text
Updated

React 19

Tailwind CSS

TypeScript
```

---

# Browser Support Changes

Example

```text
Added

Firefox support
```

---

# Feature Deprecation

When removing a feature:

```text
Deprecated

Legacy Request Cache

Reason:

Replaced by Smart Request History.
```

Deprecated features should remain documented until removed.

---

# Migration Notes

Breaking releases should include:

* Upgrade Steps
* Migration Instructions
* Configuration Changes
* Compatibility Notes

Example

```text
Migration

v1.x

↓

v2.x

Requires Storage Migration
```

---

# Hotfixes

Emergency releases should include:

```text
Hotfix

Critical Authentication Restore Fix

Issue

Token not restored after browser restart.

Resolution

Storage initialization corrected.
```

---

# Security Releases

Security releases should clearly describe:

* Severity
* Impact
* Resolution

Avoid exposing sensitive exploit details.

Example

```text
Security

Fixed token exposure in debug logging.
```

---

# Release Checklist

Every release should verify:

* Version updated
* Changelog updated
* Documentation updated
* Tests passing
* Security review completed
* Performance review completed
* Browser compatibility verified

---

# Release Notes Workflow

```text
Development

↓

Testing

↓

Documentation

↓

Update Changelog

↓

Create Release Notes

↓

Publish Release
```

---

# Contributor Guidelines

Every contributor adding a feature should update the changelog.

Changes should be recorded before the Pull Request is merged.

---

# Best Practices

Good changelog entries should:

* Be concise
* Focus on user impact
* Use clear language
* Group similar changes together
* Avoid implementation details

Example

✅ Good

```text
Added request history replay.
```

❌ Bad

```text
Modified RequestReplay.ts line 184.
```

---

# Future Releases

Planned releases

| Version | Goal                |
| ------- | ------------------- |
| 1.0.0   | MVP                 |
| 1.1.0   | Collections         |
| 1.2.0   | Workflow Runner     |
| 1.3.0   | Response Comparison |
| 1.4.0   | ReDoc Support       |
| 1.5.0   | Firefox Support     |
| 2.0.0   | Team Collaboration  |

This roadmap may evolve as development progresses.

---

# Changelog Success Criteria

A good changelog should allow users to quickly understand:

* What changed
* Why it changed
* Whether they need to take action
* Whether upgrading introduces breaking changes

---

# Changelog Summary

The changelog is the historical record of OpenAPI Companion.

It documents the evolution of the project from the initial MVP to future major releases, ensuring transparency for users and contributors alike.

Every release should answer one question:

> **"What's new, what changed, and what do I need to know before upgrading?"**

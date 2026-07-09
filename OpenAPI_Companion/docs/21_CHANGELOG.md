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

# [Unreleased]

## Added

* Documentation-first development process
* Product roadmap
* Technical architecture
* Storage architecture
* Security model
* Functional requirements
* Feature specifications
* User flows
* Edge case documentation
* **Fake Data Generator** (Sprint 11): 21 offline generators, name-and-value field-type detection, one-click *Generate test data* / *Regenerate all* / per-field regenerate into the open request body, preserving manual edits and leaving unsupported fields unchanged
* **Productivity Tools** (Sprint 12): ⌘K endpoint search with favorites & recently-used, one-click jump-to-endpoint, and copy-as-code (cURL / Fetch / Axios) — all offline and per-project
* **Settings & Import/Export** (Sprint 13): appearance/theme, storage-usage metrics, clear per-project or all data (with confirmation), and versioned JSON backup / restore with strict validation and a preview — completing the feature-complete MVP

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

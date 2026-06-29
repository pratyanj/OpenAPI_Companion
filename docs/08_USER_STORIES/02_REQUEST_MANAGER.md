# 08_USER_STORIES/02_REQUEST_MANAGER.md

# Request Manager — User Stories

## Feature Overview

The Request Manager is responsible for automatically saving, restoring, organizing, and managing API requests within OpenAPI documentation.

It eliminates one of the most frustrating parts of API development—losing request bodies, query parameters, headers, and path parameters whenever the documentation page refreshes.

Instead of manually rebuilding requests after every refresh, developers can continue exactly where they left off.

The Request Manager works entirely on the client side and requires no backend changes.

---

# Objectives

The Request Manager should:

* Automatically save request data.
* Restore requests after refresh.
* Support multiple saved templates.
* Preserve developer progress.
* Organize requests efficiently.
* Reduce repetitive typing.
* Support complex request bodies.
* Work across multiple projects.

---

# Problem Statement

A typical developer workflow today looks like this:

```text
Open Swagger

↓

Try It Out

↓

Fill Request Body

↓

Fill Query Parameters

↓

Fill Headers

↓

Execute

↓

Refresh Page

↓

Everything Lost

↓

Rebuild Entire Request
```

This repetitive process wastes time and increases the likelihood of testing errors.

The Request Manager ensures request data is preserved automatically.

---

# User Personas

Primary Users

* Backend Developers
* API Developers
* Full Stack Developers

Secondary Users

* QA Engineers
* Automation Engineers

---

# User Stories

---

## US-REQ-001

### Automatic Request Save

**As a backend developer, I want request data to be saved automatically while I type so that I never lose my progress.**

Priority

Critical

---

## US-REQ-002

### Automatic Request Restore

**As a backend developer, I want previously entered request data to be restored when I revisit an endpoint so that I can continue testing immediately.**

Priority

Critical

---

## US-REQ-003

### Save Request Body

**As a developer, I want my request body preserved after refreshing Swagger so that I don't have to rewrite JSON payloads.**

Priority

Critical

---

## US-REQ-004

### Save Query Parameters

**As a developer, I want query parameters restored automatically so that repeated testing is faster.**

Priority

Critical

---

## US-REQ-005

### Save Path Parameters

**As a developer, I want path parameters remembered so that I don't repeatedly enter resource IDs.**

Priority

High

---

## US-REQ-006

### Save Request Headers

**As a developer, I want custom headers restored automatically so that authenticated requests continue working correctly.**

Priority

High

---

## US-REQ-007

### Multiple Request Templates

**As a developer, I want multiple templates for the same endpoint so that I can quickly switch between different testing scenarios.**

Priority

High

---

## US-REQ-008

### Duplicate Template

**As a developer, I want to duplicate an existing request template so that I can modify it without starting from scratch.**

Priority

Medium

---

## US-REQ-009

### Rename Template

**As a developer, I want to rename saved request templates so that they remain easy to identify.**

Priority

Medium

---

## US-REQ-010

### Delete Template

**As a developer, I want to delete templates I no longer use so that my workspace stays organized.**

Priority

Medium

---

## US-REQ-011

### Favorite Templates

**As a developer, I want to mark important templates as favorites so that I can access them quickly.**

Priority

Low

---

## US-REQ-012

### Draft Recovery

**As a developer, I want unfinished request drafts restored automatically after an unexpected browser crash so that my work is not lost.**

Priority

High

---

# Acceptance Criteria

The Request Manager is considered complete when:

* Request bodies persist after refresh.
* Query parameters are restored.
* Path parameters are restored.
* Request headers are restored.
* Templates can be created.
* Templates can be renamed.
* Templates can be duplicated.
* Templates can be deleted.
* Drafts survive browser restart.
* Data remains isolated by project.

---

# Business Rules

* Requests belong to one endpoint.
* Templates belong to one project.
* Templates belong to one environment.
* Drafts are automatically saved.
* Manual save is optional.
* Templates never overwrite one another unless confirmed by the user.

---

# Functional Requirements

The Request Manager must:

* Detect request changes.
* Save modified requests.
* Restore previous requests.
* Manage templates.
* Handle large JSON payloads.
* Handle nested objects.
* Support arrays.
* Preserve formatting where possible.

---

# Request Components Supported

Version 1 should save:

* Request Body
* Query Parameters
* Path Parameters
* Headers
* Cookies (where accessible)
* Content Type
* Selected Examples

Future versions may include additional request metadata.

---

# Validation Rules

Before restoring a request:

* Endpoint must exist.
* HTTP method must match.
* Request schema should be compatible.
* Stored request must be valid.

If incompatible, restore compatible fields and notify the user when appropriate.

---

# Storage Requirements

Each request should store:

* Endpoint
* HTTP Method
* Request Body
* Headers
* Query Parameters
* Path Parameters
* Template Name
* Last Updated
* Project ID
* Environment ID

All data remains in local browser storage.

---

# Edge Cases

Examples include:

* Endpoint removed.
* Endpoint renamed.
* Request schema changed.
* Very large request payload.
* Nested JSON structures.
* Binary request bodies.
* Multiple browser tabs.
* Browser restart.
* Extension update.

Full handling is defined in `14_EDGE_CASES.md`.

---

# Failure Scenarios

If request restoration fails:

```text
Open Endpoint

↓

Restore Request

↓

Failure Detected

↓

Restore Compatible Data

↓

Notify User

↓

Allow Manual Editing
```

The extension should never prevent the user from editing the request manually.

---

# Security Requirements

The Request Manager must:

* Keep request data local.
* Never transmit stored requests externally.
* Sanitize imported templates.
* Protect sensitive request data.
* Avoid logging request contents in production.

---

# Dependencies

Depends on:

* Storage Manager
* Project Detection
* Environment Manager
* Authentication Manager

These services should initialize before request restoration.

---

# Out of Scope

Version 1 excludes:

* Cloud template synchronization
* Team template sharing
* AI request generation
* Automatic schema conversion
* Request version control

These features belong to future releases.

---

# Future Improvements

Potential enhancements include:

* Schema-aware request generation
* Request version history
* Template folders
* Import/Export individual templates
* Shared templates
* Template tagging
* AI-assisted payload generation

---

# Success Criteria

The Request Manager is successful when:

* Developers no longer lose request data after refreshing documentation.
* Complex request payloads are restored accurately.
* Frequently used requests are easily reusable.
* Request management feels automatic rather than manual.
* Developers spend more time testing APIs and less time rebuilding requests.

---

# Summary

The Request Manager transforms API testing from a repetitive manual process into a seamless workflow by automatically preserving and restoring request data.

Combined with the Authentication Manager, it eliminates two of the most common frustrations developers face while using OpenAPI documentation.

This feature supports the project's guiding principle:

> **Never make developers re-enter request data that the extension can safely remember.**


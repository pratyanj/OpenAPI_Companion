# FEATURE_DESIGN/02_REQUEST_MANAGER.md

# Request Manager — Feature Design Document (FDD)

## Document Information

| Field          | Value                                                                           |
| -------------- | ------------------------------------------------------------------------------- |
| Feature        | Request Manager                                                                 |
| Module ID      | FD-002                                                                          |
| Priority       | P0 (Critical)                                                                   |
| Status         | Approved                                                                        |
| Target Release | Version 1.0                                                                     |
| Dependencies   | Storage Manager, Authentication Manager, Project Detection, Environment Manager |

---

# Overview

The Request Manager automatically saves, restores, and manages API request data entered within supported OpenAPI documentation.

It prevents developers from losing request bodies, query parameters, headers, and path parameters after refreshing the page, reopening the browser, or switching between environments.

The Request Manager is designed to make API testing feel continuous rather than session-based.

---

# Goals

* Automatically save request data.
* Automatically restore request data.
* Support request templates.
* Preserve developer progress.
* Reduce repetitive typing.
* Support complex JSON payloads.
* Keep request data isolated by project and environment.

---

# Non-Goals

Version 1 will **not** include:

* AI Request Generation
* Request Versioning
* Team Templates
* Cloud Synchronization
* Automatic Schema Migration

---

# Supported Request Components

Version 1 supports:

* Request Body
* Query Parameters
* Path Parameters
* Request Headers
* Content-Type
* Selected Examples

Future versions may include Cookies and multipart file uploads.

---

# High-Level Architecture

```text
Swagger UI

↓

User Edits Request

↓

Request Change Detector

↓

Validation

↓

Request Manager

↓

Storage Manager

↓

chrome.storage.local
```

---

# Restore Flow

```text
Open Endpoint

↓

Identify Project

↓

Identify Endpoint

↓

Load Saved Request

↓

Validate

↓

Populate Swagger Fields

↓

Ready for Testing
```

---

# Functional Requirements

| ID         | Requirement               |
| ---------- | ------------------------- |
| FR-REQ-001 | Detect request changes    |
| FR-REQ-002 | Auto-save requests        |
| FR-REQ-003 | Restore saved requests    |
| FR-REQ-004 | Support request templates |
| FR-REQ-005 | Duplicate templates       |
| FR-REQ-006 | Rename templates          |
| FR-REQ-007 | Delete templates          |
| FR-REQ-008 | Project isolation         |
| FR-REQ-009 | Environment isolation     |

---

# Component Responsibilities

## Request Detector

Responsible for:

* Detecting field changes
* Tracking edits
* Monitoring request updates

---

## Request Service

Responsible for:

* Saving requests
* Restoring requests
* Template management
* Validation

---

## Template Manager

Responsible for:

* Create template
* Rename template
* Duplicate template
* Delete template

---

## Storage Service

Responsible for:

* Read requests
* Write requests
* Storage migration
* Cleanup

---

## UI Layer

Responsible for:

* Save status
* Restore notification
* Template selector
* Template actions

---

# Storage Model

```text
Project

↓

Environment

↓

Endpoint

↓

Request

├── Body
├── Headers
├── Query
├── Path
├── Templates
└── Updated At
```

---

# Business Rules

* Requests belong to one endpoint.
* Requests belong to one project.
* Requests belong to one environment.
* Drafts auto-save while editing.
* Templates never overwrite each other automatically.
* Restoring a request must never execute it automatically.

---

# Validation Rules

Before restoring:

* Endpoint exists.
* HTTP method matches.
* Request schema is compatible.
* Stored request is valid.
* Environment matches.

Invalid fields should be ignored rather than causing the entire restore process to fail.

---

# Error Handling

| Scenario            | Expected Behavior                    |
| ------------------- | ------------------------------------ |
| Invalid JSON        | Preserve raw content and notify user |
| Endpoint Removed    | Mark request as unavailable          |
| Schema Changed      | Restore compatible fields            |
| Storage Failure     | Retry and notify user                |
| Missing Environment | Use active environment               |

---

# Edge Cases

* Large JSON payloads.
* Deeply nested objects.
* Arrays with many items.
* Empty request body.
* Binary request payloads.
* Browser refresh.
* Browser restart.
* Multiple tabs editing the same endpoint.

---

# Security Requirements

* Store requests locally only.
* Never transmit request data externally.
* Do not log request payloads in production.
* Sanitize imported templates.
* Maintain strict project isolation.

---

# Performance Requirements

* Auto-save should occur within **300 ms** of user inactivity.
* Restore should complete in under **150 ms**.
* Large payloads should not freeze the UI.
* Storage writes should be batched where possible.

---

# Dependencies

Required modules:

* Storage Manager
* Authentication Manager
* Environment Manager
* Project Detection
* Event Bus

---

# Testing Checklist

### Unit Tests

* Save request.
* Restore request.
* Delete template.
* Duplicate template.
* Rename template.
* Validation.

### Integration Tests

* Browser refresh.
* Browser restart.
* Environment switching.
* Project switching.
* Schema updates.

### Manual QA

* JSON payloads.
* Query parameters.
* Path parameters.
* Headers.
* Large payloads.
* Nested objects.

---

# Risks

| Risk                      | Mitigation                              |
| ------------------------- | --------------------------------------- |
| Schema changes            | Restore compatible fields only          |
| Large payload performance | Lazy serialization                      |
| Storage limit             | Compression & cleanup                   |
| Concurrent tab editing    | Last-write-wins with conflict detection |

---

# Success Metrics

* Request data survives every page refresh.
* Request restoration succeeds in over 99% of supported scenarios.
* No request leakage between projects.
* Developers rarely need to rebuild request payloads.
* Auto-save feels invisible to the user.

---

# Future Enhancements

* Schema-aware request migration.
* Template folders.
* Template tagging.
* Import/Export templates.
* AI-generated request payloads.
* Shared templates (Pro).

---

# Definition of Done

The Request Manager is complete when:

* Request persistence works reliably.
* Templates function correctly.
* Acceptance criteria pass.
* Edge cases are handled.
* Performance targets are met.
* Documentation is updated.
* Unit and integration tests pass.

---

# Summary

The Request Manager ensures developers never lose valuable request data while testing APIs.

By automatically preserving request bodies, parameters, headers, and templates, it removes one of the most repetitive aspects of backend development and allows developers to continue testing exactly where they left off.

> **Requests should persist until the developer decides to change them—not disappear after every page refresh.**

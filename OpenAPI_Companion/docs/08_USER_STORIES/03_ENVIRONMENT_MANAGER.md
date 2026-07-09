# 08_USER_STORIES/03_ENVIRONMENT_MANAGER.md

# Environment Manager — User Stories

## Feature Overview

The Environment Manager allows developers to create, organize, and switch between multiple API environments without manually changing URLs, authentication, or request values.

Instead of editing requests every time they move between Local, Development, QA, Staging, and Production, developers can switch environments with a single click.

Each environment maintains its own configuration while sharing the same OpenAPI documentation.

The Environment Manager is designed to eliminate repetitive configuration changes and reduce testing mistakes.

---

# Objectives

The Environment Manager should:

* Support multiple environments.
* Separate authentication by environment.
* Separate variables by environment.
* Allow one-click switching.
* Eliminate manual URL changes.
* Prevent accidental testing against the wrong environment.
* Work automatically without backend modifications.

---

# Problem Statement

A common developer workflow today:

```text
Open Swagger

↓

Test Local API

↓

Need QA Testing

↓

Change Base URL

↓

Replace Variables

↓

Login Again

↓

Update Headers

↓

Continue Testing

↓

Need Production

↓

Repeat Everything
```

This repetitive workflow wastes time and increases the risk of testing against the wrong server.

The Environment Manager automates this process.

---

# User Personas

Primary Users

* Backend Developers
* Full Stack Developers
* API Developers

Secondary Users

* QA Engineers
* DevOps Engineers
* Automation Engineers

---

# User Stories

---

## US-ENV-001

### Create Environment

**As a developer, I want to create multiple environments so that I can test different deployments without manually changing configuration.**

Priority

Critical

---

## US-ENV-002

### Edit Environment

**As a developer, I want to edit an environment so that configuration changes can be updated without creating a new profile.**

Priority

High

---

## US-ENV-003

### Delete Environment

**As a developer, I want to remove unused environments so that my workspace remains organized.**

Priority

Medium

---

## US-ENV-004

### One-Click Environment Switching

**As a developer, I want to switch environments with one click so that I can move between Local, QA, Staging, and Production quickly.**

Priority

Critical

---

## US-ENV-005

### Environment Variables

**As a developer, I want reusable variables inside each environment so that I don't manually replace IDs, URLs, or other values.**

Priority

Critical

---

## US-ENV-006

### Environment Authentication

**As a developer, I want each environment to maintain separate authentication so that switching environments automatically restores the correct credentials.**

Priority

Critical

---

## US-ENV-007

### Active Environment Indicator

**As a developer, I want to clearly see which environment is currently active so that I avoid sending requests to the wrong server.**

Priority

High

---

## US-ENV-008

### Duplicate Environment

**As a developer, I want to duplicate an existing environment so that I can quickly create similar configurations.**

Priority

Medium

---

## US-ENV-009

### Default Environment

**As a developer, I want to choose a default environment so that the extension automatically opens with my preferred configuration.**

Priority

Medium

---

## US-ENV-010

### Import & Export Environments

**As a developer, I want to export and import environments so that I can move my setup between computers.**

Priority

Low

---

# Acceptance Criteria

The Environment Manager is complete when:

* Multiple environments can be created.
* Environment switching is instant.
* Variables update correctly.
* Authentication changes automatically.
* Active environment is clearly visible.
* Environments remain isolated.
* Environment data persists across browser restarts.

---

# Business Rules

* Every environment belongs to one project.
* Environment names must be unique within a project.
* Authentication belongs to its environment.
* Variables belong to their environment.
* Only one environment may be active at a time.
* Switching environments must not modify saved request templates.

---

# Functional Requirements

The Environment Manager must:

* Create environments.
* Edit environments.
* Delete environments.
* Duplicate environments.
* Switch environments.
* Store variables.
* Restore environment state.
* Integrate with Authentication Manager.
* Integrate with Request Manager.

---

# Supported Environment Types

Recommended defaults:

* Local
* Development
* QA
* Staging
* UAT
* Production
* Custom

Users may create unlimited custom environments.

---

# Variable Support

Supported variable examples:

```text
{{BASE_URL}}

{{USER_ID}}

{{TOKEN}}

{{CLIENT_ID}}

{{API_VERSION}}
```

Variables should be substituted automatically when requests are executed.

---

# Validation Rules

Before switching environments:

* Environment must exist.
* Configuration must be valid.
* Required variables must be available.
* Authentication (if present) should be restored.

Missing variables should generate warnings rather than blocking the user.

---

# Storage Requirements

Each environment should store:

* Environment Name
* Base URL
* Variables
* Authentication Reference
* Description
* Created Date
* Updated Date
* Last Used Date
* Project ID

All information remains in local browser storage.

---

# Edge Cases

Examples include:

* Duplicate environment names.
* Missing variables.
* Deleted environment.
* Invalid Base URL.
* Authentication missing.
* Multiple browser tabs.
* Browser restart.
* Extension update.

Complete handling is defined in `14_EDGE_CASES.md`.

---

# Failure Scenarios

If switching environments fails:

```text
Select Environment

↓

Load Configuration

↓

Validation Failed

↓

Keep Current Environment

↓

Display Error

↓

Allow User to Correct Configuration
```

The extension should never switch to a partially configured environment.

---

# Security Requirements

The Environment Manager must:

* Store all environment data locally.
* Never expose sensitive variables.
* Never share environments across projects automatically.
* Keep authentication isolated.
* Protect imported environment files from malicious content.

---

# Dependencies

Depends on:

* Project Detection
* Storage Manager
* Authentication Manager
* Request Manager
* Event System

Environment changes should notify dependent modules automatically.

---

# Out of Scope

Version 1 excludes:

* Cloud environment synchronization.
* Shared team environments.
* Environment permissions.
* Automatic environment detection.
* Organization-managed configurations.

These belong to future releases.

---

# Future Improvements

Potential enhancements include:

* Environment groups.
* Secret variable masking.
* Variable inheritance.
* Team environments.
* Cloud synchronization.
* Environment health checks.
* Automatic server availability detection.

---

# Success Criteria

The Environment Manager is successful when:

* Developers can switch environments in one click.
* Authentication changes automatically.
* Variables update correctly.
* No manual URL editing is required.
* Developers avoid testing against the wrong environment.

---

# Summary

The Environment Manager eliminates one of the most repetitive and error-prone parts of API development by allowing developers to manage multiple environments effortlessly.

When combined with the Authentication Manager and Request Manager, it creates a seamless testing experience across Local, QA, Staging, and Production environments.

This feature supports the project's core philosophy:

> **Never make developers manually reconfigure environments when the extension can switch them automatically.**

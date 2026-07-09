# FEATURE_DESIGN/03_ENVIRONMENT_MANAGER.md

# Environment Manager — Feature Design Document (FDD)

## Document Information

| Field          | Value                                                                       |
| -------------- | --------------------------------------------------------------------------- |
| Feature        | Environment Manager                                                         |
| Module ID      | FD-003                                                                      |
| Priority       | P0 (Critical)                                                               |
| Status         | Approved                                                                    |
| Target Release | Version 1.0                                                                 |
| Dependencies   | Storage Manager, Authentication Manager, Request Manager, Project Detection |

---

# Overview

The Environment Manager enables developers to create, manage, and switch between multiple API environments without manually changing URLs, authentication, variables, or request values.

It provides seamless transitions between Local, Development, QA, Staging, UAT, and Production environments while ensuring every environment remains isolated.

The feature significantly reduces testing mistakes caused by manual environment switching.

---

# Goals

* Support unlimited environments.
* One-click environment switching.
* Environment-specific authentication.
* Environment-specific variables.
* Environment-specific request restoration.
* Project isolation.
* Zero backend configuration.

---

# Non-Goals

Version 1 will **not** include:

* Cloud-synchronized environments
* Team environments
* Environment permissions
* Automatic environment discovery
* Secret vault integration

---

# Supported Environment Types

Built-in recommendations:

* Local
* Development
* QA
* UAT
* Staging
* Production

Users may create unlimited custom environments.

---

# High-Level Architecture

```text id="4jrx9a"
Project

↓

Environment Manager

↓

Environment

├── Base URL
├── Variables
├── Authentication
├── Requests
└── Metadata
```

---

# Environment Switching Flow

```text id="z6d2xh"
Select Environment

↓

Validate Configuration

↓

Load Variables

↓

Restore Authentication

↓

Restore Requests

↓

Update Active Environment

↓

Ready for Testing
```

---

# Functional Requirements

| ID         | Requirement                      |
| ---------- | -------------------------------- |
| FR-ENV-001 | Create environment               |
| FR-ENV-002 | Edit environment                 |
| FR-ENV-003 | Delete environment               |
| FR-ENV-004 | Duplicate environment            |
| FR-ENV-005 | Switch environment               |
| FR-ENV-006 | Store variables                  |
| FR-ENV-007 | Restore authentication           |
| FR-ENV-008 | Restore request data             |
| FR-ENV-009 | Remember last active environment |

---

# Component Responsibilities

## Environment Service

Responsible for:

* Create
* Update
* Delete
* Duplicate
* Switch

---

## Variable Manager

Responsible for:

* Variable storage
* Variable validation
* Variable replacement

---

## Environment Switcher

Responsible for:

* Active environment
* Event notifications
* Module synchronization

---

## Storage Service

Responsible for:

* Persist environments
* Read environments
* Storage migration

---

## UI Layer

Responsible for:

* Environment selector
* Environment editor
* Active indicator
* Validation messages

---

# Storage Model

```text id="vlg6i5"
Project

↓

Environment

├── Name
├── Base URL
├── Variables
├── Authentication
├── Preferences
└── Updated At
```

---

# Business Rules

* Environment names must be unique within a project.
* One active environment per project.
* Authentication belongs to one environment.
* Variables belong to one environment.
* Request templates remain independent of environment switching.
* Switching environments never executes requests automatically.

---

# Variable System

Supported syntax:

```text id="0twjlwm"
{{BASE_URL}}

{{TOKEN}}

{{USER_ID}}

{{CLIENT_ID}}

{{API_VERSION}}
```

Future versions may support nested variables and computed variables.

---

# Validation Rules

Before activating an environment:

* Environment exists.
* Name is unique.
* Base URL is valid.
* Variables are valid.
* Authentication (if configured) is available.

Invalid environments should never become active.

---

# Error Handling

| Scenario            | Expected Behavior        |
| ------------------- | ------------------------ |
| Missing Base URL    | Display validation error |
| Duplicate Name      | Reject save              |
| Missing Variable    | Highlight variable       |
| Invalid URL         | Prevent activation       |
| Deleted Environment | Switch to default        |

---

# Edge Cases

* Duplicate environment names.
* Empty variable values.
* Missing authentication.
* Corrupted environment.
* Browser restart.
* Multiple browser tabs.
* Environment deleted while active.
* Project renamed.

---

# Security Requirements

* Store environments locally.
* Never transmit variables externally.
* Mask sensitive values in UI.
* Maintain project isolation.
* Validate imported environments.

---

# Performance Requirements

* Environment switching should complete in under **200 ms**.
* Variable substitution should be instantaneous.
* No unnecessary storage writes.
* Switching should not require page refresh.

---

# Dependencies

Required modules:

* Storage Manager
* Authentication Manager
* Request Manager
* Project Detection
* Event Bus

---

# Testing Checklist

### Unit Tests

* Create environment.
* Edit environment.
* Delete environment.
* Duplicate environment.
* Switch environment.
* Variable validation.

### Integration Tests

* Authentication switching.
* Request restoration.
* Browser restart.
* Multiple projects.

### Manual QA

* Local → QA.
* QA → Production.
* Duplicate names.
* Missing variables.
* Invalid Base URLs.

---

# Risks

| Risk                       | Mitigation                   |
| -------------------------- | ---------------------------- |
| Wrong environment selected | Active environment indicator |
| Invalid variables          | Validation before activation |
| Broken authentication      | Restore independently        |
| Configuration corruption   | Automatic recovery           |

---

# Success Metrics

* Environment switching completes in one click.
* Zero manual Base URL changes.
* Zero authentication leakage between environments.
* Developers switch environments without losing work.
* Environment restoration succeeds after browser restart.

---

# Future Enhancements

* Variable inheritance.
* Secret management.
* Team environments.
* Cloud synchronization.
* Environment health monitoring.
* Automatic server detection.
* Environment templates.

---

# Definition of Done

The Environment Manager is complete when:

* Environment switching is reliable.
* Variables function correctly.
* Authentication integrates successfully.
* Request restoration works.
* Performance targets are achieved.
* Documentation is complete.
* All tests pass.

---

# Summary

The Environment Manager eliminates one of the most repetitive and error-prone aspects of API development by allowing developers to move effortlessly between multiple deployment environments.

Combined with the Authentication Manager and Request Manager, it creates a seamless multi-environment testing experience while preserving the project's Local First philosophy.

> **Developers should switch environments with one click—not by manually editing URLs, tokens, and request values every time.**

# 09_USER_FLOWS.md

# User Flows

## Overview

This document defines the complete user interaction flows for OpenAPI Companion.

A user flow describes the sequence of actions a user performs to accomplish a specific goal while interacting with the extension.

These flows serve as the foundation for UI design, feature implementation, testing, and acceptance criteria.

Every workflow should minimize clicks, reduce repetitive work, and preserve the developer's existing workflow.

---

# Design Principles

Every user flow must follow these principles:

* Require the minimum number of user interactions.
* Never interrupt the developer's workflow.
* Preserve user progress automatically.
* Provide immediate feedback after actions.
* Support recovery from unexpected situations.
* Avoid unnecessary dialogs and confirmations.

---

# User Flow Index

| Flow ID | Flow Name                       | Priority |
| ------- | ------------------------------- | -------- |
| UF-001  | First-Time Installation         | Critical |
| UF-002  | Extension Initialization        | Critical |
| UF-003  | Automatic Project Detection     | Critical |
| UF-004  | Authentication Persistence      | Critical |
| UF-005  | Automatic Authorization Restore | Critical |
| UF-006  | Save Request                    | Critical |
| UF-007  | Restore Request                 | Critical |
| UF-008  | Create Environment              | High     |
| UF-009  | Switch Environment              | High     |
| UF-010  | Generate Fake Data              | High     |
| UF-011  | API Request History             | High     |
| UF-012  | Replay Previous Request         | High     |
| UF-013  | Create Collection               | Medium   |
| UF-014  | Execute Workflow                | Medium   |
| UF-015  | Open Extension Settings         | Medium   |
| UF-016  | Import Data                     | Medium   |
| UF-017  | Export Data                     | Medium   |

---

# UF-001 — First-Time Installation

## Goal

Allow the user to install the extension and begin using it immediately.

## Trigger

User installs OpenAPI Companion.

## Flow

```text
Install Extension

↓

Browser Registers Extension

↓

Default Settings Created

↓

Local Storage Initialized

↓

Installation Complete

↓

Wait for Supported Website
```

## Expected Result

The extension is ready without requiring additional configuration.

---

# UF-002 — Extension Initialization

## Goal

Initialize OpenAPI Companion when a supported documentation page loads.

## Trigger

User opens a supported OpenAPI documentation page.

## Flow

```text
User Opens Swagger

↓

Extension Detects Supported UI

↓

Load Project

↓

Load Settings

↓

Load Saved Data

↓

Inject Companion UI

↓

Ready
```

## Expected Result

The extension becomes available without affecting page performance.

---

# UF-003 — Automatic Project Detection

## Goal

Automatically identify the current API project.

## Trigger

Supported documentation page detected.

## Flow

```text
Page Loaded

↓

Read Current URL

↓

Generate Project Identifier

↓

Check Existing Project

↓

Existing?
   │
   ├── Yes → Load Project Data
   │
   └── No → Create Project
```

## Expected Result

Every API project maintains independent data.

---

# UF-004 — Authentication Persistence

## Goal

Automatically save user authorization.

## Trigger

User clicks Swagger Authorize.

## Flow

```text
Authorize

↓

User Enters Token

↓

Swagger Accepts Token

↓

Extension Detects Change

↓

Save Token

↓

Display Success Indicator
```

## Expected Result

Authentication is stored locally.

---

# UF-005 — Automatic Authorization Restore

## Goal

Restore saved authorization after refresh.

## Trigger

Documentation page reloads.

## Flow

```text
Page Refresh

↓

Extension Initializes

↓

Find Saved Token

↓

Token Exists?

│

├── No

│     ↓

│   Continue Normally

│

└── Yes

      ↓

Inject Authorization

↓

Swagger Updated

↓

Ready
```

## Expected Result

Developer continues working without manually authorizing again.

---

# UF-006 — Save Request

## Goal

Automatically preserve request data.

## Trigger

User edits request fields.

## Flow

```text
Edit Request

↓

Detect Changes

↓

Auto Save

↓

Update Local Storage

↓

Ready
```

## Expected Result

Request data survives refreshes.

---

# UF-007 — Restore Request

## Goal

Restore previous request automatically.

## Trigger

User revisits an endpoint.

## Flow

```text
Endpoint Selected

↓

Find Saved Request

↓

Found?

│

├── No

│

└── Yes

      ↓

Restore

↓

Populate Fields

↓

Ready
```

## Expected Result

The endpoint is restored to its previous state.

---

# UF-008 — Create Environment

## Goal

Create a reusable API environment.

## Flow

```text
Open Environment Manager

↓

Create Environment

↓

Enter Name

↓

Enter Base URL

↓

Configure Variables

↓

Save
```

## Expected Result

New environment becomes available.

---

# UF-009 — Switch Environment

## Goal

Move between environments.

## Flow

```text
Select Environment

↓

Load Variables

↓

Load Authentication

↓

Update Active Environment

↓

Refresh Companion State
```

## Expected Result

Requests now use the selected environment.

---

# UF-010 — Generate Fake Data

## Goal

Fill request fields with realistic sample values.

## Flow

```text
Select Input

↓

Click Generate

↓

Determine Data Type

↓

Generate Value

↓

Insert Value
```

## Expected Result

The request field is populated instantly.

---

# UF-011 — API Request History

## Goal

Automatically maintain request history.

## Flow

```text
Execute Request

↓

Capture Metadata

↓

Store History

↓

Update History Panel
```

## Expected Result

Request appears in history immediately.

---

# UF-012 — Replay Previous Request

## Goal

Reuse an earlier request.

## Flow

```text
Open History

↓

Select Request

↓

Replay

↓

Restore Request

↓

Execute (Optional)
```

## Expected Result

Previous request is recreated instantly.

---

# UF-013 — Create Collection

## Goal

Organize related requests.

## Flow

```text
Create Collection

↓

Name Collection

↓

Select Requests

↓

Save
```

---

# UF-014 — Execute Workflow

## Goal

Execute multiple requests automatically.

## Flow

```text
Select Workflow

↓

Run

↓

Execute Request 1

↓

Success?

↓

Execute Request 2

↓

Repeat

↓

Workflow Finished
```

If a request fails:

```text
Failure

↓

Stop Workflow

↓

Display Error

↓

Show Failed Step
```

---

# UF-015 — Open Extension Settings

## Goal

Configure extension behavior.

## Flow

```text
Open Companion

↓

Settings

↓

Select Category

↓

Modify Settings

↓

Save Automatically
```

---

# UF-016 — Import Data

## Goal

Restore exported configuration.

## Flow

```text
Import

↓

Choose File

↓

Validate

↓

Preview

↓

Import

↓

Complete
```

---

# UF-017 — Export Data

## Goal

Backup user configuration.

## Flow

```text
Export

↓

Choose Modules

↓

Generate File

↓

Download
```

---

# Global User Flow Principles

Every user flow should satisfy the following:

* Maximum automation with minimum clicks.
* No backend configuration.
* Local-first storage.
* Automatic recovery whenever possible.
* Clear user feedback.
* Predictable behavior.

---

# Error Handling

Every flow should define behavior for:

* Network failures
* Invalid data
* Missing storage
* Corrupted settings
* Unsupported documentation pages
* Permission issues
* Browser restart
* Extension update

Each error should have a defined recovery path.

---

# Success Criteria

A user flow is considered successful when:

* The task is completed with minimal interaction.
* The user never loses work unexpectedly.
* The workflow feels natural inside existing OpenAPI documentation.
* The extension remains invisible until needed.
* Developers can remain focused on API development instead of repetitive setup tasks.

---

# User Flow Summary

These workflows define the expected interaction model for OpenAPI Companion.

Every future feature, UI screen, and engineering implementation must align with these documented user flows to ensure a consistent, intuitive, and productivity-focused developer experience.

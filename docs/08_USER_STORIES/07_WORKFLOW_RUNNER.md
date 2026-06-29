# 08_USER_STORIES/07_WORKFLOW_RUNNER.md

# Workflow Runner — User Stories

## Feature Overview

The Workflow Runner enables developers to automate repetitive API testing by executing multiple API requests in a predefined sequence.

Instead of manually executing Login → Create User → Get User → Update User → Delete User every time, developers can save the sequence once and execute it with a single click.

The Workflow Runner is designed for repetitive development, regression testing, smoke testing, and QA verification while remaining lightweight and fully integrated into existing OpenAPI documentation.

---

# Objectives

The Workflow Runner should:

* Execute multiple API requests sequentially.
* Reduce repetitive testing.
* Support reusable workflows.
* Allow one-click execution.
* Stop execution on failure (configurable).
* Integrate with Request Manager and History.
* Require zero backend configuration.

---

# Problem Statement

Developers frequently repeat the same sequence of API calls.

```text id="2l2o9q"
Login

↓

Create User

↓

Assign Role

↓

Verify User

↓

Update User

↓

Delete User

↓

Repeat Tomorrow
```

Executing these manually every day is repetitive and error-prone.

The Workflow Runner automates this process.

---

# User Personas

Primary Users

* Backend Developers
* QA Engineers
* Automation Engineers

Secondary Users

* Technical Leads
* DevOps Engineers

---

# User Stories

---

## US-WF-001

### Create Workflow

**As a developer, I want to create reusable API workflows so that I don't repeat the same testing sequence every day.**

Priority

High

---

## US-WF-002

### Execute Workflow

**As a developer, I want to execute an entire workflow with one click so that repetitive testing becomes effortless.**

Priority

Critical

---

## US-WF-003

### Reorder Workflow Steps

**As a developer, I want to reorder requests inside a workflow so that I can match my desired execution order.**

Priority

Medium

---

## US-WF-004

### Rename Workflow

**As a developer, I want to rename workflows so that they remain easy to identify.**

Priority

Medium

---

## US-WF-005

### Duplicate Workflow

**As a developer, I want to duplicate an existing workflow so that I can create variations quickly.**

Priority

Low

---

## US-WF-006

### Delete Workflow

**As a developer, I want to delete workflows I no longer use so that my workspace remains organized.**

Priority

Medium

---

## US-WF-007

### Stop on Failure

**As a developer, I want workflow execution to stop when an API request fails so that I can investigate the problem immediately.**

Priority

Critical

---

## US-WF-008

### Continue on Failure

**As a developer, I want the option to continue workflow execution even if one request fails so that I can test independent APIs.**

Priority

Medium

---

## US-WF-009

### Workflow Execution Log

**As a developer, I want to see which workflow steps succeeded or failed so that debugging becomes easier.**

Priority

High

---

## US-WF-010

### Persistent Workflows

**As a developer, I want workflows saved permanently so that I don't recreate them every time I use Swagger.**

Priority

High

---

# Acceptance Criteria

The Workflow Runner is complete when:

* Workflows can be created.
* Requests can be added.
* Execution order is preserved.
* Workflows execute sequentially.
* Execution results are displayed.
* Failed steps are highlighted.
* Workflows remain available after browser restart.

---

# Business Rules

* A workflow belongs to one project.
* Requests execute sequentially.
* Only one workflow may execute at a time.
* Users may cancel execution.
* Workflow execution should never modify saved request templates.

---

# Functional Requirements

The Workflow Runner must:

* Create workflows.
* Edit workflows.
* Delete workflows.
* Duplicate workflows.
* Execute workflows.
* Display execution status.
* Record execution history.
* Allow cancellation.

---

# Workflow Structure

Each workflow contains:

* Workflow Name
* Description
* Ordered Request List
* Execution Mode
* Created Date
* Updated Date
* Project ID

---

# Execution Modes

Version 1 should support:

* Stop on First Failure
* Continue on Failure

Future versions may support:

* Conditional Execution
* Parallel Execution
* Scheduled Execution

---

# Validation Rules

Before execution:

* Workflow must contain at least one request.
* Every request must exist.
* Active environment must be available.
* Authentication should be valid.

Validation failures should prevent execution.

---

# Storage Requirements

Each workflow stores:

* Workflow ID
* Name
* Description
* Request References
* Execution Settings
* Project ID
* Created Date
* Updated Date

All workflow data remains local.

---

# Edge Cases

Examples include:

* Deleted request.
* Invalid authentication.
* Missing environment.
* Network failure.
* Workflow cancellation.
* Browser refresh during execution.
* Duplicate requests.
* Large workflows.

Complete handling is defined in `14_EDGE_CASES.md`.

---

# Failure Scenarios

If execution fails:

```text id="a8d2rm"
Execute Workflow

↓

Step Failed

↓

Stop (or Continue)

↓

Display Failure

↓

Show Execution Log

↓

Allow Retry
```

Failures should be isolated to the current workflow execution.

---

# Security Requirements

The Workflow Runner must:

* Never expose authentication.
* Execute only user-approved requests.
* Store workflow definitions locally.
* Never execute workflows automatically without user action.
* Respect project isolation.

---

# Dependencies

Depends on:

* Request Manager
* Authentication Manager
* Environment Manager
* API History
* Storage Manager
* Event System

---

# Out of Scope

Version 1 excludes:

* Scheduled execution.
* Conditional branching.
* Variables between requests.
* Team workflows.
* Cloud synchronization.
* CI/CD integration.

These belong to future releases.

---

# Future Improvements

Potential enhancements include:

* Variables shared between requests.
* Conditional logic.
* Loop support.
* Parallel execution.
* Workflow templates.
* Team workflows.
* Scheduled workflows.
* CI/CD integration.

---

# Success Criteria

The Workflow Runner is successful when:

* Developers can automate repetitive API testing.
* Common testing sequences require only one click.
* Workflow execution is reliable.
* Debugging failed workflows is straightforward.
* Developers save significant time during regression testing.

---

# Summary

The Workflow Runner transforms repetitive API testing into reusable automation without requiring external tools or backend modifications.

It extends OpenAPI Companion beyond simple request management by enabling developers to execute entire testing scenarios from within their existing documentation.

This feature reinforces the project's core philosophy:

> **Never make developers manually repeat API testing sequences that the extension can automate safely.**

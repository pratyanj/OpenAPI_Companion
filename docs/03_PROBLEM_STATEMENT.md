# 03_PROBLEM_STATEMENT.md

# Problem Statement

## Overview

Modern backend frameworks provide excellent OpenAPI documentation that allows developers to explore and test APIs directly from the browser.

While these documentation interfaces are useful for understanding APIs, they are not designed to support the daily workflow of backend development.

As developers continuously modify, restart, and test their applications, they repeatedly perform the same manual tasks that interrupt productivity and slow development.

OpenAPI Companion exists to eliminate these repetitive workflow interruptions.

---

# Background

Backend developers spend a significant portion of their development time testing APIs.

A typical workflow includes:

* Writing backend code
* Restarting the development server
* Opening OpenAPI documentation
* Authenticating
* Testing endpoints
* Modifying request payloads
* Validating responses
* Repeating the process dozens of times every day

Although OpenAPI documentation simplifies API exploration, it does not preserve the developer's working session.

Every refresh often means starting over.

---

# Current Workflow

A common development cycle looks like this:

```text
Write API Code

↓

Save File

↓

Backend Reloads

↓

Refresh Swagger

↓

Authorization Lost

↓

Login Again

↓

Copy JWT Token

↓

Authorize Again

↓

Recreate Request Body

↓

Re-enter Parameters

↓

Test API

↓

Repeat
```

This cycle may occur hundreds of times during a single project.

---

# Core Problems

## Problem 1 — Authentication Is Lost

Every page refresh resets the authorization state.

Developers must repeatedly:

* Call the login endpoint
* Copy the access token
* Open the authorization dialog
* Paste the token
* Continue testing

This is one of the most common frustrations during backend development.

---

## Problem 2 — Request Data Is Lost

Swagger does not persist API requests.

Developers lose:

* Request body
* Query parameters
* Path parameters
* Headers
* Cookies

After a refresh, every request must be rebuilt manually.

---

## Problem 3 — No Session Persistence

OpenAPI documentation behaves like a temporary testing page.

It does not remember:

* Current environment
* Recently tested APIs
* Favorite endpoints
* Testing progress
* Previous responses

Every new session starts from scratch.

---

## Problem 4 — Repetitive Login Workflows

Many projects require authentication before any API can be tested.

Developers repeatedly perform:

1. Login request
2. Copy access token
3. Authorize documentation
4. Begin testing

This workflow adds no business value but consumes development time.

---

## Problem 5 — No Request History

Developers often need to repeat a request tested earlier.

Current documentation tools do not provide:

* Request history
* Recently tested endpoints
* Replay functionality
* Timeline of API testing

Developers must remember previous requests or recreate them manually.

---

## Problem 6 — Environment Switching

Developers commonly work with multiple environments.

Examples include:

* Local Development
* QA
* Staging
* Production

Switching between environments often requires:

* Updating URLs
* Changing tokens
* Reconfiguring requests
* Updating environment-specific values

This process is repetitive and error-prone.

---

## Problem 7 — Manual Test Data Creation

Creating realistic request payloads consumes unnecessary time.

Developers repeatedly generate:

* Names
* Email addresses
* Phone numbers
* UUIDs
* Addresses
* Dates
* Passwords

These values rarely matter for the feature being tested.

---

## Problem 8 — No Workflow Automation

Many backend tasks follow the same sequence.

Example:

```text
Login

↓

Create User

↓

Get User

↓

Update User

↓

Delete User
```

Developers execute these workflows manually every time.

---

## Problem 9 — Limited Productivity Features

Current OpenAPI documentation tools focus primarily on documentation.

Common productivity features are missing.

Examples include:

* Saved requests
* Request templates
* Favorites
* Keyboard shortcuts
* Collections
* Response comparison
* Session persistence
* Environment management

---

## Problem 10 — Interrupted Development Flow

The greatest problem is not any single missing feature.

The real problem is continuous interruption.

Instead of focusing on business logic, developers repeatedly interrupt themselves to restore testing state.

This constant context switching reduces productivity and increases frustration.

---

# Who Experiences These Problems

These issues affect developers across nearly every backend ecosystem.

Examples include:

* FastAPI developers
* Django REST Framework developers
* Flask developers
* NestJS developers
* Express developers
* Spring Boot developers
* ASP.NET developers
* Laravel developers
* Go developers

The problem is not framework-specific.

It is a limitation of how OpenAPI documentation tools currently function.

---

# Existing Alternatives

Developers often attempt to solve these problems using external tools.

Common alternatives include:

* Postman
* Insomnia
* Bruno
* Hoppscotch

While these tools are powerful, they introduce new challenges.

* APIs must often be imported separately.
* Documentation and testing become disconnected.
* Collections require maintenance.
* Changes in OpenAPI documentation may require synchronization.
* Developers switch between multiple applications.

Many backend developers prefer testing directly in OpenAPI documentation because it always reflects the latest API changes.

---

# Why Existing Solutions Are Not Enough

The goal is not to replace Swagger or existing API clients.

Instead, the goal is to improve the workflow developers already use.

Developers should not have to choose between:

* Accurate documentation
* Productive testing

OpenAPI Companion combines both.

---

# Root Cause

The underlying issue is that OpenAPI documentation tools were designed primarily for API documentation and exploration.

They were not designed to function as persistent developer workspaces.

As a result, important developer context is discarded whenever the page reloads.

---

# Opportunity

There is a significant opportunity to improve backend development by adding a productivity layer on top of existing OpenAPI documentation.

Rather than replacing documentation tools, OpenAPI Companion enhances them with persistent state, intelligent automation, and workflow management.

This approach preserves familiar developer workflows while removing repetitive manual work.

---

# Problem Statement

Backend developers repeatedly lose valuable testing context while working with OpenAPI documentation.

They must continuously recreate authentication, requests, environments, and testing workflows after refreshes, server restarts, and development changes.

These repetitive tasks interrupt development, reduce productivity, and add unnecessary friction to the software development lifecycle.

OpenAPI Companion addresses this problem by providing a persistent, client-side productivity layer that preserves developer context, automates repetitive tasks, and enhances existing OpenAPI documentation without requiring any backend modifications.

---

# Desired Outcome

After installing OpenAPI Companion, developers should no longer think about:

* Re-authorizing documentation
* Rebuilding request payloads
* Recreating test data
* Repeating login requests
* Remembering previously tested endpoints

Instead, they should remain focused on designing, building, and testing APIs with minimal interruption.

The extension should quietly manage repetitive tasks in the background, allowing developers to maintain their development flow.

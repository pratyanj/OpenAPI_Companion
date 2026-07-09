# 11_TECHNICAL_ARCHITECTURE.md

# Technical Architecture

## Overview

This document defines the technical architecture of OpenAPI Companion.

It describes the high-level system design, module interactions, browser extension architecture, storage strategy, communication flow, and development standards.

The objective is to create a scalable, maintainable, and modular browser extension capable of supporting future expansion without major architectural changes.

---

# Architecture Goals

The architecture must satisfy the following objectives.

* Modular
* Scalable
* Maintainable
* Testable
* Performant
* Secure
* Browser Native
* Framework Independent

---

# High-Level Architecture

```text
                    Browser
                        │
                        │
        ┌───────────────┴────────────────┐
        │                                │
        ▼                                ▼
 Background Service Worker        Content Script
        │                                │
        │                                │
        ▼                                ▼
 Storage Layer                OpenAPI Documentation
        │                                │
        └───────────────┬────────────────┘
                        │
                        ▼
                React Extension UI
                        │
                        ▼
               Feature Modules
```

---

# Technology Stack

## Extension

* Manifest V3

---

## Language

* TypeScript

---

## Frontend

* React

---

## Build Tool

* Vite

---

## Styling

* Tailwind CSS

---

## State Management

* Zustand

---

## Routing

Internal state-based navigation

(No React Router required)

---

## Storage

* chrome.storage.local

Future

* chrome.storage.sync

---

## Testing

* Vitest
* Playwright

---

# Extension Architecture

The extension consists of four primary layers.

---

## Layer 1

### Browser Layer

Responsible for:

* Browser lifecycle
* Extension lifecycle
* Permissions
* Tabs
* Storage
* Messaging

---

## Layer 2

### Core Layer

Responsible for:

* Project detection
* Authentication manager
* Storage manager
* Event manager
* Settings manager

This layer contains shared business logic.

---

## Layer 3

### Feature Layer

Contains independent modules.

Modules include:

* Authentication Manager
* Request Manager
* Environment Manager
* API History
* Fake Data Generator
* Collections
* Workflow Runner
* Response Inspector

Each module should remain isolated.

---

## Layer 4

### UI Layer

Responsible for:

* Sidebar
* Panels
* Dialogs
* Notifications
* Search
* Settings

The UI should never contain business logic.

---

# Folder Structure

```text
extension/

├── public/

├── src/

│   ├── assets/

│   ├── background/

│   ├── content/

│   ├── popup/

│   ├── sidebar/

│   ├── components/

│   ├── hooks/

│   ├── services/

│   ├── modules/

│   ├── stores/

│   ├── utils/

│   ├── constants/

│   ├── types/

│   ├── styles/

│   └── tests/

├── manifest.json

└── package.json
```

---

# Module Architecture

Each feature follows the same structure.

```text
modules/

authentication/

request/

environment/

history/

fake-data/

collections/

workflow/

response/

settings/
```

Each module contains:

```text
index.ts

service.ts

store.ts

types.ts

constants.ts

hooks.ts

utils.ts

components/
```

This ensures consistency throughout the project.

---

# Communication Flow

Modules should never communicate directly.

Instead:

```text
Feature A

↓

Event Bus

↓

Feature B
```

Advantages

* Loose coupling
* Easier testing
* Easier maintenance

---

# State Management

Global State

Used for:

* Current project
* Current environment
* Authentication
* Theme
* Settings

Module State

Each module manages its own internal state.

Avoid unnecessary global state.

---

# Data Flow

```text
User Action

↓

React Component

↓

Store

↓

Service

↓

Storage

↓

UI Update
```

Business logic must remain inside services.

---

# Storage Architecture

Every module owns its data.

Example

```text
Authentication

↓

Storage Service

↓

chrome.storage.local
```

Modules never access browser storage directly.

---

# Background Service Worker

Responsibilities

* Extension lifecycle
* Storage synchronization
* Browser events
* Messaging
* Future cloud synchronization

The service worker should remain lightweight.

---

# Content Script

Responsibilities

* Detect OpenAPI documentation
* Inject UI
* Observe page changes
* Read OpenAPI information
* Communicate with background worker

No business logic should exist here.

---

# UI Injection

The extension injects:

* Sidebar
* Floating Panels
* Toolbar Buttons
* Notifications

The original documentation must remain untouched.

---

# Event System

Recommended events:

```text
ProjectChanged

AuthenticationUpdated

RequestSaved

EnvironmentChanged

HistoryUpdated

WorkflowStarted

WorkflowFinished

SettingsUpdated
```

Every module subscribes only to relevant events.

---

# Dependency Rules

Allowed

```text
UI

↓

Service

↓

Storage
```

Not Allowed

```text
UI

↓

Storage
```

Business logic must always pass through services.

---

# Error Handling

Every module should implement:

* Try/Catch
* Structured logging
* User-friendly messages
* Recovery strategy

Errors should never crash the extension.

---

# Logging

Development

Verbose logging.

Production

Warnings and errors only.

Logging should be centralized.

---

# Browser Permissions

Expected permissions

```text
storage

activeTab

scripting
```

Optional Future

```text
downloads

clipboardWrite
```

Request only the permissions actually required.

---

# Performance Strategy

The extension should:

* Lazy load modules
* Cache frequently used data
* Minimize DOM operations
* Avoid unnecessary storage writes
* Debounce expensive operations

Performance is a core requirement.

---

# Security Principles

* Never execute arbitrary scripts.
* Never expose stored tokens.
* Never modify backend requests unexpectedly.
* Validate imported data.
* Sanitize all rendered content.

Security is discussed further in the Security document.

---

# Scalability

Future modules should integrate without changing existing architecture.

Adding a new module should require only:

* New module folder
* Registration
* Event subscriptions
* UI entry

No existing module should require modification.

---

# Testing Architecture

Each module should include:

* Unit Tests
* Integration Tests
* UI Tests

Testing should occur independently before end-to-end testing.

---

# Coding Standards

Every module should follow:

* Single Responsibility Principle
* Dependency Injection where appropriate
* Strict TypeScript
* No duplicated logic
* Reusable utilities
* Shared interfaces

---

# Future Architecture

Future components may include:

* VS Code Extension
* Firefox Support
* Plugin SDK
* Cloud Sync Service
* Enterprise Services

Current architecture should support these without major redesign.

---

# Technical Success Criteria

The architecture is considered successful when:

* Every feature remains modular.
* New modules can be added easily.
* Business logic is isolated.
* UI remains lightweight.
* Storage remains organized.
* The extension performs efficiently.
* Maintenance remains straightforward.

---

# Architecture Summary

OpenAPI Companion follows a modular, layered architecture designed for long-term maintainability and scalability.

Each module is independently responsible for its own functionality while communicating through well-defined interfaces and shared services.

This architecture ensures that the extension remains lightweight, extensible, and capable of evolving into a comprehensive productivity platform for the OpenAPI ecosystem without requiring significant architectural changes.

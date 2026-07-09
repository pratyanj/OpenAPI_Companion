# 00_PROJECT_OVERVIEW.md

# OpenAPI Companion

> **A browser extension that transforms Swagger and OpenAPI documentation into a persistent, productivity-focused API testing workspace.**

---

# Project Overview

OpenAPI Companion is a browser extension designed to improve the daily workflow of backend developers working with OpenAPI-based API documentation tools such as Swagger UI, ReDoc, Scalar, and RapiDoc.

While OpenAPI documentation tools are excellent for exploring and testing APIs, they are primarily designed as documentation interfaces rather than developer productivity tools. As a result, backend developers repeatedly perform the same manual tasks during development, including re-authenticating after page refreshes, recreating request payloads, switching environments, and rebuilding testing workflows.

OpenAPI Companion enhances these existing tools by adding persistent state, intelligent productivity features, and workflow management without requiring any modifications to backend applications or OpenAPI specifications.

The extension operates entirely on the client side and integrates seamlessly into developers' existing workflows.

---

# Vision

Become the **essential browser extension for every backend developer** using OpenAPI documentation.

Just as GitLens became an essential extension for Visual Studio Code, OpenAPI Companion aims to become the standard productivity extension for Swagger and OpenAPI users.

---

# Mission

Eliminate repetitive manual work performed during API development by transforming OpenAPI documentation into a persistent, intelligent API testing workspace.

---

# Product Philosophy

OpenAPI Companion enhances existing OpenAPI documentation tools without requiring any backend modifications, server plugins, or framework-specific integrations.

The extension respects existing developer workflows instead of replacing them.

Everything should work immediately after installation.

---

# Core Principles

## Zero Backend Changes

No middleware.

No packages.

No framework plugins.

No server configuration.

Install the extension and continue using existing API documentation exactly as before.

---

## Local First

All developer data remains on the user's computer.

No mandatory cloud account.

No required internet connection.

No telemetry by default.

Privacy comes first.

---

## Framework Independent

The extension is designed around the OpenAPI ecosystem rather than any single backend framework.

Supported platforms include, but are not limited to:

* FastAPI
* Django REST Framework
* Flask
* NestJS
* Express
* Spring Boot
* ASP.NET
* Laravel
* Go Fiber
* Gin
* Any OpenAPI-compliant implementation

---

## Enhance, Never Replace

OpenAPI Companion is not another API client.

It enhances existing documentation interfaces.

Developers continue using Swagger UI or other supported OpenAPI tools while gaining powerful productivity features.

---

## Productivity Focused

Every feature must solve a real-world developer pain point.

Features should remove repetitive work rather than introduce unnecessary complexity.

---

# Supported Platforms

## Browsers

Current Support

* Google Chrome
* Microsoft Edge
* Brave
* Arc
* Opera

Future Support

* Mozilla Firefox

---

## Supported Documentation Tools

Initial Target

* Swagger UI

Future Support

* ReDoc
* Scalar
* RapiDoc
* Other OpenAPI-compatible interfaces

---

# Target Audience

Primary Users

* Backend Developers
* Full Stack Developers
* API Developers
* Software Engineers

Secondary Users

* QA Engineers
* Automation Engineers
* DevOps Engineers
* Technical Leads
* Solution Architects
* Students learning backend development

---

# Problems OpenAPI Companion Solves

Developers repeatedly encounter workflow interruptions while testing APIs.

Common frustrations include:

* Losing authorization after page refresh
* Recreating request payloads
* Re-entering query parameters
* Copying JWT tokens repeatedly
* Switching between development environments
* Repeating login requests
* Losing testing progress after server restart
* No request history
* No reusable request templates
* Manual generation of test data
* Limited productivity features in Swagger UI

OpenAPI Companion removes these repetitive tasks while keeping developers inside their preferred OpenAPI documentation interface.

---

# Product Modules

The extension is organized into independent modules.

* Authentication Manager
* Request Manager
* Environment Manager
* API History
* Fake Data Generator
* Collections
* Workflow Runner
* Response Inspector
* Productivity Tools
* Extension Settings

Each module is designed to operate independently while integrating seamlessly with the others.

---

# Technology Stack

## Extension

* Manifest V3

## Frontend

* React
* TypeScript

## Build Tool

* Vite

## Styling

* Tailwind CSS

## State Management

* Zustand

## Storage

* chrome.storage.local
* chrome.storage.sync (optional)

## Testing

* Vitest
* Playwright

---

# Documentation Structure

Project documentation is organized into dedicated documents to keep specifications maintainable and implementation-focused.

The documentation covers:

* Product Vision
* Product Requirements
* Feature Specifications
* User Stories
* User Flows
* Technical Architecture
* Storage Design
* Security
* Testing
* Roadmap
* Future Enhancements

Each feature also includes its own Feature Design Document (FDD) containing implementation details, user flows, acceptance criteria, edge cases, UI behavior, and technical considerations.

---

# Development Approach

The project follows a documentation-first development methodology.

Every feature progresses through the following stages:

1. Problem Identification
2. Feature Specification
3. User Stories
4. User Flow Design
5. UI/UX Design
6. Technical Architecture
7. Storage Design
8. Edge Case Analysis
9. Acceptance Criteria
10. Implementation
11. Testing
12. Review

No production code should be written before the feature documentation is complete.

---

# Long-Term Vision

OpenAPI Companion aims to become the productivity layer for the OpenAPI ecosystem.

Future expansion may include:

* VS Code Extension
* JetBrains Plugin
* Desktop Companion
* Team Collaboration
* Cloud Synchronization
* Plugin Ecosystem
* Enterprise Edition

---

# Project Status

Current Phase

Planning & Product Specification

Current Milestone

Documentation Phase

Next Milestone

Complete Product Requirements Document (PRD)

---

# Success Criteria

The project will be considered successful when backend developers can install the extension and immediately experience a faster, more efficient API testing workflow without changing any existing backend code or documentation setup.

Every feature should contribute toward one goal:

> **Reduce repetitive manual work and allow developers to focus on building APIs instead of repeatedly configuring their testing environment.**

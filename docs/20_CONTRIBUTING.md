# 20_CONTRIBUTING.md

# Contributing Guide

## Overview

Welcome to the OpenAPI Companion project.

This document defines the development standards, contribution process, coding conventions, review requirements, and project workflow for all contributors.

Whether you are fixing a typo, implementing a new feature, or redesigning an architecture module, every contribution should follow this guide.

---

# Project Philosophy

OpenAPI Companion is built around five core principles.

* Simplicity
* Reliability
* Maintainability
* Performance
* Developer Experience

Every contribution should strengthen these principles.

---

# Before You Contribute

Before writing code, contributors should:

* Read the Project Overview.
* Read the Product Vision.
* Read the Technical Architecture.
* Read the Feature Specification.
* Read the Design Decisions.
* Understand the affected module.

No implementation should begin without understanding the feature requirements.

---

# Development Workflow

Every feature should follow this lifecycle.

```text
Idea

↓

Discussion

↓

Documentation

↓

Architecture Review

↓

Implementation

↓

Testing

↓

Code Review

↓

Merge

↓

Release
```

Skipping documentation is not allowed.

---

# Repository Structure

```text
OpenAPI-Companion/

│

├── docs/

├── extension/

├── packages/

├── scripts/

├── tests/

├── assets/

└── .github/
```

Contributors should place code in the appropriate module.

---

# Branch Strategy

Recommended branches:

```text
main

develop

feature/<feature-name>

bugfix/<bug-id>

hotfix/<issue>

release/<version>
```

Examples:

```text
feature/authentication-manager

feature/request-history

bugfix/token-restore

release/v1.0.0
```

---

# Commit Message Convention

Use conventional commits.

Examples:

```text
feat(authentication): add persistent authorization

fix(history): resolve duplicate request issue

docs(storage): update storage schema

refactor(ui): simplify sidebar layout

test(workflow): add replay tests
```

---

# Pull Request Checklist

Every Pull Request should include:

* Clear title
* Problem description
* Proposed solution
* Screenshots (if UI changes)
* Updated documentation
* Passing tests
* No linting errors

---

# Code Style

General guidelines:

* Write readable code.
* Prefer clarity over cleverness.
* Avoid unnecessary abstractions.
* Keep functions small.
* Keep components focused.

---

# TypeScript Standards

Use:

* Strict mode
* Explicit types
* Interfaces where appropriate
* Type-safe APIs

Avoid:

* `any`
* Unnecessary type assertions
* Unchecked null values

---

# React Standards

Guidelines:

* Functional components only
* Hooks over classes
* Reusable components
* Small component size
* Separate UI and business logic

---

# State Management

Use Zustand.

Rules:

* Global state only when necessary.
* Keep feature state local.
* Avoid deeply nested stores.

---

# Folder Conventions

Each feature module should follow:

```text
module/

├── components/

├── hooks/

├── services/

├── store/

├── utils/

├── types/

├── constants/

└── tests/
```

Every module should look similar.

---

# Naming Conventions

Variables

```ts
requestHistory
```

Components

```ts
HistoryPanel
```

Hooks

```ts
useAuthentication()
```

Services

```ts
HistoryService
```

Stores

```ts
AuthenticationStore
```

Constants

```ts
MAX_HISTORY_ITEMS
```

---

# Documentation Requirements

Every feature must update:

* Feature Specification
* User Stories
* Functional Requirements (if applicable)
* Changelog
* Design Decisions (if architecture changes)

Code without documentation is considered incomplete.

---

# Testing Requirements

Every contribution must include appropriate tests.

Required:

* Unit Tests
* Integration Tests (where applicable)

End-to-end tests are required for user-facing features.

---

# Code Review Standards

Reviewers should verify:

* Correctness
* Readability
* Performance
* Security
* Test coverage
* Documentation
* Architectural consistency

---

# Performance Guidelines

Contributors should:

* Avoid unnecessary renders.
* Lazy-load heavy modules.
* Minimize storage operations.
* Keep bundle size small.
* Use memoization only when beneficial.

---

# Security Guidelines

Never:

* Log tokens
* Store secrets in code
* Execute untrusted content
* Introduce unnecessary permissions

Every security-related change requires additional review.

---

# Accessibility

UI contributions should include:

* Keyboard navigation
* Focus management
* ARIA labels
* Sufficient color contrast

Accessibility is part of the definition of done.

---

# Issue Reporting

Bug reports should include:

* Browser
* Extension Version
* Documentation Platform
* Reproduction Steps
* Expected Result
* Actual Result
* Screenshots (if applicable)

---

# Feature Requests

Feature requests should include:

* Problem Statement
* Proposed Solution
* User Value
* Alternatives Considered
* Impact Assessment

Requests without a clear problem statement may be declined.

---

# Coding Principles

Contributors should follow:

* DRY (Don't Repeat Yourself)
* KISS (Keep It Simple, Stupid)
* SOLID Principles
* Single Responsibility Principle
* Composition over Inheritance

---

# Dependency Policy

Before adding a new dependency:

Ask:

* Is it actively maintained?
* Does it solve a real problem?
* Can we implement it ourselves reasonably?
* Does it increase bundle size significantly?

Avoid unnecessary libraries.

---

# Breaking Changes

Breaking changes require:

* Discussion
* Documentation update
* Migration plan
* Changelog entry

---

# Release Contributions

Before a release:

* All tests pass.
* Documentation updated.
* Changelog updated.
* Version incremented.
* Known issues documented.

---

# Community Guidelines

Contributors should:

* Be respectful.
* Be constructive.
* Focus on technical discussions.
* Welcome new contributors.
* Share knowledge.

Healthy collaboration leads to better software.

---

# Getting Started

New contributors are encouraged to begin with:

* Documentation improvements
* Small bug fixes
* UI polish
* Test improvements

These are excellent ways to learn the codebase.

---

# Definition of Done

A task is complete only when:

* Feature implemented.
* Tests pass.
* Documentation updated.
* Code reviewed.
* No linting errors.
* No known regressions.
* Acceptance criteria satisfied.

---

# Maintainer Responsibilities

Project maintainers should:

* Review pull requests promptly.
* Keep documentation current.
* Enforce coding standards.
* Guide contributors.
* Maintain release quality.

---

# Contribution Success Criteria

A contribution is successful when it:

* Solves the intended problem.
* Improves the developer experience.
* Follows project standards.
* Maintains architectural consistency.
* Does not introduce regressions.

---

# Contributing Summary

OpenAPI Companion values thoughtful, well-documented contributions over rapid feature additions.

Every contributor helps shape the quality of the project.

By following this guide, we ensure the codebase remains clean, maintainable, and aligned with the project's core philosophy:

> **Build developer tools that remove friction, respect existing workflows, and remain simple enough for developers to trust every day.**

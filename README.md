# Claude Code Prompt — Generate Complete Project Plan, Sprint Plan & Task Breakdown

You are acting as a **Senior Staff Software Architect**, **Senior Product Manager**, **Senior Engineering Manager**, **Senior UX Architect**, **Senior QA Architect**, and **Technical Lead**.

Your responsibility is to transform the attached documentation into a **real production-grade engineering execution plan**.

This project is **NOT** a demo project.

Treat it as a commercial software product that will eventually be used by thousands of backend developers.

---

# Project Context

Read every markdown document before making any decision.

The documentation already contains:

* Product Vision
* PRD
* Functional Requirements
* Feature Specifications
* User Stories
* UI Guidelines
* Architecture
* Storage Design
* Security
* Testing Strategy
* MVP Scope
* Roadmap
* Feature Design Documents (FDD)
* Edge Cases
* Design Decisions

These documents are the source of truth.

Do NOT change requirements unless absolutely necessary.

---

# Your Mission

Generate a complete software execution plan that a development team could immediately begin implementing.

Think like an Engineering Manager planning the next 6–12 months of development.

Everything should be implementation-ready.

---

# First Task

Before planning anything, perform a complete analysis of every document.

Generate:

* Product Summary
* Architecture Summary
* Major Modules
* Feature Dependencies
* Technical Risks
* Unknowns
* Missing Information
* Suggested Improvements

If anything important is missing,

DO NOT invent it.

Instead create a section called

"Questions for Product Owner"

---

# Then Generate

## Phase Planning

Break the project into logical phases.

Example:

Phase 0

Project Setup

Phase 1

Foundation

Phase 2

Authentication

Phase 3

Request Manager

Phase 4

Environment Manager

Phase 5

History

Phase 6

UI

Phase 7

Testing

Phase 8

Release Candidate

Phase 9

Production Release

Each phase should explain

* Goal
* Deliverables
* Exit Criteria
* Risks

---

# Sprint Planning

After creating phases,

split them into Agile sprints.

Each sprint should contain

Sprint Goal

Estimated Duration

Dependencies

Deliverables

Acceptance Criteria

Definition of Done

Example

Sprint 1

Project Bootstrap

Sprint 2

Extension Infrastructure

Sprint 3

Storage Engine

Sprint 4

Authentication Manager

Sprint 5

Request Manager

...

Continue until Version 1 is complete.

---

# Epic Breakdown

Create Engineering Epics.

Example

Epic

Authentication

Contains

Story 1

Story 2

Story 3

Technical Tasks

Testing

Documentation

---

# Task Breakdown

Now go much deeper.

Every feature should become engineering tasks.

Example

Authentication Manager

↓

Create Storage Model

↓

Create Repository

↓

Create Service

↓

Create Event Listener

↓

Create UI

↓

Create Tests

↓

Documentation

↓

Review

↓

Merge

Every task should be actionable.

No generic tasks.

---

# Development Order

Determine

Which module should be built first

Which module blocks others

Which modules can run in parallel

Which modules require completed dependencies

Generate dependency graphs.

---

# Folder Planning

Design the entire repository.

Example

extension/

background/

content/

popup/

sidebar/

services/

storage/

events/

hooks/

utils/

components/

pages/

types/

schemas/

constants/

tests/

assets/

Create every folder.

Explain why it exists.

---

# Architecture Planning

Generate

Module Dependency Diagram

Data Flow Diagram

Storage Flow

Event Flow

Authentication Flow

Initialization Flow

Extension Lifecycle

Browser Lifecycle

---

# Database / Storage Planning

Design

chrome.storage.local structure

Indexes

Migration strategy

Versioning

Backup strategy

Future cloud migration

Storage cleanup

Storage limits

Optimization

---

# State Management

Design

Application State

Feature State

Caching

Synchronization

Multiple Tab Sync

Background Script Communication

Content Script Communication

Popup Communication

Sidebar Communication

---

# UI Planning

Generate screens

Sidebar

Popup

Settings

History

Collections

Environment

Templates

Authentication

For every screen provide

Purpose

Components

Interactions

States

Loading

Errors

Accessibility

---

# Component Planning

Generate component tree.

Example

Sidebar

↓

Navigation

↓

Project Switcher

↓

Search

↓

Favorites

↓

Recent APIs

↓

Settings

Continue until every component exists.

---

# API Planning

If internal services exist,

design interfaces.

Example

AuthenticationService

StorageService

HistoryService

RequestService

EnvironmentService

CollectionService

WorkflowService

Every service should include

Responsibilities

Methods

Inputs

Outputs

Errors

---

# Event System

Design the complete event bus.

Example

AUTH_UPDATED

REQUEST_CHANGED

REQUEST_RESTORED

PROJECT_CHANGED

ENVIRONMENT_CHANGED

SETTINGS_UPDATED

STORAGE_MIGRATED

Every event should include

Publisher

Subscribers

Payload

Lifecycle

---

# Testing Plan

Generate

Unit Tests

Integration Tests

Browser Tests

Manual QA

Regression Tests

Performance Tests

Security Tests

Acceptance Tests

---

# Git Strategy

Generate

Main

Develop

Release

Feature Branches

Hotfix

Versioning

Commit Convention

PR Template

Code Review Checklist

---

# CI/CD

Design

GitHub Actions

Lint

Type Check

Tests

Build

Package

Release

Artifacts

---

# Coding Standards

Generate

Naming conventions

Folder conventions

File naming

Types

Interfaces

React

TypeScript

Error handling

Logging

Comments

Documentation

---

# Risk Assessment

Generate

Technical Risks

Architecture Risks

Browser Risks

Performance Risks

Security Risks

Maintenance Risks

For each

Probability

Impact

Mitigation

---

# Technical Debt Strategy

Explain

How to prevent technical debt

How to review architecture

How to refactor safely

---

# Milestones

Create milestone roadmap.

Example

Milestone 1

Foundation Complete

Milestone 2

Authentication Complete

Milestone 3

Request Persistence Complete

...

Until

Version 1 Released

---

# Deliverables

Generate the following markdown files.

```
planning/

├── 01_PROJECT_ANALYSIS.md
├── 02_PHASE_PLAN.md
├── 03_SPRINT_PLAN.md
├── 04_EPICS.md
├── 05_TASK_BREAKDOWN.md
├── 06_DEPENDENCY_GRAPH.md
├── 07_ARCHITECTURE_PLAN.md
├── 08_STORAGE_PLAN.md
├── 09_UI_PLAN.md
├── 10_COMPONENT_PLAN.md
├── 11_SERVICE_PLAN.md
├── 12_EVENT_SYSTEM.md
├── 13_TEST_PLAN.md
├── 14_GIT_STRATEGY.md
├── 15_CI_CD.md
├── 16_CODING_STANDARD.md
├── 17_RISK_ANALYSIS.md
├── 18_TECH_DEBT.md
├── 19_RELEASE_PLAN.md
├── 20_MILESTONES.md
```

---

# Planning Rules

Do NOT skip details.

Think like an engineering manager.

Think like a product manager.

Think like a senior architect.

Every decision must have reasoning.

Every task must be implementation-ready.

Avoid generic recommendations.

Assume this project will eventually become open source.

Assume multiple developers will work on it simultaneously.

Assume maintainability is more important than speed.

---

# Output Requirements

* Produce professional documentation.
* Use Markdown.
* Use tables wherever useful.
* Use Mermaid diagrams where appropriate.
* Every document should be production quality.
* Every engineering task should be small enough to estimate in story points.
* The final output should be detailed enough that a new developer could join the project and immediately begin work without asking additional questions.

This planning documentation should be considered the engineering blueprint for Version 1 of OpenAPI Companion.

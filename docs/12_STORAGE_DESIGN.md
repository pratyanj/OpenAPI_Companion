# 12_STORAGE_DESIGN.md

# Storage Design

## Overview

This document defines how OpenAPI Companion stores, retrieves, organizes, and manages data.

The storage architecture is designed around the following principles:

* Local First
* Fast Access
* Modular
* Secure
* Scalable
* Framework Independent

Every feature owns its own storage namespace while sharing a common project structure.

---

# Storage Goals

The storage system must:

* Store everything locally.
* Restore user sessions automatically.
* Separate data by project.
* Separate data by environment.
* Minimize storage operations.
* Support future synchronization.
* Allow backup and restore.
* Be easy to migrate between versions.

---

# Storage Technology

## Primary Storage

```text
chrome.storage.local
```

Reason:

* High storage capacity
* Persistent
* Browser managed
* Works offline
* Cross-platform

---

## Future Storage

```text
chrome.storage.sync
```

Purpose

* Settings synchronization
* User preferences
* Small configuration files

Large datasets should remain in local storage.

---

# Storage Hierarchy

```text
chrome.storage.local

│

├── projects

├── settings

├── metadata

├── cache

└── backups
```

---

# Project Structure

Every detected API project has its own workspace.

```text
projects/

project-id/

│

├── authentication/

├── requests/

├── history/

├── environments/

├── collections/

├── workflows/

├── templates/

├── favorites/

├── fake-data/

└── metadata/
```

No project shares data with another project.

---

# Project Identifier

Each project requires a unique identifier.

Suggested generation:

```text
Origin

+

OpenAPI URL

+

Documentation Type
```

Example

```text
https://localhost:8000/docs
```

↓

```text
project_18af83
```

Project IDs remain stable across browser restarts.

---

# Authentication Storage

```text
authentication/

│

├── active

├── profiles

├── history

└── metadata
```

Stored Information

* Authentication Type
* Token
* Created Time
* Updated Time
* Expiration
* Environment
* Last Used

---

# Request Storage

```text
requests/

│

├── drafts

├── templates

├── recent

└── metadata
```

Each request stores:

* Endpoint
* Method
* Body
* Headers
* Query Parameters
* Path Parameters
* Cookies
* Last Updated

---

# Environment Storage

```text
environments/

│

├── local

├── qa

├── staging

├── production

└── custom
```

Environment Information

* Name
* Base URL
* Variables
* Authentication
* Description
* Created Date

---

# History Storage

```text
history/

│

├── requests

├── responses

└── metadata
```

Each history record stores:

* Request ID
* Endpoint
* Method
* Timestamp
* Duration
* Status Code
* Environment
* Response Size

---

# Collections

```text
collections/

│

├── collection-1

├── collection-2

└── metadata
```

Collection Information

* Name
* Description
* Folder
* Requests
* Favorite
* Created Date

---

# Workflow Storage

```text
workflows/

│

├── workflow-1

├── workflow-2

└── metadata
```

Workflow Information

* Name
* Ordered Steps
* Stop on Failure
* Created Date
* Last Executed

---

# Fake Data Storage

```text
fake-data/

│

├── presets

├── templates

└── history
```

Stores:

* Generator presets
* Recent values
* Custom templates

Generated values should not be permanently stored unless explicitly saved.

---

# Favorites

```text
favorites/

│

├── endpoints

├── collections

├── templates

└── workflows
```

---

# Settings Storage

Global settings remain outside project storage.

```text
settings/

│

├── appearance

├── shortcuts

├── storage

├── notifications

├── privacy

└── advanced
```

---

# Metadata

```text
metadata/

│

├── version

├── install-date

├── migration

├── extension-version

└── schema-version
```

Metadata is used for upgrades and migrations.

---

# Cache

Temporary data should never mix with persistent storage.

```text
cache/

│

├── responses

├── generated-data

├── temporary

└── ui-state
```

Cache may be safely cleared.

---

# Backup Structure

```text
backups/

│

├── backup-001

├── backup-002

└── backup-003
```

Each backup contains:

* Projects
* Settings
* Templates
* Collections
* Environments

---

# Data Isolation

Every project maintains completely independent storage.

Example

```text
FastAPI Project

↓

Own Authentication

↓

Own History

↓

Own Requests
```

```text
Django Project

↓

Own Authentication

↓

Own History

↓

Own Requests
```

Mixing project data is never allowed.

---

# Storage Naming Convention

Recommended format

```text
project-id/module/item-id
```

Example

```text
project_123/history/request_54
```

Consistent naming improves debugging and migration.

---

# Data Lifecycle

Every stored object follows the same lifecycle.

```text
Created

↓

Updated

↓

Used

↓

Archived (optional)

↓

Deleted
```

Deletion should be reversible where practical.

---

# Storage Limits

The extension should monitor storage usage.

Warnings should appear when approaching browser limits.

Future versions may provide cleanup recommendations.

---

# Data Cleanup

Users should be able to clear:

* Authentication
* History
* Templates
* Collections
* Workflows
* Cache
* Entire Project

Each cleanup action should display confirmation before execution.

---

# Import & Export

Supported export modules:

* Settings
* Projects
* Environments
* Collections
* Templates
* Workflows

Imports should validate:

* File integrity
* Schema version
* Duplicate projects
* Compatibility

---

# Versioning

Every stored object should include:

* Schema Version
* Created Version
* Updated Version

This simplifies future migrations.

---

# Migration Strategy

On extension update:

```text
Load Storage

↓

Check Schema Version

↓

Migration Needed?

│

├── No

│

└── Yes

↓

Run Migration

↓

Update Version

↓

Continue
```

Migration failures must never corrupt user data.

---

# Storage Security

Sensitive data such as authentication tokens must:

* Remain local.
* Never be transmitted externally.
* Never appear in logs.
* Never be shared across projects.

Future optional cloud synchronization must require explicit user consent.

---

# Performance Considerations

Storage operations should:

* Batch writes when possible.
* Debounce rapid updates.
* Avoid unnecessary serialization.
* Read only required modules.
* Lazy-load large datasets.

Storage should never noticeably impact browser performance.

---

# Future Expansion

The storage architecture should support future additions including:

* Plugin data
* Cloud synchronization
* Team workspaces
* Enterprise configuration
* Analytics preferences

These should integrate without restructuring existing storage.

---

# Storage Success Criteria

The storage system is considered successful when:

* Developers never lose their work unexpectedly.
* Project data remains isolated.
* Session restoration is reliable.
* Storage remains organized and maintainable.
* Future schema changes can be migrated safely.
* Performance remains fast regardless of project size.

---

# Storage Summary

The storage layer is the foundation of OpenAPI Companion.

By organizing data around independent project workspaces and modular feature namespaces, the extension can reliably preserve developer context while remaining scalable, maintainable, and ready for future expansion.

Every storage decision should support one core objective:

> **Never make the developer repeat work that the extension can remember.**

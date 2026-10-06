# OpenAPI Companion --- Advanced API Testing Features

## Purpose

These features extend OpenAPI Companion from an API debugging helper
into a focused **Swagger/OpenAPI + API testing + contract verification**
tool. They should reuse the existing request engine, API History,
Request Presets, Project Variables, extraction rules, response
inspection, and Swagger integration.

## Roadmap

  -----------------------------------------------------------------------
  Priority                Feature                 Purpose
  ----------------------- ----------------------- -----------------------
  1                       API Scenario Recorder   Record API flows
                                                  performed in Swagger

  2                       API Workflow Runner     Replay multi-step API
                                                  flows

  3                       Assertions Engine       Verify status, headers,
                                                  body and values

  4                       Pagination Tester       Test page/offset/cursor
                                                  APIs automatically

  5                       OpenAPI Spec Change     Detect contract changes
                          Detector                and impact

  6                       Multi-file Upload       Improve multipart and
                          Assistant               multiple-file testing
  -----------------------------------------------------------------------

------------------------------------------------------------------------

# 1. API Scenario Recorder

## Problem

Developers often test APIs manually through Swagger: login, create a
resource, copy an ID, fetch it, update it, and delete it. Reproducing
the same flow later requires manually rebuilding every request.

## Goal

Record requests executed from Swagger and convert them into a reusable
scenario/workflow.

Example:

``` text
POST /login
    ↓ extract access_token
POST /users
    ↓ extract user_id
GET /users/{user_id}
PATCH /users/{user_id}
DELETE /users/{user_id}
```

## User Flow

1.  Click **Record Scenario**.
2.  Use Swagger normally.
3.  OpenAPI Companion captures request/response details in execution
    order.
4.  Stop recording.
5.  Review and save the scenario.
6.  Optionally convert it into a Workflow.

## Capture

-   HTTP method
-   URL/path
-   query parameters
-   headers
-   request body
-   response status
-   response body
-   execution order
-   relevant variables
-   timing

## Dynamic Value Detection

If a response contains `id: 92831` and the next request uses
`/users/92831`, suggest replacing the literal with `{{user_id}}` and
connect it to the existing variable/extraction system.

## Example Data Model

``` ts
interface ApiScenario {
  id: string;
  name: string;
  projectId: string;
  steps: ScenarioStep[];
  createdAt: number;
  updatedAt: number;
}

interface ScenarioStep {
  id: string;
  method: string;
  url: string;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
  response?: {
    status: number;
    headers: Record<string, string>;
  };
  extractions?: ExtractionRule[];
}
```

## Value

-   Turns debugging sessions into reusable tests.
-   Removes repetitive request setup.
-   Lets developers create workflows without writing test scripts.
-   Keeps Swagger as the primary developer workflow.

------------------------------------------------------------------------

# 2. API Workflow Runner

## Problem

Once a useful API sequence exists, developers need to run the whole flow
again. The extension should make this possible without manually
recreating requests in another tool.

## Example Workflow

``` text
Create User Workflow

1. Login
2. Create User
3. Extract user_id
4. Get User
5. Update User
6. Delete User
```

## Workflow UI

``` text
Create User Workflow

1. POST /login                 ✓
2. POST /users                 ✓
   Extract: user_id
3. GET /users/{{user_id}}      ✓
4. PATCH /users/{{user_id}}    ✓
5. DELETE /users/{{user_id}}   ✓

[Run Workflow]
```

## Step Configuration

Each step supports:

-   Method
-   URL
-   headers
-   query parameters
-   body
-   project variables
-   dynamic variables
-   response extraction
-   assertions

## Extraction Example

``` json
{
  "data": {
    "id": 123
  }
}
```

``` text
JSONPath: $.data.id
Save as: user_id
```

## Execution Result

``` text
✓ POST /login       200 OK
✓ POST /users       201 Created
  user_id = 92831
✓ GET /users/92831  200 OK
✗ PATCH /users/92831 422

Workflow Failed
```

Show the failed step, request, response, failed assertion, and relevant
variables.

## Failure Handling

Support:

-   Stop workflow
-   Continue workflow
-   Ask before continuing

Default: **Stop workflow**.

## Reuse Existing Features

The runner should reuse:

-   API History
-   Request Presets
-   Project Variables
-   Dynamic Variables
-   Extraction Rules
-   Authentication
-   Response Inspection
-   Existing request execution engine

------------------------------------------------------------------------

# 3. Assertions Engine

## Problem

A `200 OK` response does not necessarily mean the API behaved correctly.

Example:

``` json
{
  "success": false,
  "message": "User not found"
}
```

## Assertion Types

### Status

``` text
Status equals 200
Status is 2xx
Status is not 500
```

### Headers

``` text
Content-Type contains application/json
X-Request-ID exists
```

### JSON Properties

``` text
$.data.id exists
$.data.name == "John"
```

### Types

``` text
$.data.id is number
$.data.email is string
$.data.items is array
```

### Length

``` text
$.data.items length > 0
$.data.items length <= 20
```

### Contains

``` text
$.data.roles contains "admin"
```

### Response Time

``` text
Response time < 1000ms
```

## Assertion UI

``` text
Assertions

1. Status
   Operator: equals
   Value: 200

2. JSON Path
   Path: $.data.id
   Operator: exists

3. JSON Path
   Path: $.data.email
   Operator: contains
   Value: @example.com
```

## Result

``` text
✓ Status = 200
✓ $.data.id exists
✗ $.data.email contains "@example.com"

Expected: @example.com
Actual:   test@gmail.com
```

## Architecture

``` ts
interface Assertion {
  id: string;
  type: AssertionType;
  target?: string;
  operator: AssertionOperator;
  expected?: unknown;
}
```

------------------------------------------------------------------------

# 4. Pagination Tester

## Problem

Pagination bugs are tedious to verify manually. The tester should
validate page/limit/offset/cursor behavior across multiple requests.

## Supported Styles

### Page

``` text
?page=1
?page=2
?page=3
```

### Limit/Offset

``` text
?limit=20&offset=0
?limit=20&offset=20
?limit=20&offset=40
```

### Page Size

``` text
?page=1&page_size=20
```

### Cursor

``` text
?cursor=abc123
```

## Detection

Look for common parameter names such as:

``` text
page
page_number
pageNo
limit
page_size
per_page
offset
cursor
next_cursor
continuation_token
```

Also inspect the OpenAPI schema and response structure.

## UI

``` text
Pagination Tester

Endpoint: GET /users

Pagination type:
● Page
○ Offset
○ Cursor
○ Custom

Parameter: page
Page size: 20
Maximum pages: 10

[Run Test]
```

## Checks

### Duplicate Detection

Compare IDs across pages and report repeated records.

### Missing Records

Detect gaps where possible, but label them as **heuristics**, not
guaranteed defects.

### Page Size

Verify returned record counts against the configured/requested page
size.

### Cursor Progression

Verify that an extracted `next_cursor` is used by the next request.

## Example Report

``` text
Pagination Test

Endpoint: GET /users
Pages tested: 5
Records collected: 67

✓ No duplicate IDs
✓ Cursor progression valid
✓ Page sizes valid
✓ Final page detected

Warnings:
⚠ Page 4 returned fewer records than requested
```

------------------------------------------------------------------------

# 5. OpenAPI Spec Change Detector

## Problem

The backend OpenAPI specification can change while developers continue
using saved requests, workflows, and assumptions based on the old
contract.

Example:

``` text
Before: GET /users/{id}
After:  GET /users/{userId}
```

Another example is a request property changing from optional to
required.

## Goal

Snapshot the active OpenAPI specification and compare it with the next
loaded version.

## Flow

``` text
Current OpenAPI Spec
        ↓
Normalize
        ↓
Generate Snapshot
        ↓
Store Locally

Next Spec
        ↓
Compare
        ↓
Added / Removed / Modified / Potentially Breaking
```

## Example

``` text
⚠ OpenAPI specification changed

3 changes detected

Removed:
  DELETE /users/{id}

Added:
  DELETE /users/{userId}

Modified:
  POST /users
  Required field added: email
```

## Change Categories

-   Added endpoint
-   Removed endpoint
-   Modified endpoint
-   Added/removed parameter
-   Required parameter changes
-   Request property changes
-   Response property changes
-   Response type changes
-   Enum changes
-   Path parameter changes

## Breaking-Change Heuristics

Flag changes that **may** break consumers, for example:

-   endpoint removed
-   HTTP method removed
-   required parameter added
-   required request property added
-   response property removed
-   response type changed
-   enum value removed
-   path parameter changed

Use wording such as **Potentially breaking** rather than claiming that
every change will definitely break every consumer.

## Impact Analysis

OpenAPI Companion can go beyond a generic diff because it knows about
local resources:

-   Saved requests
-   Request presets
-   Workflows
-   Scenarios
-   Favorites
-   Variables
-   API history

Example:

``` text
PATCH /users/{id}

Required field added: email

Affected resources:
⚠ Workflow: Update User
⚠ Saved Request: Update User
⚠ Scenario: User CRUD Flow
```

------------------------------------------------------------------------

# 6. Multi-file Upload Assistant

## Problem

Multipart endpoints become difficult when they accept multiple files.
OpenAPI can represent an array of binary files, but Swagger UI does not
always provide the ideal file-picker experience for every OpenAPI
version/schema combination.

OpenAPI Companion already has single-file upload support, so this should
extend that capability rather than become an unrelated feature.

## Example Schema

``` yaml
content:
  multipart/form-data:
    schema:
      type: object
      properties:
        files:
          type: array
          items:
            type: string
            format: binary
```

## User Experience

``` text
Files

┌──────────────────────────────┐
│ Drop files here              │
│                              │
│ [Browse Files]               │
└──────────────────────────────┘

Selected files:

📄 image-1.png   1.2 MB   ✕
📄 image-2.png   2.1 MB   ✕
📄 document.pdf  800 KB   ✕

[Send Request]
```

## Capabilities

-   Multiple file selection using `<input type="file" multiple>`
-   Drag and drop
-   File name/size/MIME type preview
-   Remove individual file
-   Optional reordering
-   Multipart array support
-   Reuse selected files during the current request session

## Storage Rule

Do **not** persist file contents by default. Keep `File` objects in
memory until request execution. A saved request may remember the field
configuration without storing actual file bytes.

## Compatibility Matrix

  OpenAPI   Schema                      Expected
  --------- --------------------------- ----------------
  3.0       string + binary             Single file
  3.0       array + binary              Multiple files
  3.1       string + contentMediaType   Single file
  3.1       array + contentMediaType    Multiple files

------------------------------------------------------------------------

# Shared Architecture

These features should share infrastructure instead of becoming
independent systems.

``` text
                    OpenAPI Companion
                           │
                    OpenAPI Specification
                           │
                    Swagger Integration
                           │
                    Request Engine
                           │
          ┌────────────────┼────────────────┐
          │                │                │
      Variables        Extraction       Assertions
          │                │                │
          └────────────────┼────────────────┘
                           │
                     Workflow Engine
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
 Scenario Recorder   Workflow Runner   Pagination Tester
        │                  │                  │
        └──────────────────┼──────────────────┘
                           │
                    Testing Results
                           │
                    History / Reports
```

## Core Rule

**Do not create a second API request engine.** Everything should
ultimately go through the existing request execution pipeline so
authentication, environments, history, request execution, and testing
stay consistent.

------------------------------------------------------------------------

# Implementation Phases

## Phase 1 --- Testing Foundation

Build reusable infrastructure:

-   Workflow data model
-   Workflow step model
-   Execution engine
-   Variable context
-   Extraction integration
-   Assertion engine
-   Execution result model

## Phase 2 --- Scenario Recorder

-   Recording state
-   Request interception/capture
-   Response capture
-   Step ordering
-   Scenario editor
-   Dynamic-value detection
-   Convert scenario → workflow

## Phase 3 --- Workflow Runner

-   Workflow editor
-   Step configuration
-   Run workflow
-   Variable chaining
-   Extraction
-   Assertions
-   Failure handling
-   Run history
-   Result viewer

## Phase 4 --- Pagination Tester

-   Pagination detection
-   Page/offset/cursor strategies
-   Automatic request generation
-   Duplicate detection
-   Missing-record heuristics
-   Page-size checks
-   Cursor progression
-   Pagination report

## Phase 5 --- Spec Change Detector

-   Spec snapshot
-   Spec normalization
-   Diff engine
-   Change classification
-   Breaking-change heuristics
-   Saved-resource impact analysis
-   Change notification UI

## Phase 6 --- Multi-file Upload Assistant

-   Multiple file picker
-   Drag/drop
-   File list
-   Remove/reorder
-   Multipart array support
-   OAS 3.0 support
-   OAS 3.1 support
-   File-input compatibility detection
-   Request execution integration

------------------------------------------------------------------------

# Recommended MVP Scope

## Workflow MVP

``` text
✓ Record request
✓ Save request sequence
✓ Run sequence
✓ Variables
✓ Extraction
✓ Status assertions
✓ Stop on failure
✓ Run result
```

## Pagination MVP

``` text
✓ Detect page parameter
✓ Run N pages
✓ Collect records
✓ Duplicate detection
✓ Page-size validation
✓ Basic report
```

## Spec Detector MVP

``` text
✓ Store previous spec
✓ Detect changes
✓ Added/removed/modified endpoints
✓ Required-field changes
✓ Basic impact analysis
```

## Multi-file MVP

``` text
✓ Multiple file picker
✓ Drag/drop
✓ File list
✓ Remove file
✓ Multipart array
✓ Request execution
```

------------------------------------------------------------------------

# End-to-End Example

A developer is debugging a user-management API.

1.  Open Swagger.
2.  Start **Record Scenario**.
3.  Execute login, create, get, update, and delete requests.
4.  Companion detects `access_token` and `user_id` candidates.
5.  Save as `User CRUD Workflow`.
6.  Add assertions: `200`, `201`, `200`, `200`, `204`.
7.  Run the workflow.
8.  Later, the OpenAPI spec changes and makes `email` required.
9.  Spec Change Detector reports the potentially breaking change and
    identifies the affected workflow.
10. Developer updates the workflow and reruns it.

------------------------------------------------------------------------

# Product Positioning

Avoid turning the extension into a generic Postman clone.

The product direction should remain:

> **API testing directly inside Swagger/OpenAPI.**

The developer should be able to keep using the Swagger UI they already
use while OpenAPI Companion adds recording, workflows, assertions,
pagination testing, contract-change detection, and better file-upload
handling around it.

------------------------------------------------------------------------

# Future Extensions

Once the Workflow Testing Engine is stable, it can support:

-   Negative Test Generator
-   API Contract Validator
-   Request Mutation Testing
-   Authentication Flow Tester
-   Response Schema Validator
-   API Security Smoke Tests
-   Repeated-request/load helper
-   API Test Export
-   CI-friendly workflow export
-   Test-result comparison
-   Response diffing
-   Automated regression testing

These should come after the core workflow infrastructure is stable.

------------------------------------------------------------------------

# Final Relationship

``` text
Scenario Recorder
       │
       ▼
Workflow
       │
       ├── Assertions
       ├── Variables
       ├── Extraction
       └── Runner
              │
              ├── Pagination Tester
              └── Future API Test Features
```

The key architectural decision is to build **Scenario Recorder +
Workflow Runner + Assertions** as one reusable Workflow Testing Engine.
Pagination testing and future API testing features can then build on
that foundation.

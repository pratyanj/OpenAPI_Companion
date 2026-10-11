A persistent, productivity-focused API testing workspace for Swagger UI and OpenAPI documentation — local-first, private, and client-side.

Tired of re-entering authentication tokens after every page refresh, manually crafting test JSON bodies, losing parameters, or clicking through endpoints one by one to test multi-step user flows?

OpenAPI Companion integrates seamlessly with Swagger UI and the native browser Side Panel, giving developers a persistent, powerful workspace directly alongside their API documentation.

========================================
WHAT’S NEW IN VERSION 1.3.0
========================================
• Multi-Persona Authentication & Dynamic Payload Fields: Configure non-standard or mandatory login parameters (e.g. force_logout: true, tenant_id, role) with dynamic type casting (string, boolean, number) directly in the Auth Vault.
• Native Auto-Token Capture & Direct Authorization: Sending or replaying login requests automatically detects 2xx responses, extracts bearer tokens, and applies them to Swagger UI's authorization header with zero copy-pasting.
• OpenAPI Spec Change Detector & Impact Analysis: Automatically compares active API docs with cached schemas, alerting you to altered endpoints, removed parameters, and potential breaking changes.
• Automated Pagination Tester & Export: Test cursor-based, page/limit, and offset/limit pagination flows with automated record fetching, integrity checks, and 1-click JSON/CSV export.
• API Scenario Recorder & Visual Workflow Editor: Record live endpoint executions directly from documentation pages into reusable automated test workflows with drag-and-drop step management.
• Rich Assertions Engine: Validate status codes, latency thresholds, headers, regex patterns, and nested JSONPath queries (e.g., $.data.items[0].id).
• Refreshed Keyboard Shortcuts:
  - Press Ctrl+F (or Cmd+F on macOS) for the instant Command Palette endpoint search.
  - Press Ctrl+K (or Cmd+K on macOS) for the Keyboard Shortcuts Manager and cheat-sheet.
• Seamless Sidepanel Hot-Reloading: Automatically detects extension build updates and refreshes the panel without requiring full tab reloads.

========================================
CORE CAPABILITIES
========================================

1. MULTI-PERSONA AUTHENTICATION & AUTO-TOKEN CAPTURE
• Retain authorization across page reloads without repeatedly re-entering credentials.
• Supports Bearer tokens, JSON Web Tokens (JWT), API Keys, and Basic Auth.
• Multi-Persona Vault: Save distinct credentials and roles (e.g. Admin, Support, Guest, Tenant Admin) right beside Swagger's Authorize button.
• Custom Login Payload Fields: Add custom fields such as force_logout: true, client_secret, or tenant_id with strict typing.
• Zero-Click Token Extraction: Executing login endpoints parses successful tokens and authorizes Swagger UI immediately.
• Automatic Session Renewal: Automated background token refresh keeps active sessions valid during testing.

2. MULTI-STEP WORKFLOW RUNNER & SCENARIO RECORDER
• API Scenario Recorder: Floating recording toolbar captures real API interactions on docs pages into structured test workflows.
• Visual Step Editor: Drag, reorder, and configure multi-request flows with inter-step variable propagation.
• Dynamic Value Chaining: Extract values from earlier responses (e.g. created resource IDs) and inject them into downstream steps.
• Real-Time Execution Inspector: Step-by-step progress, latency metrics, status badges, and expandable payload inspection.
• Configurable Failure Behavior: Choose "Stop on failure" for strict verification or "Continue on failure" for batch processing.
• Portable Workflow Bundles: Export and share workflows with teammates via JSON bundles.

3. AUTOMATED PAGINATION TESTER & EXPORT
• Deep Pagination Verification: Validates cursor-based, page/limit, and offset-based pagination endpoints.
• Automated Data Fetching: Automatically traverses sequential pages up to configured record or page limits.
• Integrity & Deduplication Analysis: Detects duplicate identifiers, gap issues, and empty pages.
• Structured Export: Download aggregated paginated datasets directly as structured JSON or CSV.

4. OPENAPI SPEC CHANGE DETECTOR & IMPACT ANALYSIS
• Automatic Spec Diffing: Compares newly loaded API documentation against historical snapshots.
• Breaking Change Detection: Highlights removed endpoints, modified path/query parameters, and schema revisions.
• Impact Warning Modal: Alerts developers when stored variables, presets, or workflows may be affected by spec updates.

5. ASSERTIONS & AUTOMATED RESPONSE TESTING
• Multi-Condition Rules: Test status codes, execution duration, and response headers.
• Deep JSONPath Assertions: Assert on nested JSON response structures (e.g., $.user.email equals expected value).
• Regex & Type Validation: Match response strings against regex patterns or enforce numeric ranges.

6. ENVIRONMENT MANAGER & IN-PAGE VARIABLES (ALT+V)
• Dedicated Project Variables scoped 1-to-1 with your active API host.
• Quick Variable In-Page Modal (Alt+V): Inspect, search, copy, and create project variables directly over Swagger UI with instant blur auto-save.
• Secret Masking: Toggle visibility for sensitive tokens and keys, with one-click {{KEY}} tag copying.
• Auto-Extraction Rules: Define rules to automatically parse and save response properties into variables upon execution.
• In-Page Variable Resolution: Use {{VARIABLE_NAME}} in URL paths, query parameters, headers, and request bodies.

7. SMART WORKSPACES & PORT RESILIENCE
• Modern Card-Based Switcher: View and organize all local and remote API environments in clean visual cards.
• Zero-Friction Port Switching: Moving between local development ports (:8000, :8008, :8009) or domains preserves all tokens, history, and presets.
• Connected Port Chips: View all active URLs and ports associated with each project workspace at a glance.
• Granular Port Disconnection: Disconnect non-active ports directly via subtle ✕ buttons on port chips without reloading the page.
• Custom Workspace Naming: Label workspaces (e.g., "Auth Service", "Payment API") with inline editing.

8. API RESPONSE COMPARATOR & DIFF
• Side-by-Side Split View: Compare any two past calls from your history timeline with synchronized vertical scrolling.
• Unified Diff Mode: Toggle between a dual split-pane view and a compact single-column view with an "Only changes" filter.
• Multi-Tab Comparison: Inspect deltas across Response Body (JSON), Request Body, HTTP Headers, and Query/Path Parameters.
• Performance Metrics Delta: Immediate visual comparison of HTTP status codes, execution duration delta (ms / %), and payload byte size changes.

9. IN-PAGE SWAGGER PRODUCTIVITY ENHANCEMENTS
• Native Variable Autocomplete: Type {{ directly into Swagger UI inputs, query parameters, path fields, and request bodies for live autocomplete.
• Pinned Endpoints Tray: Star frequently tested endpoints to keep them anchored at the top of Swagger UI for quick 1-click access.
• Paste cURL Autofill: Converts pasted terminal cURL requests into populated Swagger forms instantly.
• Global Request Headers: Define persistent global headers (such as X-Tenant-ID or trace IDs) that automatically attach to all requests executed from the page.
• Multi-Language Code Snippets: Copy ready-to-use code directly from endpoints formatted as cURL, Fetch, Axios, PowerShell, or Python.
• Response Data Export: Download executed responses in structured JSON or CSV format.
• Quick Payload Refill: Re-fill the last sent request body for any endpoint in one click.

10. SMART MOCK DATA GENERATOR
• Built-in schema-aware generators for realistic names, emails, addresses, UUIDs, dates, numbers, and timestamps.
• Multiple Generation Modes:
  - Realistic: Generates lifelike sample data according to field types.
  - Minimal: Populates required fields only.
  - Boundary: Tests maximum, minimum, and edge-case limits.
  - Robustness: Tests input resilience with special character sets and varied data lengths.
• Auto-Fill: Detects open parameter fields and populates them instantly.

11. REQUEST PRESETS & TEMPLATES
• Save frequently used request bodies, query parameters, and custom headers as named presets.
• Insert saved presets directly into open endpoint forms with one click.
• Automatically remembers last-used inputs per endpoint.

12. REQUEST HISTORY & REPLAY
• Chronological Call Numbering: View past calls sequentially (#1 to #N) with 0ms in-place inspector switching.
• Automatically records executed calls with timestamps, HTTP status codes, durations, and payloads.
• Search and filter past requests by endpoint path or status code.
• Inspect headers and bodies, compare against previous executions, or replay requests with a single click.

13. AUTOMATED BACKUPS & SAFE IMPORT
• Recurring Background Backups: Scheduled automatic exports via background alarms with zero overhead.
• Smart Delta Detection: Automatically skips backup operations if no project data was mutated.
• Pre-Import Safety Snapshot: 1-click "Undo Import" rollback if you import an unintended backup file.
• Encrypted Exports: Optional passphrase protection for backup files using industry-standard AES-GCM encryption.

14. IN-PAGE FEEDBACK & SUGGESTIONS
• Centered In-Page Dialog: Submit feedback, feature ideas, and issue reports directly within your documentation workspace.
• Background Delivery: Feedback is delivered reliably through the extension's background service worker.
• Offline Queue: Automatically caches submissions locally if offline, transmitting them upon reconnection.

15. INSTANT COMMAND PALETTE & NAVIGATION
• Press Ctrl+F (or Cmd+F on macOS) to search all endpoints instantly by path, method, or summary description.
• Press Ctrl+K (or Cmd+K on macOS) to open the Keyboard Shortcuts configuration modal.
• Jump directly to any endpoint on the documentation page without manual scrolling.

========================================
PRIVACY & SECURITY
========================================
• Local-First Storage: All API credentials, tokens, variables, history, and presets remain strictly inside your browser's local storage.
• Private & Client-Side: Runs client-side alongside your existing documentation without modifying backend services or routing API calls through external third-party servers.
• No Unsolicited Telemetry: Feedback is only transmitted when you explicitly choose to submit the feedback dialog.
• Passphrase-Protected Backups: Protect your exported JSON configuration files with user-defined passphrases using AES-GCM encryption.

========================================
HOW TO GET STARTED
========================================
1. Add OpenAPI Companion to your browser.
2. Open any Swagger UI or OpenAPI documentation page (e.g., http://localhost:8000/docs or https://petstore.swagger.io).
3. Press Ctrl+Shift+O (Cmd+Shift+O on macOS), click the extension icon, or click the floating launcher button in the bottom-right corner to open the Side Panel.
4. Enjoy a faster, persistent, and automated API testing workspace!

========================================
DISCLAIMER
========================================
OpenAPI Companion is an independent developer productivity extension and is not affiliated with, sponsored by, or endorsed by SmartBear Software, Swagger, or the OpenAPI Initiative. Swagger is a registered trademark of SmartBear Software.

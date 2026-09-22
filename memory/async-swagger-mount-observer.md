---
name: async-swagger-mount-observer
description: Implemented asynchronous waiting for Swagger UI to mount in SPAs and dynamically loaded pages.
metadata:
  type: project
```

Created swagger-mount-observer.ts module with isSwaggerPresent(), waitForSwaggerMount(), and watchSpaNavigation() functions. waitForSwaggerMount() first checks if Swagger UI is already present (fast path), otherwise sets up a MutationObserver with a timeout (default 3500ms) to wait for Swagger UI to mount dynamically. It resolves to true if detected within timeout, false on timeout. watchSpaNavigation() wraps history.pushState/replaceState and listens for popstate/hashchange events to detect SPA navigation, returning a cleanup function.

Updated swagger-ui-adapter.ts to make detect() method accept an optional Document parameter for use in the mount observer.

Updated content/index.tsx to refactor the boot() function:
- Separated agent initialization into bootAgent(doc, adapter) helper
- Added isBooting mutex to prevent race conditions
- Fast-path: if adapter.detect(document) returns true, call bootAgent immediately
- Slow-path: if not detected, call waitForSwaggerMount()
- On successful detection (within timeout): log message and call bootAgent(doc, adapter)
- On timeout: log message and activate watchSpaNavigation() to monitor for future SPA navigation events
- The bootAgent function contains the original agent initialization logic (project identification, service setup, event listeners, etc.)

Why: Many modern SPAs load Swagger UI asynchronously after the initial page load (e.g., via AJAX or client-side routing). The content script needed to wait for the Swagger UI to mount before initializing, but also needed to handle cases where the Swagger UI might appear later due to navigation without a full page reload.

How to apply: The mount observer is used in the content script's boot process. If Swagger UI is not present initially, it waits up to 3.5 seconds for it to appear. If found, it initializes the content agent. If not found within the timeout, it goes dormant but sets up a navigator watcher so that if the user navigates to a page with Swagger UI (via client-side routing), the content agent will boot when detected.

---

Note: This memory file describes the implementation of the asynchronous Swagger UI mounting observer feature.
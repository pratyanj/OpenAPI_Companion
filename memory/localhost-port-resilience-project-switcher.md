---
name: localhost-port-resilience-project-switcher
description: Implemented project resilience features for localhost/port changes, custom project naming, and project switching.
metadata:
  type: project
---

Added origin normalization for localhost variants (localhost, 127.0.0.1, [::1], 0.0.0.0, private IPs, .local) to treat different ports on the same host as the same project for data isolation. Introduced project linking mechanism allowing manual binding of origins to projects, with UI for linking/unlinking and copying project data. Extended project metadata with linkedOrigins, specTitle, and specPath fields to support custom project naming from Swagger spec title and path-based matching. Created ProjectSwitcherModal UI for managing projects, renaming, linking origins, and copying data. Updated project service to detect candidate projects when loading a new local project and suggest linking based on spec title or path. Enhanced side panel to show project selector in header and dashboard to show linked ports and inline rename.

Why: Users lose presets, variables, history, and workflows when switching between different ports of the same backend (e.g., localhost:8008 vs localhost:8009) because data was scoped strictly to origin+port. This feature allows seamless switching between development environments without losing work.

How to apply: When the extension loads a Swagger UI, it normalizes the origin for localhost variants and checks for existing bindings. If no binding exists and it's a new local project, it looks for candidate projects with matching spec title or path and shows them in the project switcher modal. Users can link the current origin to an existing project to share data, or copy data from another project. The project switcher modal (accessible via the side panel header) allows renaming projects, linking/unlinking origins, and copying data between projects.
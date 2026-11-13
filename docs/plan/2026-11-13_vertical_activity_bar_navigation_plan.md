# Implementation Plan: Concept 1 — Vertical Activity Bar Navigation

**Date**: 2026-11-13  
**Status**: Pending User Review & Approval  
**Author**: Antigravity  
**Selected Direction**: **Concept 1: Vertical Icon Activity Bar (VS Code / Postman Style)**

---

## 1. Problem Analysis & Goals

1. **Current Layout Pain Point**:
   - The navigation currently renders 10 horizontal text-and-icon tabs (`Home`, `Auth`, `Requests`, `Variables`, `History`, `Data`, `Collections`, `Workflows`, `Config`, `Settings`).
   - In a ~380px extension sidebar, these tabs wrap across 2 cramped rows, consuming 80px+ of vertical space and visually crowding the top of the interface.
2. **Goal**:
   - Replace the horizontal multi-row tab strip with a sleek, 48px **Vertical Activity Bar** on the left side of the sidebar, exactly matching **Concept 1** ([view mockup](file:///C:/Users/praty/.gemini/antigravity/brain/5690b39c-0820-4978-989a-cf3abfa75111/openapi_companion_vertical_activity_bar_1794569311307.jpg)).
   - Group primary feature tabs at the top and utility tabs (`Config`, `Settings`) at the bottom.
   - Reclaim 80px of vertical space for the active panel content (documentation, request parameters, response bodies).
   - Maintain 100% WAI-ARIA accessibility (`role="tablist"` with `aria-orientation="vertical"` and arrow key navigation).

---

## 2. Proposed Architecture & Component Design

### A. Vertical `ActivityBar` / `Tabs` Component (`src/components/Tabs.tsx`)
1. Extend `TabsProps` with `orientation?: 'horizontal' | 'vertical'`:
   - Default remains `'horizontal'` for inline sub-tabs (like in History detail and Fake Data tabs).
   - When `orientation="vertical"`:
     - Container: `flex flex-col justify-between items-center h-full w-12 border-r border-border bg-surface/20 py-2 select-none shrink-0`.
     - **Top Section**:
       - `Home` (`HomeIcon`)
       - `Auth` (`AuthIcon`)
       - `Requests` (`RequestsIcon`)
       - `Variables` (`EnvIcon`)
       - `History` (`HistoryIcon`)
       - `Data` (`DataIcon`)
       - `Collections` (`CollectionsIcon`)
       - `Workflows` (`WorkflowIcon`)
     - **Bottom Section**:
       - `Config` (`ConfigIcon`)
       - `Settings` (`SettingsIcon`)
     - **Styling**:
       - 36x36 rounded icon buttons with tooltips (`title={tab.label}`) and `aria-label={tab.label}`.
       - **Active State**: Deep blue accent indicator (active pill or left vertical accent indicator `bg-primary text-white shadow-sm shadow-primary/30`), with glowing icon.
       - **Inactive State**: `text-muted hover:text-text hover:bg-surface/60 transition-colors`.
     - **Accessibility**:
       - WAI-ARIA `role="tablist"`, `aria-orientation="vertical"`.
       - Arrow key navigation supporting `ArrowUp` and `ArrowDown` to cycle between tabs.

### B. Side Panel Shell Layout (`src/sidepanel/PanelShell.tsx`)
1. Re-structure the root layout into a two-column flex container:
   ```tsx
   <div className="flex h-screen max-h-screen bg-bg text-text overscroll-none overflow-hidden">
     {/* Left: Vertical Activity Bar */}
     <ActivityBar tabs={TABS} activeId={activeTab} onChange={handleTabChange} />

     {/* Right: Main Content Area */}
     <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
       {/* Top Header: Title, Project Selector, Search, Shortcuts, Feedback, Theme */}
       <header className="flex flex-shrink-0 items-center justify-between border-b border-border bg-bg px-3 py-2">
         {/* Title + Project Dropdown + Quick Actions */}
       </header>

       {/* Notifications & Banners (Updates, Stale Tab, Port Change) */}
       {pendingUpdate && ...}
       {staleTab && ...}
       {candidates.length > 0 && ...}

       {/* Active Panel Outlet taking full remaining height */}
       <main role="tabpanel" id={`panel-${activeTab}`} aria-labelledby={`tab-${activeTab}`} className="flex-1 overflow-y-auto overscroll-contain bg-bg">
         <PanelOutlet activeTab={activeTab} ... />
       </main>
     </div>
   </div>
   ```
2. Eliminates `<nav className="border-b ..."><Tabs ... /></nav>` from the header entirely.

### C. In-Page Injected Sidebar (`src/sidebar/SidebarShell.tsx`)
1. Apply the same vertical activity rail layout to the floating in-page companion drawer (`w-[420px] max-h-[85vh]`).
2. Ensures unified visual experience across native Chrome sidepanel and floating in-page mode.

---

## 3. File-by-File Changes

| File | Proposed Changes |
|---|---|
| `src/components/Tabs.tsx` | Add `orientation?: 'horizontal' | 'vertical'`, support vertical layout with top/bottom splitting and `ArrowUp`/`ArrowDown` navigation. |
| `src/components/Tabs.test.tsx` | Add unit tests for `orientation="vertical"` and arrow key cycling. |
| `src/sidepanel/PanelShell.tsx` | Switch from top horizontal nav strip to left vertical activity rail; align header to right column. |
| `src/sidebar/SidebarShell.tsx` | Switch floating companion drawer from top horizontal nav strip to left vertical activity rail. |
| `src/sidepanel/PanelShell.test.tsx` | Verify tablist and tab switching in new layout (all tests continue passing). |
| `src/sidebar/SidebarShell.test.tsx` | Verify tablist and tab switching in new layout (all tests continue passing). |

---

## 4. Verification & Quality Gates

Execute all 7 mandatory CI quality gates locally before concluding:
1. `npm run lint` — 0 errors, 0 warnings
2. `npm run format:check` — 100% conforming Prettier code style (run `npm run format` first)
3. `npm run typecheck` — 0 errors
4. `npm test` — all 126 test suites green
5. `npm audit --omit=dev --audit-level=high` — 0 vulnerabilities
6. `npm run build` — Chrome + Firefox distribution archives generated
7. `npm run test:e2e` — Playwright smoke tests pass

---

## 5. User Review Items

- **Bottom Grouping**: Are you happy with `Config` and `Settings` sitting at the bottom of the vertical rail (like VS Code), with `Home`, `Auth`, `Requests`, `Variables`, `History`, `Data`, `Collections`, `Workflows` in the top group?
- **Tooltips**: Hovering any icon in the rail will display a native browser tooltip with its name.


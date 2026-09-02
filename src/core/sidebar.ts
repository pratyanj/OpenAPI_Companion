/**
 * Cross-browser control of the extension's docked panel.
 *
 * Chrome exposes `chrome.sidePanel`; Firefox exposes `browser.sidebarAction`.
 * They differ enough — how the toolbar click maps to the panel, and how the
 * panel is opened/closed — that the background worker and the panel page talk to
 * this shim instead of an API directly. Chrome behaviour is unchanged; on
 * Firefox the same intents route to `sidebarAction`.
 *
 * Key Firefox constraint: `sidebarAction.open()`, `close()`, and `toggle()` ALL
 * require a direct user-gesture handler (toolbar click, context menu, keyboard
 * shortcut). They CANNOT be called from:
 *   - runtime.onMessage handlers (message from content script)
 *   - tabs.onActivated / tabs.onUpdated (background events)
 *   - Any async callback chain that lost the gesture
 *
 * To close the sidebar from the background, we send a PANEL_PORT message to the
 * sidebar page itself, which calls `window.close()`. This does NOT require a user
 * gesture since it's closing an extension-owned page.
 *
 * ⚠️ The Firefox paths need real-browser verification (no Firefox in CI). See
 * FIREFOX.md.
 */

interface SidebarActionApi {
  open: () => Promise<void>
  close: () => Promise<void>
  toggle: () => Promise<void>
}

/** Firefox's `browser.sidebarAction`, if present. */
export function sidebarAction(): SidebarActionApi | undefined {
  const g = globalThis as {
    browser?: { sidebarAction?: SidebarActionApi }
    chrome?: { sidebarAction?: SidebarActionApi }
  }
  return g.browser?.sidebarAction ?? g.chrome?.sidebarAction
}

/** True when running on Firefox (sidebar_action) rather than Chrome (sidePanel). */
export function usesSidebarAction(): boolean {
  return typeof chrome === 'undefined' || chrome.sidePanel == null
}

/**
 * Wire "clicking the toolbar icon opens the panel". Call once from the
 * background. Chrome does this natively via `openPanelOnActionClick`; Firefox
 * has no such flag, so the action click toggles the sidebar instead.
 */
export function bindActionToPanel(onError: (e: unknown) => void = () => {}): void {
  if (chrome.sidePanel) {
    void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(onError)
    return
  }
  const sa = sidebarAction()
  if (sa) chrome.action?.onClicked?.addListener(() => void sa.toggle().catch(onError))
}

/**
 * Open the panel for a tab/window. Must be called inside a user gesture. On
 * Chrome this targets the tab/window; on Firefox `sidebarAction.open()` opens it
 * for the current window.
 */
export function openPanelFor(
  tab: chrome.tabs.Tab | undefined,
  onError: (e: unknown) => void = () => {},
): void {
  if (chrome.sidePanel) {
    const options =
      tab?.id != null
        ? { tabId: tab.id }
        : tab?.windowId != null
          ? { windowId: tab.windowId }
          : null
    if (options) void chrome.sidePanel.open(options).catch(onError)
    return
  }
  const sa = sidebarAction()
  if (sa) void sa.open().catch(onError)
}

/** Close the docked sidebar across browsers.
 *  NOTE: Only call this from a DIRECT user-gesture handler.
 *  `sidebarAction.close()` is blocked by Firefox in background event listeners.
 *  For programmatic close from the background, send a PANEL_PORT 'close' message
 *  so the sidebar page itself calls window.close().
 */
export function closePanel(onError: (e: unknown) => void = () => {}): void {
  const sa = sidebarAction()
  if (sa && typeof sa.close === 'function') {
    void sa.close().catch(onError)
  }
}

/**
 * Close THIS panel page. Called from inside the panel page (not the background).
 * Both Chrome and Firefox: `window.close()` on an extension-owned page closes
 * the sidebar/side-panel without requiring a user gesture. This is the correct
 * mechanism for closing triggered by background messages (e.g., tab switch).
 * Do NOT call `sidebarAction.close()` here — it requires a user gesture and
 * fails when the sidebar page is responding to a background message.
 */
export function closeSelf(): void {
  window.close()
}

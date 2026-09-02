/**
 * Background service worker (MV3).
 *
 * Runs the storage migration pipeline on install/update, then stays lightweight.
 * It must remain STATELESS — MV3 terminates the worker aggressively, so durable
 * state is rehydrated from storage on wake (planning/07 §9, risk R-03).
 */
import { APP_NAME } from '@/constants'
import { bus } from '@/core/events'
import { MigrationService, chromeLocalArea } from '@/core/storage'
import { OPEN_PANEL_REQUEST, PANEL_PORT, type PanelPortMessage } from '@/content/sidepanel-protocol'
import { bindActionToPanel, openPanelFor, usesSidebarAction, sidebarAction } from '@/core/sidebar'

async function runMigrations(reason: string): Promise<void> {
  const migrations = new MigrationService({ area: chromeLocalArea(), bus })
  // Register schema migrations here as SCHEMA_VERSION increases, e.g.:
  //   migrations.register({ from: 1, to: 2, migrate: async (store) => { ... } })
  const result = await migrations.migrateIfNeeded()
  if (result.ok) {
    console.info(
      `[${APP_NAME}] onInstalled (${reason}); schema ${result.value.from} → ${result.value.to}`,
    )
  } else {
    console.error(`[${APP_NAME}] migration failed (${reason}):`, result.error)
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  void runMigrations(details.reason)
})

// Clicking the toolbar icon opens the panel (Chrome: side panel; Firefox: sidebar).
bindActionToPanel((error) => console.error(`[${APP_NAME}] could not bind action:`, error))

// Firefox only: register a right-click context menu item so the user can open
// the sidebar from the page. Firefox enforces that sidebarAction.open() must be
// called synchronously inside a direct user-gesture handler; a content-script
// message does NOT qualify. A contextMenus click IS a direct gesture, so it works.
if (usesSidebarAction()) {
  chrome.contextMenus?.create(
    {
      id: 'oac-open-sidebar',
      title: 'Open OpenAPI Companion',
      contexts: ['all'],
    },
    () => {
      if (chrome.runtime.lastError) {
        // Menu may already exist if the background restarted without being unloaded.
      }
    },
  )
  chrome.contextMenus?.onClicked.addListener((info) => {
    if (info.menuItemId === 'oac-open-sidebar') {
      const sa = sidebarAction()
      if (sa) void sa.open().catch((e) => console.error(`[${APP_NAME}] sidebar open:`, e))
    }
  })
}

// Windows whose side panel is currently open → the panel's port, so we can ask
// it to close itself. Populated while a panel holds a PANEL_PORT connection.
const openPanels = new Map<number, chrome.runtime.Port>()

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PANEL_PORT) return
  let windowId: number | null = null
  port.onMessage.addListener((message: PanelPortMessage) => {
    if (message.type === 'hello') {
      windowId = message.windowId
      openPanels.set(windowId, port)
    }
  })
  port.onDisconnect.addListener(() => {
    if (windowId != null) openPanels.delete(windowId)
  })
})

/**
 * Open the side panel for the given tab. Must be called synchronously within a
 * user gesture (toolbar handles its own; here it's the keyboard command or the
 * in-page launcher click, whose gesture carries into this worker).
 */
function openSidePanel(tab?: chrome.tabs.Tab): void {
  openPanelFor(tab, (error) => console.error(`[${APP_NAME}] could not open panel:`, error))
}

/** Toggle: close the panel if this window already has one open, else open it. */
function toggleSidePanel(tab?: chrome.tabs.Tab): void {
  // NOTE: on Firefox, sidebarAction.open/toggle can only be called from a direct
  // user-gesture handler (toolbar click, contextMenu click). A runtime.onMessage
  // handler does NOT count — Firefox silently ignores the call. The context menu
  // approach above is the correct path for in-page triggering on Firefox.
  const wid = tab?.windowId
  const open = wid != null ? openPanels.get(wid) : undefined
  if (open) {
    open.postMessage({ type: 'close' } satisfies PanelPortMessage)
    return
  }
  openSidePanel(tab)
}

// Keyboard shortcut (manifest `commands`) → toggle the panel for the active tab.
chrome.commands?.onCommand.addListener((command, tab) => {
  if (command === 'open-side-panel') toggleSidePanel(tab)
})

// Close the side panel whenever the user switches to a different browser tab.
// The panel re-opens automatically if the user navigates back to an OpenAPI page
// via the toolbar icon or keyboard shortcut.
// Implementation: we send a PANEL_PORT 'close' message; the sidebar page calls
// window.close() which works on both Chrome and Firefox without needing a user gesture.
chrome.tabs.onActivated.addListener((activeInfo) => {
  const panel = openPanels.get(activeInfo.windowId)
  if (panel) {
    panel.postMessage({ type: 'close' } satisfies PanelPortMessage)
  }
})

// Firefox only: also close the sidebar when the active tab navigates to a new page.
// On Chrome the side panel stays pinned to a tab and the user controls it; on
// Firefox the sidebar is window-global so closing on navigation is a better UX.
// We use tabs.onUpdated (status:'complete') rather than sidebarAction.close()
// because sidebarAction.close() requires a direct user gesture and is blocked
// inside background event listeners.
if (usesSidebarAction()) {
  chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
    if (changeInfo.status !== 'complete' || !tab.active) return
    const windowId = tab.windowId ?? 0
    const panel = openPanels.get(windowId)
    if (panel) {
      panel.postMessage({ type: 'close' } satisfies PanelPortMessage)
    }
  })
}

chrome.runtime.onStartup?.addListener(() => {
  console.info(`[${APP_NAME}] service worker started`)
})

// Message bridge (content <-> background).
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'PING') {
    sendResponse({ type: 'PONG', app: APP_NAME })
    return false
  }
  // In-page launcher button → toggle the panel for the sender's tab.
  if (message?.type === OPEN_PANEL_REQUEST) {
    toggleSidePanel(sender.tab)
    return false
  }
  return false
})

export {}

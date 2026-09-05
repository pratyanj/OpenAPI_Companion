/**
 * Native Side Panel entry (chrome.sidePanel). Hosts the full UI. It can't touch
 * the Swagger DOM, so it drives the in-page agent over the bridge: RPC for
 * calls, a mirrored read-state for the panel-side Fake Data / Productivity
 * services, and forwarded events for live refreshes.
 */
import { StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import '@/styles/index.css'
import { EmptyState, SearchIcon } from '@/components'
import { StorageService, chromeLocalArea } from '@/core/storage'
import { EventBus } from '@/core/events'
import { ThemeManager } from '@/services'
import type { ProjectMeta } from '@/core/project'
import { FakeDataService } from '@/modules/fake-data'
import { SettingsService, ImportExportService } from '@/modules/settings'
import {
  startBridge,
  fetchState,
  openPagePalette,
  openPagePresetEditor,
  openPageHistoryDetail,
  openPageExtractionRuleModal,
  RemoteSwaggerAdapter,
  createRemoteAuthService,
  createRemoteRequestService,
  createRemoteEnvironmentService,
  createRemoteHistoryService,
  createRemoteCollectionsService,
} from './bridge'
import { STATE_PUSH, PANEL_PORT, type PanelPortMessage } from '@/content/sidepanel-protocol'
import { closeSelf } from '@/core/sidebar'
import { PanelShell } from './PanelShell'

/**
 * Keep a port to the background while this panel is open: announce our window so
 * the launcher/shortcut can toggle, and close ourselves when asked. Runs once,
 * regardless of whether a Swagger page is connected, so the toggle always works.
 */
function connectToggle(): void {
  try {
    const port = chrome.runtime.connect({ name: PANEL_PORT })
    port.onMessage.addListener((message: PanelPortMessage) => {
      if (message.type === 'close') closeSelf()
    })
    void chrome.windows.getCurrent().then((win) => {
      if (win.id != null)
        port.postMessage({ type: 'hello', windowId: win.id } satisfies PanelPortMessage)
    })
  } catch {
    /* messaging unavailable — toggle just falls back to open-only */
  }
}

async function render(root: Root): Promise<void> {
  const state = await fetchState()

  if (!state.context) {
    root.render(
      <StrictMode>
        <div className="flex min-h-screen flex-col justify-center bg-bg p-4 text-text">
          <EmptyState
            icon={<SearchIcon className="h-8 w-8 text-muted" />}
            title="No OpenAPI page connected"
            message="Open a Swagger / OpenAPI page in the active tab to begin."
          />
        </div>
      </StrictMode>,
    )
    // Self-heal: the agent may still be booting on this tab, or the user may
    // switch to / load a Swagger tab. Re-check on tab changes and on the agent's
    // first state push; reload once the ACTIVE tab reports a context (checking
    // the active tab avoids reload loops from background tabs' pushes).
    const recheck = async () => {
      const next = await fetchState()
      if (next.context) location.reload()
    }
    chrome.tabs.onActivated.addListener(() => void recheck())
    chrome.tabs.onUpdated.addListener((_id, info) => {
      if (info.status === 'complete') void recheck()
    })
    chrome.runtime.onMessage.addListener((message: unknown) => {
      if ((message as { type?: string } | null)?.type === STATE_PUSH) void recheck()
    })
    return
  }

  const ctx = state.context

  // The tab answered, but from an older injection than this panel: newer RPC
  // methods don't exist there, so features would silently do nothing. Say so
  // rather than letting the user conclude the feature is broken.
  const staleTab = ctx.buildId !== __BUILD_ID__
  if (staleTab) {
    console.info(
      `[OpenAPI Companion] this tab runs build ${ctx.buildId}, the panel is ${__BUILD_ID__}.`,
    )
  }
  const storage = new StorageService({ area: chromeLocalArea() })
  const bus = new EventBus()
  startBridge(bus)

  const theme = new ThemeManager({ storage, root: document.documentElement, bus })
  await theme.init()

  // Endpoint search is NOT built here: it runs in the page (see content/palette),
  // so it can be a proper top-centered overlay instead of a 400px column.
  const adapter = new RemoteSwaggerAdapter()

  const project: ProjectMeta = {
    id: ctx.projectId,
    name: ctx.projectName,
    originUrl: ctx.pageOrigin,
    openApiUrl: '',
    docType: ctx.docType,
    createdAt: 0,
    lastActiveEnvId: ctx.environmentId,
  }

  root.render(
    <StrictMode>
      <PanelShell
        project={project}
        theme={theme}
        bus={bus}
        environmentId={ctx.environmentId}
        staleTab={staleTab}
        onOpenPalette={openPagePalette}
        onOpenPresetEditor={openPagePresetEditor}
        onOpenHistoryDetail={openPageHistoryDetail}
        onOpenExtractionRuleModal={openPageExtractionRuleModal}
        authService={createRemoteAuthService()}
        requestService={createRemoteRequestService()}
        environmentService={createRemoteEnvironmentService()}
        historyService={createRemoteHistoryService()}
        collectionsService={createRemoteCollectionsService()}
        fakeDataService={new FakeDataService({ adapter, storage, projectId: ctx.projectId, bus })}
        swagger={adapter}
        settingsService={new SettingsService({ storage, bus })}
        importExportService={new ImportExportService({ storage, bus })}
      />
    </StrictMode>,
  )

  // The native panel persists across tabs; if the active tab's project changes
  // (or it becomes/stops being a Swagger page), rebuild by reloading the panel.
  const mountedProjectId = ctx.projectId
  const maybeReload = async () => {
    const next = await fetchState()
    if (next.context?.projectId !== mountedProjectId) location.reload()
  }
  chrome.tabs.onActivated.addListener(() => void maybeReload())
  chrome.tabs.onUpdated.addListener((_id, info) => {
    if (info.status === 'complete') void maybeReload()
  })
}

async function boot(): Promise<void> {
  const rootEl = document.getElementById('root')
  if (!rootEl) return
  connectToggle()
  const root = createRoot(rootEl)
  await render(root)
}

void boot()

/**
 * Content script entry.
 *
 * Detect Swagger via the adapter, identify the project (stable id + default
 * environment) through ProjectService, initialise theming, and mount the
 * sidebar shell into an isolated Shadow DOM so our styles never leak into — or
 * inherit from — the host page. The original documentation is never modified.
 *
 * Tailwind is injected as a string into the Shadow DOM (`?inline`) so the design
 * tokens (:host) and component styles apply inside the shadow tree only.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import shadowCss from '@/styles/index.css?inline'
import { bus } from '@/core/events'
import { StorageService, chromeLocalArea, settingsKey } from '@/core/storage'
import { ProjectService, type ProjectMeta } from '@/core/project'
import { docIdentityUrl } from '@/utils'
import { SwaggerUiAdapter } from '@/adapters'
import { ThemeManager, TokenRefreshService } from '@/services'
import { AuthenticationService } from '@/modules/authentication'
import { RequestService } from '@/modules/request'
import { EnvironmentService } from '@/modules/environment'
import { HistoryService } from '@/modules/history'
import { FakeDataService } from '@/modules/fake-data'
import { ProductivityService } from '@/modules/productivity'
import { SettingsService, ImportExportService } from '@/modules/settings'
import { App } from '@/sidebar/App'
import { SwaggerBridge } from './swagger-bridge'

const CONTAINER_ID = 'openapi-companion-root'
const COLLAPSED_KEY = settingsKey('sidebar-collapsed')

async function boot(): Promise<void> {
  // The MAIN-world script (see manifest) exposes window.ui; this bridge relays
  // auth read/write to it, since content scripts can't see window.ui directly.
  const bridge = new SwaggerBridge()
  const adapter = new SwaggerUiAdapter(bridge)
  if (!adapter.detect()) return // not an OpenAPI page — stay dormant (EC-005)
  if (document.getElementById(CONTAINER_ID)) return // prevent duplicate injection (EC-043)

  const storage = new StorageService({ area: chromeLocalArea(), bus })
  const project = new ProjectService({ storage, bus })
  const identified = await project.identify({
    origin: location.origin,
    // Stable across Swagger's hash routing + refresh so saved data isn't
    // orphaned (must not include the volatile `#/…` fragment).
    openApiUrl: docIdentityUrl(location.href),
    docType: 'swagger-ui',
  })
  const meta: ProjectMeta | null = identified.ok ? identified.value : null

  // Settings + data portability are global (not project-scoped).
  const settingsService = new SettingsService({ storage, bus })
  const importExportService = new ImportExportService({ storage, bus })

  let authService: AuthenticationService | undefined
  let requestService: RequestService | undefined
  let environmentService: EnvironmentService | undefined
  let historyService: HistoryService | undefined
  let fakeDataService: FakeDataService | undefined
  let productivityService: ProductivityService | undefined
  let activeEnvId: string | undefined
  if (meta) {
    const auth = new AuthenticationService({ storage, adapter, projectId: meta.id, bus })
    const requests = new RequestService({ storage, adapter, projectId: meta.id, bus })
    const environments = new EnvironmentService({ storage, projectId: meta.id, bus })
    const history = new HistoryService({ storage, adapter, projectId: meta.id, bus })
    const fakeData = new FakeDataService({ adapter, storage, projectId: meta.id, bus })
    const productivity = new ProductivityService({ adapter, storage, projectId: meta.id, bus })
    await productivity.init()
    authService = auth
    requestService = requests
    environmentService = environments
    historyService = history
    fakeDataService = fakeData
    productivityService = productivity

    let currentEnv = meta.lastActiveEnvId
    activeEnvId = currentEnv

    // Token auto-refresh: when the stored credential is expired and a saved
    // login request exists, run it and capture the fresh token automatically.
    const tokenRefresh = new TokenRefreshService({ adapter, auth, templates: requests, bus })
    bus.subscribe('AUTH_EXPIRED', (payload) => {
      void tokenRefresh.refreshIfExpired(payload.environmentId)
    })

    // Auth (Sprint 4): restore + auto-capture. Requests (Sprint 6): auto-save on
    // edit. History (Sprint 9): record executed responses. All react to Swagger
    // DOM mutations via the adapter's observer.
    await auth.restore(currentEnv) // publishes AUTH_EXPIRED → auto-refresh kicks in
    await requests.autoRestoreOpen(currentEnv)
    let stopAuthWatch = auth.watch(currentEnv)
    adapter.observe(() => {
      requests.autosaveOpen(currentEnv)
      history.scheduleCapture(currentEnv)
    })

    // Environment switch (Sprint 8): re-scope auth + requests to the new env.
    bus.subscribe('ENVIRONMENT_CHANGED', (payload) => {
      void (async () => {
        currentEnv = payload.environmentId
        stopAuthWatch()
        const restored = await auth.restore(currentEnv)
        if (restored.ok && restored.value == null) adapter.clearAuth() // isolate: no cred → log out
        await requests.autoRestoreOpen(currentEnv)
        stopAuthWatch = auth.watch(currentEnv)
      })()
    })
  }

  const collapsedResult = await storage.getData<boolean>(COLLAPSED_KEY)
  const initialCollapsed = collapsedResult.ok && collapsedResult.value === true

  // ── Layout injection ────────────────────────────────────────────────────────
  // The sidebar is position:fixed on the right. A CSS variable --oac-w drives
  // both the host width and the body margin-right, so changing one value in
  // SidebarShell animates the page reflow and the panel together.
  const OPEN_W = '320px'
  const MINI_W = '40px'
  const initW = initialCollapsed ? MINI_W : OPEN_W
  document.documentElement.style.setProperty('--oac-w', initW)

  const layoutStyle = document.createElement('style')
  layoutStyle.id = 'oac-layout-styles'
  layoutStyle.textContent =
    // Push page content left so the sidebar never overlaps it.
    // calc(var + 8px) accounts for the 8px inset gap on the right.
    `body{margin-right:calc(var(--oac-w) + 8px)!important;transition:margin-right 200ms ease}` +
    // The host sits fixed in the viewport, slightly inset so rounded corners show.
    `#${CONTAINER_ID}{position:fixed!important;right:8px;top:8px;` +
    `height:calc(100vh - 16px);width:var(--oac-w);` +
    `transition:width 200ms ease;z-index:2147483647}`
  document.head.appendChild(layoutStyle)

  const host = document.createElement('div')
  host.id = CONTAINER_ID
  document.body.appendChild(host)

  const shadow = host.attachShadow({ mode: 'open' })

  const style = document.createElement('style')
  style.textContent = shadowCss
  shadow.appendChild(style)

  // Mount point fills the fixed host so the sidebar reaches full height.
  const mountPoint = document.createElement('div')
  mountPoint.style.cssText = 'height:100%'
  shadow.appendChild(mountPoint)

  const theme = new ThemeManager({ storage, root: mountPoint, bus })
  await theme.init()

  createRoot(mountPoint).render(
    <StrictMode>
      <App
        project={meta}
        theme={theme}
        bus={bus}
        storage={storage}
        initialCollapsed={initialCollapsed}
        authService={authService}
        requestService={requestService}
        environmentService={environmentService}
        historyService={historyService}
        fakeDataService={fakeDataService}
        productivityService={productivityService}
        settingsService={settingsService}
        importExportService={importExportService}
        environmentId={activeEnvId}
      />
    </StrictMode>,
  )
}

void boot()

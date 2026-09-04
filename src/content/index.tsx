/**
 * Content-script agent.
 *
 * The UI now lives in the native Side Panel (a separate page). This script is
 * the headless "agent" in the Swagger page: it detects the doc, identifies the
 * project, runs all the ALWAYS-ON behaviors (auth restore + watch, request
 * autosave, history capture, token auto-refresh) so they work whether or not the
 * panel is open, and exposes the page to the panel over messaging — RPC for
 * service/adapter calls, a pushed read-state mirror, and forwarded bus events.
 * It never renders UI into the page.
 */
import { ok } from '@/types'
import { bus } from '@/core/events'
import { StorageService, chromeLocalArea } from '@/core/storage'
import { ProjectService, type ProjectMeta } from '@/core/project'
import { docIdentityUrl } from '@/utils'
import { SwaggerUiAdapter, type AuthSnapshot, type RequestSnapshot } from '@/adapters'
import { ThemeManager, TokenRefreshService } from '@/services'
import { AuthenticationService } from '@/modules/authentication'
import { RequestService, type CustomTemplateInput, type RequestPanelService } from '@/modules/request'
import { EnvironmentService, type EnvironmentInput } from '@/modules/environment'
import { HistoryService } from '@/modules/history'
import { ProductivityService } from '@/modules/productivity'
import { CollectionsService } from '@/modules/collections'
import { SwaggerBridge } from './swagger-bridge'
import { mountLauncher } from './launcher'
import type { PaletteHandle } from './palette' // type-only: the module loads lazily
import type { PresetEditorHandle, PresetEditorOpenOptions } from './preset-editor'
import {
  RPC_REQUEST,
  STATE_PUSH,
  EVENT_PUSH,
  FORWARDED_EVENTS,
  type AdapterReadState,
  type PanelContext,
  type PanelState,
  type RpcResponse,
} from './sidepanel-protocol'

const AGENT_FLAG = 'oacAgent'
const LOG = '[OpenAPI Companion]'

async function boot(): Promise<void> {
  console.info(`${LOG} content agent loaded:`, location.href)
  const bridge = new SwaggerBridge()
  const adapter = new SwaggerUiAdapter(bridge)
  if (!adapter.detect()) {
    console.info(`${LOG} no Swagger UI detected on this page — staying dormant.`)
    return // not an OpenAPI page — stay dormant (EC-005)
  }
  if (document.documentElement.dataset[AGENT_FLAG]) {
    console.info(`${LOG} agent already running in this tab — skipping.`)
    return // avoid double-injection (EC-043)
  }
  document.documentElement.dataset[AGENT_FLAG] = '1'

  const storage = new StorageService({ area: chromeLocalArea(), bus })
  const project = new ProjectService({ storage, bus })
  const identified = await project.identify({
    origin: location.origin,
    openApiUrl: docIdentityUrl(location.href), // stable across Swagger's hash routing
    docType: 'swagger-ui',
  })
  const meta: ProjectMeta | null = identified.ok ? identified.value : null
  if (!meta) {
    console.warn(
      `${LOG} could not identify the project:`,
      identified.ok ? 'no meta' : identified.error,
    )
    return
  }
  console.info(
    `${LOG} agent ready — project "${meta.name}" (${meta.id}), build ${__BUILD_ID__}. Open the side panel.`,
  )

  mountLauncher() // floating button to open the panel from the page

  const auth = new AuthenticationService({ storage, adapter, projectId: meta.id, bus })
  const environments = new EnvironmentService({ storage, projectId: meta.id, bus })
  const requests = new RequestService({
    storage,
    adapter,
    projectId: meta.id,
    bus,
    resolveVariables: (text, envId) => environments.resolve(text, envId),
  })
  const history = new HistoryService({ storage, adapter, projectId: meta.id, bus })
  const collections = new CollectionsService({ storage, projectId: meta.id, bus })

  let currentEnv = meta.lastActiveEnvId

  // Active environment's Base URL (read from BASE_URL variable or legacy baseUrl), kept in sync for code generation (below).
  let envBaseUrl = ''
  const refreshEnvBaseUrl = async (): Promise<void> => {
    const env = await environments.get(currentEnv)
    envBaseUrl =
      env.ok && env.value
        ? (env.value.variables?.['BASE_URL'] || env.value.baseUrl || '').trim()
        : ''
  }
  await refreshEnvBaseUrl()

  // Endpoint search runs IN THE PAGE (top-centered overlay) — the panel is too
  // narrow for it and can't draw over the doc. Triggered by ⌘K here, or by the
  // panel's search button over RPC.
  const productivity = new ProductivityService({
    adapter,
    storage,
    projectId: meta.id,
    bus,
    // Generated code (copy as cURL/fetch/axios) targets the ACTIVE environment's
    // Base URL when one is set, else this page's origin. Read per call, so a
    // switch or an edit takes effect without rebuilding the service. (Swagger's
    // own Execute still goes to the spec's server — that part isn't ours.)
    baseUrl: () => envBaseUrl || location.origin,
  })
  await productivity.init()

  // The palette is the only thing in the page that needs React, so it's loaded on
  // FIRST USE — a static import would make every page in the browser pay ~170 kB
  // of React up front just in case the user hits ⌘K.
  let palette: PaletteHandle | null = null
  const withPalette = async (): Promise<PaletteHandle | null> => {
    if (palette) return palette
    try {
      const { mountPalette } = await import('./palette')
      palette = mountPalette(productivity)
      // Theme it from the shared preference, and re-read when the panel changes it
      // (separate contexts, so the bus doesn't cross the boundary — storage does).
      const paletteTheme = new ThemeManager({ storage, root: palette.themeRoot, bus })
      await paletteTheme.init()
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && Object.keys(changes).some((k) => k.includes('theme'))) {
          void paletteTheme.init()
        }
      })
      return palette
    } catch (cause) {
      // Reloading/rebuilding the extension ORPHANS this already-injected script:
      // its chunk filenames are content-hashed, so the lazy import now 404s.
      // Say so plainly instead of leaving an anonymous rejection in the console.
      const orphaned = !chrome.runtime?.id
      console.warn(
        `${LOG} could not load the search palette${
          orphaned ? ' — this tab is running an old copy of the extension.' : '.'
        } Refresh the page (⌘⇧R) to pick up the current build.`,
        cause,
      )
      return null
    }
  }

  let presetEditor: PresetEditorHandle | null = null
  const withPresetEditor = async (): Promise<PresetEditorHandle | null> => {
    if (presetEditor) return presetEditor
    try {
      const { mountPresetEditor } = await import('./preset-editor')
      const requestPanelService: RequestPanelService = {
        listTemplates: () => requests.listTemplates(),
        saveOpenAsTemplate: (name, envId) => requests.saveOpenAsTemplate(name, envId),
        createCustomTemplate: (input) => requests.createCustomTemplate(input),
        updateTemplate: (id, updates) => requests.updateTemplate(id, updates),
        deleteTemplate: (id) => requests.deleteTemplate(id),
        applyTemplate: (id, envId) => requests.applyTemplate(id, envId),
        locateAndFill: (id, envId) => requests.locateAndFill(id, envId),
        listEndpoints: () => adapter.listEndpoints(),
        getOpenRequests: () => adapter.readOpenRequests(),
        getSwaggerDefaults: (epId) => requests.getSwaggerDefaults(epId),
      }
      presetEditor = mountPresetEditor(requestPanelService, environments, bus, currentEnv)
      const editorTheme = new ThemeManager({ storage, root: presetEditor.themeRoot, bus })
      await editorTheme.init()
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && Object.keys(changes).some((k) => k.includes('theme'))) {
          void editorTheme.init()
        }
      })
      return presetEditor
    } catch (cause) {
      console.warn(`${LOG} could not load the in-page preset editor.`, cause)
      return null
    }
  }

  // Capture phase so Swagger's own inputs can't swallow the shortcut. `key` is
  // optional-chained because page scripts can dispatch synthetic keydowns
  // without it, and a TypeError here would kill the whole listener.
  document.addEventListener(
    'keydown',
    (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key?.toLowerCase() === 'k') {
        e.preventDefault()
        void withPalette().then((p) => p?.toggle())
      }
    },
    true,
  )

  // Token auto-refresh (opt-in; toggled from the Auth panel via RPC → runs here).
  let autoRefreshEnabled = await auth.isAutoRefreshEnabled()
  const tokenRefresh = new TokenRefreshService({
    adapter,
    auth,
    templates: requests,
    vault: auth, // its activeLogin() targets the account actually in use
    bus,
    enabled: () => autoRefreshEnabled,
  })
  bus.subscribe(
    'AUTH_EXPIRED',
    (payload) => void tokenRefresh.refreshIfExpired(payload.environmentId),
  )
  bus.subscribe('SETTINGS_UPDATED', (payload) => {
    if (payload.keys.includes('auto-refresh-token')) {
      void auth.isAutoRefreshEnabled().then((on) => (autoRefreshEnabled = on))
    }
  })

  // Always-on: restore auth, auto-restore drafts, watch, and react to DOM changes.
  await auth.restore(currentEnv)
  await requests.autoRestoreOpen(currentEnv)
  let stopAuthWatch = auth.watch(currentEnv)

  // --- Side Panel bridge ----------------------------------------------------

  const buildState = (): PanelState => {
    const context: PanelContext = {
      projectId: meta.id,
      projectName: meta.name,
      docType: meta.docType,
      environmentId: currentEnv,
      pageOrigin: location.origin,
      buildId: __BUILD_ID__,
    }
    const adapterState: AdapterReadState = {
      detect: adapter.detect(),
      version: adapter.version(),
      specUrl: adapter.specUrl(),
      auth: adapter.readAuth(),
      openRequests: adapter.readOpenRequests(),
      executedResponses: adapter.readExecutedResponses(),
      endpoints: adapter.listEndpoints(),
    }
    return { context, adapter: adapterState }
  }

  const safeSendMessage = (msg: unknown): void => {
    try {
      if (
        typeof chrome !== 'undefined' &&
        chrome?.runtime &&
        typeof chrome.runtime.sendMessage === 'function'
      ) {
        const p = chrome.runtime.sendMessage(msg)
        if (p && typeof p.catch === 'function') {
          p.catch(() => {})
        }
      }
    } catch {
      // Extension context invalidated on reload; ignore silently
    }
  }

  let pushTimer: ReturnType<typeof setTimeout> | null = null
  const pushState = (): void => {
    if (pushTimer) clearTimeout(pushTimer)
    pushTimer = setTimeout(() => {
      safeSendMessage({ type: STATE_PUSH, state: buildState() })
    }, 250)
  }

  // An Execute click means a NEW call, so history must not treat an identical
  // response as a duplicate re-read (that silently lost repeat calls).
  adapter.onExecute((endpointId) => history.noticeExecution(endpointId))

  const unobserve = adapter.observe(() => {
    if (typeof chrome === 'undefined' || !chrome?.runtime?.id) {
      if (typeof unobserve === 'function') unobserve()
      return
    }
    requests.autosaveOpen(currentEnv)
    history.scheduleCapture(currentEnv)
    void tokenRefresh.noticeResponses(currentEnv) // 401/403 → auto-refresh (if enabled)
    pushState() // keep the panel's read-mirror fresh
  })

  // Environment switch re-scopes auth + requests (switch runs here via RPC, so
  // its ENVIRONMENT_CHANGED fires on this bus).
  bus.subscribe('ENVIRONMENT_CHANGED', (payload) => {
    void (async () => {
      currentEnv = payload.environmentId
      await refreshEnvBaseUrl()
      stopAuthWatch()
      const restored = await auth.restore(currentEnv)
      if (restored.ok && restored.value == null) adapter.clearAuth()
      await requests.autoRestoreOpen(currentEnv)
      stopAuthWatch = auth.watch(currentEnv)
      pushState()
    })()
  })

  // RPC dispatch: "<service|adapter>.<method>" → the real call.
  const rpc: Record<string, (args: unknown[]) => unknown> = {
    'state.get': () => buildState(),
    // Panel's search button → open the in-page palette (top-centered on the doc).
    'palette.open': () => {
      void withPalette().then((p) => p?.open())
      return ok(undefined)
    },
    // Panel's preset editor → open the in-page editor (spacious overlay on the doc).
    'presetEditor.open': ([options]) => {
      void withPresetEditor().then((p) => p?.open(options as PresetEditorOpenOptions))
      return ok(undefined)
    },
    'history.list': ([q]) => history.list((q as Parameters<typeof history.list>[0]) ?? {}),
    'history.get': ([id]) => history.get(id as string),
    'history.replay': ([id]) => history.replay(id as string),
    'history.locate': ([id]) => history.locate(id as string),
    'history.deleteEntry': ([id]) => history.deleteEntry(id as string),
    'history.clearProject': () => history.clearProject(),
    'auth.current': ([env]) => auth.current(env as string),
    'auth.clear': ([env]) => auth.clear(env as string),
    'auth.isAutoRefreshEnabled': () => auth.isAutoRefreshEnabled(),
    'auth.setAutoRefreshEnabled': ([on]) => auth.setAutoRefreshEnabled(on as boolean),
    'auth.isBearerPrefixEnabled': ([env]) => auth.isBearerPrefixEnabled(env as string),
    'auth.setBearerPrefixEnabled': ([env, on]) =>
      auth.setBearerPrefixEnabled(env as string, on as boolean),
    'auth.loginEndpoint': () => tokenRefresh.findLoginEndpoint(),
    'auth.refreshActivity': () => tokenRefresh.recentActivity(),
    // Add an account: log in with the given credentials, then keep the issued
    // token under `name` with those credentials attached for later refreshes.
    'auth.addByLogin': async ([name, username, password]) => {
      const login = { username: username as string, password: password as string }
      const signedIn = await tokenRefresh.signIn(login)
      if (!signedIn.ok) return signedIn
      return auth.addCredential(name as string, signedIn.value, currentEnv, login)
    },
    'auth.refreshNow': ([env]) => tokenRefresh.refreshNow(env as string),
    'auth.activeCredentialName': ([env]) => auth.activeCredentialName(env as string),
    'auth.loginTemplate': ([env]) =>
      tokenRefresh.findLoginTemplate(env as string).then((t) => t?.name ?? null),
    'auth.listSaved': () => auth.listSaved(),
    'auth.saveAs': ([name, env]) => auth.saveAs(name as string, env as string),
    'auth.activateSaved': ([id, env]) => auth.activateSaved(id as string, env as string),
    'auth.deleteSaved': ([id]) => auth.deleteSaved(id as string),
    'auth.setLogin': ([id, login]) =>
      auth.setLogin(id as string, login as Parameters<typeof auth.setLogin>[1]),
    'requests.listTemplates': () => requests.listTemplates(),
    'requests.saveOpenAsTemplate': ([name, env]) =>
      requests.saveOpenAsTemplate(name as string, env as string),
    'requests.createCustomTemplate': ([input]) =>
      requests.createCustomTemplate(input as CustomTemplateInput),
    'requests.updateTemplate': ([id, updates]) =>
      requests.updateTemplate(
        id as string,
        updates as Parameters<typeof requests.updateTemplate>[1],
      ),
    'requests.locateAndFill': ([id, env]) =>
      requests.locateAndFill(id as string, (env as string) || currentEnv),
    'requests.applyTemplate': ([id, env]) =>
      requests.applyTemplate(id as string, undefined, (env as string) || currentEnv),
    'requests.deleteTemplate': ([id]) => requests.deleteTemplate(id as string),
    'environments.list': () => environments.list(),
    'environments.getActiveId': () => environments.getActiveId(),
    'environments.switch': ([id]) => environments.switch(id as string),
    'environments.create': ([input]) => environments.create(input as EnvironmentInput),
    'environments.update': async ([id, patch]) => {
      const updated = await environments.update(id as string, patch as Partial<EnvironmentInput>)
      await refreshEnvBaseUrl() // update() publishes no event; Base URL may have changed
      return updated
    },
    'environments.delete': ([id]) => environments.delete(id as string),
    'requests.getSwaggerDefaults': ([endpointId]) =>
      requests.getSwaggerDefaults(endpointId as string),
    'adapter.writeRequest': ([id, data]) =>
      adapter.writeRequest(id as string, data as RequestSnapshot),
    'adapter.replay': ([id, body, path, query]) =>
      adapter.replay(
        id as string,
        body as string | undefined,
        path as Record<string, string> | undefined,
        query as Record<string, string> | undefined,
      ),
    'adapter.openEndpoint': ([id]) => adapter.openEndpoint(id as string),
    'adapter.writeAuth': ([a]) => adapter.writeAuth(a as AuthSnapshot),
    'adapter.clearAuth': () => adapter.clearAuth(),
    'collections.list': () => collections.listCollections(),
    'collections.create': ([name]) => collections.createCollection(name as string),
    'collections.update': ([id, updates]) =>
      collections.updateCollection(
        id as string,
        updates as Parameters<typeof collections.updateCollection>[1],
      ),
    'collections.delete': ([id]) => collections.deleteCollection(id as string),
    'collections.addEndpoint': ([collectionId, endpointId]) =>
      collections.addEndpointToCollection(collectionId as string, endpointId as string),
    'collections.removeEndpoint': ([collectionId, endpointId]) =>
      collections.removeEndpointFromCollection(collectionId as string, endpointId as string),
    'collections.importTags': ([groups]) =>
      collections.importTags(groups as Array<{ name: string; endpointIds: string[] }>),
  }

  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    const msg = message as { type?: string; method?: string; args?: unknown[] } | null
    if (msg?.type !== RPC_REQUEST || typeof msg.method !== 'string') return false
    const handler = rpc[msg.method]
    if (!handler) {
      sendResponse({ ok: false, error: `Unknown method: ${msg.method}` } satisfies RpcResponse)
      return false
    }
    void (async () => {
      try {
        sendResponse({ ok: true, value: await handler(msg.args ?? []) } satisfies RpcResponse)
      } catch (cause) {
        sendResponse({
          ok: false,
          error: cause instanceof Error ? cause.message : String(cause),
        } satisfies RpcResponse)
      }
    })()
    return true
  })

  // Forward selected bus events to the panel (best-effort; ignored if closed).
  for (const name of FORWARDED_EVENTS) {
    ;(bus.subscribe as (n: string, h: (p: unknown) => void) => void)(name, (payload) => {
      safeSendMessage({ type: EVENT_PUSH, name, payload })
    })
  }

  pushState() // initial mirror for any already-open panel
}

void boot()

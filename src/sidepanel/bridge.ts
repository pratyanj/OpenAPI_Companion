import { ok, err, type Result, type Unsubscribe } from '@/types'
import type { EventBus } from '@/core/events'
import type {
  AuthSnapshot,
  EndpointInfo,
  ExecutedResponse,
  RequestSnapshot,
  SwaggerAdapter,
  SwaggerChange,
} from '@/adapters'
import type { AuthPanelService } from '@/modules/authentication'
import type { RequestPanelService, RequestTemplate } from '@/modules/request'
import { BUILTIN_ENVIRONMENTS, type EnvironmentPanelService } from '@/modules/environment'
import type { HistoryPanelService } from '@/modules/history'
import type { CollectionsPanelService } from '@/modules/collections'
import {
  RPC_REQUEST,
  STATE_PUSH,
  EVENT_PUSH,
  EMPTY_ADAPTER_STATE,
  type PanelContext,
  type PanelState,
  type RpcResponse,
} from '@/content/sidepanel-protocol'

/**
 * The side panel's link to the in-page agent: RPC for calls, a mirrored read
 * state for the RemoteSwaggerAdapter, and forwarded events onto the local bus.
 */

let latestState: PanelState = { context: null, adapter: EMPTY_ADAPTER_STATE }
const stateListeners = new Set<() => void>()
/** The tab we're bound to — pushes from OTHER Swagger tabs are ignored. */
let activeTabId: number | null = null

/** Low-level RPC to the active tab's agent. Throws on transport failure. */
async function rpc<T>(method: string, args: unknown[]): Promise<T> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) throw new Error('No active tab')
  activeTabId = tab.id
  const res = (await chrome.tabs.sendMessage(tab.id, { type: RPC_REQUEST, method, args })) as
    RpcResponse | undefined
  if (!res) throw new Error('No response from the page')
  if (!res.ok) throw new Error(res.error)
  return res.value as T
}

/** RPC to a method returning a `Result<T>`; transport failure → err Result. */
async function rpcResult<T>(method: string, ...args: unknown[]): Promise<Result<T>> {
  try {
    return await rpc<Result<T>>(method, args)
  } catch (cause) {
    return err({
      code: 'BRIDGE_RPC_FAILED',
      message: cause instanceof Error ? cause.message : String(cause),
      recoverable: true,
    })
  }
}

/** RPC to a method returning a plain value; transport failure → `fallback`. */
async function rpcValue<T>(method: string, fallback: T, ...args: unknown[]): Promise<T> {
  try {
    return await rpc<T>(method, args)
  } catch {
    return fallback
  }
}

/** Wire the runtime message stream: mirror state pushes + forward bus events. */
export function startBridge(bus: EventBus): void {
  chrome.runtime.onMessage.addListener((message: unknown, sender) => {
    const m = message as {
      type?: string
      state?: PanelState
      name?: string
      payload?: unknown
    } | null
    // With several Swagger tabs open, each agent broadcasts; only mirror the
    // one we're bound to (activeTabId is set by the last rpc/fetchState).
    if (sender.tab?.id != null && activeTabId != null && sender.tab.id !== activeTabId) return
    if (m?.type === STATE_PUSH && m.state) {
      latestState = m.state
      stateListeners.forEach((l) => l())
    } else if (m?.type === EVENT_PUSH && typeof m.name === 'string') {
      ;(bus.publish as (name: string, payload: unknown) => void)(m.name, m.payload)
    }
  })
}

/** Pull the current state from the agent (used on boot + tab changes). */
export async function fetchState(): Promise<PanelState> {
  try {
    latestState = await rpc<PanelState>('state.get', [])
  } catch (cause) {
    // Common causes: active tab isn't a Swagger page, the agent hasn't finished
    // booting yet, or the Swagger tab needs a refresh after an extension reload.
    console.info(
      '[OpenAPI Companion] side panel could not reach the page agent:',
      cause instanceof Error ? cause.message : String(cause),
    )
    latestState = { context: null, adapter: EMPTY_ADAPTER_STATE }
  }
  stateListeners.forEach((l) => l())
  return latestState
}

export function currentContext(): PanelContext | null {
  return latestState.context
}

/**
 * SwaggerAdapter for the panel: sync reads come from the mirrored state; writes
 * are fire-and-forget commands to the agent (their effect returns via the next
 * state push). Lets the REAL Fake Data / Productivity services run here unchanged.
 */
export class RemoteSwaggerAdapter implements SwaggerAdapter {
  private readonly observers = new Set<(change: SwaggerChange) => void>()

  constructor() {
    stateListeners.add(() =>
      this.observers.forEach((cb) =>
        cb({ kind: 'request', snapshot: { endpointId: 'unknown', method: 'unknown' } }),
      ),
    )
  }

  detect(): boolean {
    return latestState.adapter.detect
  }
  version(): string | null {
    return latestState.adapter.version
  }
  specUrl(): string | null {
    return latestState.adapter.specUrl
  }
  readAuth(): AuthSnapshot | null {
    return latestState.adapter.auth
  }
  writeAuth(auth: AuthSnapshot): Result<void> {
    void rpcResult('adapter.writeAuth', auth)
    return ok(undefined)
  }
  clearAuth(): Result<void> {
    void rpcResult('adapter.clearAuth')
    return ok(undefined)
  }
  readOpenRequests(): RequestSnapshot[] {
    return latestState.adapter.openRequests
  }
  writeRequest(endpointId: string, data: RequestSnapshot): Result<void> {
    void rpcResult('adapter.writeRequest', endpointId, data)
    return ok(undefined)
  }
  replay(endpointId: string, body?: string): Result<void> {
    void rpcResult('adapter.replay', endpointId, body)
    return ok(undefined)
  }
  isRequestBodyEmpty(endpointId: string): boolean {
    const req = latestState.adapter.openRequests.find((r) => r.endpointId === endpointId)
    return req != null && (req.body == null || req.body.trim() === '')
  }
  readExecutedResponses(): ExecutedResponse[] {
    return latestState.adapter.executedResponses
  }
  listEndpoints(): EndpointInfo[] {
    return latestState.adapter.endpoints
  }
  openEndpoint(endpointId: string): Result<void> {
    void rpcResult('adapter.openEndpoint', endpointId)
    return ok(undefined)
  }
  onExecute(): Unsubscribe {
    return () => {} // clicks happen in the page; only the in-page agent sees them
  }
  observe(cb: (change: SwaggerChange) => void): Unsubscribe {
    this.observers.add(cb)
    return () => this.observers.delete(cb)
  }
}

// --- Remote service proxies (the async panels) ------------------------------

export function createRemoteAuthService(): AuthPanelService {
  return {
    current: (env) => rpcResult('auth.current', env),
    clear: (env) => rpcResult('auth.clear', env),
    isAutoRefreshEnabled: () => rpcValue('auth.isAutoRefreshEnabled', false),
    setAutoRefreshEnabled: (on) => rpcResult('auth.setAutoRefreshEnabled', on),
    isBearerPrefixEnabled: (env) => rpcValue('auth.isBearerPrefixEnabled', true, env),
    setBearerPrefixEnabled: (env, on) => rpcResult('auth.setBearerPrefixEnabled', env, on),
    loginEndpoint: () => rpcValue('auth.loginEndpoint', null),
    refreshActivity: () => rpcValue('auth.refreshActivity', []),
    addByLogin: (name, username, password) =>
      rpcResult('auth.addByLogin', name, username, password),
    refreshNow: (env) => rpcResult('auth.refreshNow', env),
    loginTemplate: (env) => rpcValue('auth.loginTemplate', null, env),
    listSaved: () => rpcResult('auth.listSaved'),
    saveAs: (name, env) => rpcResult('auth.saveAs', name, env),
    activateSaved: (id, env) => rpcResult('auth.activateSaved', id, env),
    deleteSaved: (id) => rpcResult('auth.deleteSaved', id),
    setLogin: (id, login) => rpcResult('auth.setLogin', id, login),
  }
}

export function createRemoteRequestService(): RequestPanelService {
  return {
    listTemplates: () => rpcResult('requests.listTemplates'),
    saveOpenAsTemplate: (name, env) => rpcResult('requests.saveOpenAsTemplate', name, env),
    createCustomTemplate: (input) => rpcResult('requests.createCustomTemplate', input),
    updateTemplate: (id, updates) => rpcResult('requests.updateTemplate', id, updates),
    deleteTemplate: (id) => rpcResult('requests.deleteTemplate', id),
    applyTemplate: (id, env) =>
      rpcResult('requests.applyTemplate', id, env ?? latestState.context?.environmentId),
    locateAndFill: (id, env) =>
      rpcResult('requests.locateAndFill', id, env ?? latestState.context?.environmentId),
    listEndpoints: () => latestState.adapter.endpoints,
    getOpenRequests: () => latestState.adapter.openRequests,
  }
}

export function createRemoteEnvironmentService(): EnvironmentPanelService {
  return {
    list: () => rpcResult('environments.list'),
    getActiveId: () => rpcValue('environments.getActiveId', 'default'),
    switch: (id) => rpcResult('environments.switch', id),
    create: (input) => rpcResult('environments.create', input),
    update: (id, patch) => rpcResult('environments.update', id, patch),
    delete: (id) => rpcResult('environments.delete', id),
    listBuiltins: () => BUILTIN_ENVIRONMENTS,
  }
}

/**
 * Ask the page to open its command palette. Endpoint search lives in the page
 * (top-centered over the doc) because the panel can't draw outside its own column.
 */
export function openPagePalette(): void {
  void rpcResult('palette.open')
}

/**
 * Ask the page to open its Request Preset Editor overlay.
 * Lives in the page (top-centered, 672px+ wide) for ample space.
 */
export function openPagePresetEditor(options?: {
  template?: RequestTemplate | null
  initialEndpointId?: string
  initialBody?: string
  initialName?: string
}): void {
  void rpcResult('presetEditor.open', options)
}

export function createRemoteHistoryService(): HistoryPanelService {
  return {
    list: (query) => rpcResult('history.list', query),
    get: (id) => rpcResult('history.get', id),
    replay: (id) => rpcResult('history.replay', id),
    locate: (endpointId) => {
      void rpcResult('history.locate', endpointId)
      return ok(undefined)
    },
    deleteEntry: (id) => rpcResult('history.deleteEntry', id),
    clearProject: () => rpcResult('history.clearProject'),
  }
}

export function createRemoteCollectionsService(): CollectionsPanelService {
  return {
    listCollections: () => rpcResult('collections.list'),
    createCollection: (name) => rpcResult('collections.create', name),
    updateCollection: (id, updates) => rpcResult('collections.update', id, updates),
    deleteCollection: (id) => rpcResult('collections.delete', id),
    addEndpointToCollection: (collectionId, endpointId) =>
      rpcResult('collections.addEndpoint', collectionId, endpointId),
    removeEndpointFromCollection: (collectionId, endpointId) =>
      rpcResult('collections.removeEndpoint', collectionId, endpointId),
    /** Reads from the pushed adapter mirror — no round-trip needed. */
    listEndpoints: () => latestState.adapter.endpoints,
    /** Fire-and-forget: tells the page agent to scroll to + expand the endpoint. */
    openEndpoint: (endpointId) => {
      void rpcResult('adapter.openEndpoint', endpointId)
    },
    /** Execute/replay the endpoint in Swagger. */
    replayEndpoint: (endpointId, body) => rpcResult('adapter.replay', endpointId, body),
    /** Auto-generate / populate collections from Swagger tags. */
    importTags: (groups) => rpcResult('collections.importTags', groups),
    /** Read open or recently executed request body from the mirrored adapter state. */
    getStoredRequestBody: (endpointId) => {
      const open = latestState.adapter.openRequests.find((r) => r.endpointId === endpointId)
      if (open?.body && open.body.trim()) return open.body.trim()
      const exec = latestState.adapter.executedResponses.find((r) => r.endpointId === endpointId)
      if (exec?.requestBody && exec.requestBody.trim()) return exec.requestBody.trim()
      return null
    },
  }
}

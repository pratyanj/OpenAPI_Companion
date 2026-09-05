/**
 * Contract between the native Side Panel (a separate extension page that can't
 * touch the Swagger DOM) and the in-page content-script "agent" (which can).
 *
 * The panel drives the agent two ways:
 *  - **RPC** (`"<service>.<method>"`): calls the agent's real services/adapter and
 *    returns their value (usually a `Result`).
 *  - **State push** (`STATE_PUSH`): the agent broadcasts its context + a
 *    serialized read-snapshot of the Swagger DOM, so panel-side services that
 *    read synchronously (Fake Data, Productivity) can do so from a local mirror.
 *  - **Event push** (`EVENT_PUSH`): the agent mirrors bus events so the panel's
 *    `useEventBus` refreshes and toasts keep working across the boundary.
 */
import type { AuthSnapshot, EndpointInfo, ExecutedResponse, RequestSnapshot } from '@/adapters'

// --- Context (who/what the active tab is) ----------------------------------

export interface PanelContext {
  projectId: string
  projectName: string
  docType: string
  environmentId: string
  /** The Swagger page's origin — used as the base URL for generated code. */
  pageOrigin: string
  /**
   * Build stamp of the content script answering. If it differs from the panel's
   * own, this tab is still running an older injection and needs a refresh —
   * otherwise newer RPC methods simply fail and the UI looks broken.
   */
  buildId: string
}

// --- Adapter read-snapshot (mirrors the SwaggerAdapter's sync reads) --------

export interface AdapterReadState {
  detect: boolean
  version: string | null
  specUrl: string | null
  auth: AuthSnapshot | null
  openRequests: RequestSnapshot[]
  executedResponses: ExecutedResponse[]
  endpoints: EndpointInfo[]
}

export interface PanelState {
  context: PanelContext | null
  adapter: AdapterReadState
}

export const EMPTY_ADAPTER_STATE: AdapterReadState = {
  detect: false,
  version: null,
  specUrl: null,
  auth: null,
  openRequests: [],
  executedResponses: [],
  endpoints: [],
}

// --- Messages ---------------------------------------------------------------

/** Panel → agent: call `"<service>.<method>"(...(args))`; response is `RpcResponse`. */
export const RPC_REQUEST = 'oac:rpc'
export interface RpcRequest {
  type: typeof RPC_REQUEST
  method: string
  args: unknown[]
}
/** Transport envelope; `.value` holds the method's own return (often a Result). */
export type RpcResponse = { ok: true; value: unknown } | { ok: false; error: string }

/** Agent → panel broadcast: latest context + adapter read-snapshot. */
export const STATE_PUSH = 'oac:state'
export interface StatePush {
  type: typeof STATE_PUSH
  state: PanelState
}

/**
 * Content → background: the launcher button was clicked; TOGGLE the side panel.
 * Must be handled promptly so the click's user gesture still authorizes
 * `chrome.sidePanel.open()` when the panel is currently closed.
 */
export const OPEN_PANEL_REQUEST = 'oac:open-panel'

/**
 * Long-lived port an OPEN side panel keeps to the background. It lets the
 * background know which browser windows currently have the panel open (so the
 * launcher/shortcut can toggle) and lets the background tell the panel to close
 * itself (`{ type: 'close' }` → `window.close()`). The panel announces its
 * window with `{ type: 'hello', windowId }` right after connecting.
 */
export const PANEL_PORT = 'oac:panel'
export type PanelPortMessage = { type: 'hello'; windowId: number } | { type: 'close' }

/** Agent → panel broadcast: a forwarded bus event (keeps the panel UI live). */
export const EVENT_PUSH = 'oac:event'
export interface EventPush {
  type: typeof EVENT_PUSH
  name: string
  payload: unknown
}

/** Bus events the agent mirrors to the panel. */
export const FORWARDED_EVENTS = [
  'HISTORY_RECORDED',
  'HISTORY_CLEARED',
  'REQUEST_REPLAYED',
  'REQUEST_CHANGED',
  'REQUEST_RESTORED',
  'AUTH_UPDATED',
  'AUTH_RESTORED',
  'AUTH_CLEARED',
  'AUTH_EXPIRED',
  'ENVIRONMENT_CHANGED',
  'ENVIRONMENT_CREATED',
  'ENVIRONMENT_DELETED',
  'EXTRACTION_RULE_SAVED',
  'EXTRACTION_RULE_DELETED',
  'VARIABLE_AUTO_EXTRACTED',
  'TEMPLATE_SAVED',
  'TEMPLATE_DELETED',
  'COLLECTION_CREATED',
  'COLLECTION_UPDATED',
  'COLLECTION_DELETED',
  'COLLECTION_ENDPOINT_ADDED',
  'COLLECTION_ENDPOINT_REMOVED',
  'WORKFLOW_SAVED',
  'WORKFLOW_DELETED',
  'WORKFLOW_STARTED',
  'WORKFLOW_STEP_COMPLETED',
  'WORKFLOW_COMPLETED',
  'NOTIFY',
] as const

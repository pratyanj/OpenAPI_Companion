import type { Unsubscribe } from '@/types'
import type { AuthSnapshot } from '@/adapters'
import { BRIDGE_TAG, isInbound, type BridgeOutbound } from './swagger-protocol'

/**
 * ISOLATED-world client for the MAIN-world script. Caches the latest auth
 * snapshot (so the adapter's `readAuth()` can stay synchronous) and relays
 * write/clear commands.
 *
 * Commands are sent immediately AND remembered, so if the MAIN world announces
 * `ready` later (either load order), the last command is re-applied — no fragile
 * "wait for ready" gate that could drop a restore.
 */
export class SwaggerBridge {
  private readonly win: Window
  private latestAuth: AuthSnapshot | null = null
  private specUrlValue: string | null = null
  private versionValue: string | null = null
  private lastCommand: BridgeOutbound | null = null
  private readonly authListeners = new Set<(snapshot: AuthSnapshot | null) => void>()

  constructor(win: Window = window) {
    this.win = win
    this.win.addEventListener('message', this.onMessage)
    // Prompt the MAIN world to announce (covers "isolated loaded first").
    this.post({ tag: BRIDGE_TAG, dir: 'to-main', cmd: 'readAuth' })
  }

  getAuth(): AuthSnapshot | null {
    return this.latestAuth
  }
  getSpecUrl(): string | null {
    return this.specUrlValue
  }
  getVersion(): string | null {
    return this.versionValue
  }

  writeAuth(snapshot: AuthSnapshot): void {
    this.post({ tag: BRIDGE_TAG, dir: 'to-main', cmd: 'writeAuth', snapshot }, true)
  }
  clearAuth(): void {
    this.post({ tag: BRIDGE_TAG, dir: 'to-main', cmd: 'clearAuth' }, true)
  }

  onAuth(listener: (snapshot: AuthSnapshot | null) => void): Unsubscribe {
    this.authListeners.add(listener)
    return () => this.authListeners.delete(listener)
  }

  dispose(): void {
    this.win.removeEventListener('message', this.onMessage)
    this.authListeners.clear()
  }

  private readonly onMessage = (event: MessageEvent): void => {
    if ((event.source && event.source !== this.win) || !isInbound(event.data)) return
    const message = event.data
    if (message.type === 'ready') {
      this.specUrlValue = message.specUrl
      this.versionValue = message.version
      // MAIN (re)announced — re-apply the last command in case it was missed.
      if (this.lastCommand) this.win.postMessage(this.lastCommand, '*')
    } else if (message.type === 'auth') {
      this.latestAuth = message.snapshot
      for (const listener of this.authListeners) listener(this.latestAuth)
    }
  }

  private post(message: BridgeOutbound, remember = false): void {
    if (remember) this.lastCommand = message
    this.win.postMessage(message, '*')
  }
}

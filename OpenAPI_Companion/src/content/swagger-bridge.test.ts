import { describe, it, expect, vi, afterEach } from 'vitest'
import { SwaggerBridge } from './swagger-bridge'
import { BRIDGE_TAG } from './swagger-protocol'
import type { AuthSnapshot } from '@/adapters'

function fromMain(data: unknown): void {
  window.dispatchEvent(new MessageEvent('message', { data, source: window }))
}

describe('SwaggerBridge', () => {
  const bridges: SwaggerBridge[] = []
  const make = () => {
    const b = new SwaggerBridge(window)
    bridges.push(b)
    return b
  }

  afterEach(() => {
    bridges.splice(0).forEach((b) => b.dispose())
    vi.restoreAllMocks()
  })

  it('caches auth from a from-main message and notifies listeners', () => {
    const bridge = make()
    const seen = vi.fn()
    bridge.onAuth(seen)
    const snapshot: AuthSnapshot = { type: 'bearer', token: 't', schemeName: 'bearerAuth' }

    fromMain({ tag: BRIDGE_TAG, dir: 'from-main', type: 'auth', snapshot })

    expect(bridge.getAuth()).toEqual(snapshot)
    expect(seen).toHaveBeenCalledWith(snapshot)
  })

  it('records spec URL and version from the ready handshake', () => {
    const bridge = make()
    fromMain({
      tag: BRIDGE_TAG,
      dir: 'from-main',
      type: 'ready',
      specUrl: 'https://api/o.json',
      version: '5.0.0',
    })
    expect(bridge.getSpecUrl()).toBe('https://api/o.json')
    expect(bridge.getVersion()).toBe('5.0.0')
  })

  it('sends a command immediately and re-sends it when MAIN announces ready', () => {
    const bridge = make()
    const command = {
      tag: BRIDGE_TAG,
      dir: 'to-main',
      cmd: 'writeAuth',
      snapshot: { type: 'bearer', token: 't', schemeName: 'bearerAuth' },
    }
    const post = vi.spyOn(window, 'postMessage')

    bridge.writeAuth({ type: 'bearer', token: 't', schemeName: 'bearerAuth' })
    expect(post).toHaveBeenCalledWith(command, '*') // sent immediately

    post.mockClear()
    fromMain({ tag: BRIDGE_TAG, dir: 'from-main', type: 'ready', specUrl: null, version: null })
    expect(post).toHaveBeenCalledWith(command, '*') // re-applied on ready
  })

  it('ignores malformed or outbound-shaped messages', () => {
    const bridge = make()
    fromMain({ foo: 'bar' })
    fromMain({ tag: BRIDGE_TAG, dir: 'to-main', cmd: 'readAuth' })
    expect(bridge.getAuth()).toBeNull()
  })
})

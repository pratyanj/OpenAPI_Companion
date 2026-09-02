import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mountLauncher } from './launcher'
import { OPEN_PANEL_REQUEST } from './sidepanel-protocol'

describe('mountLauncher', () => {
  const sendMessage = vi.fn(() => Promise.resolve())

  beforeEach(() => {
    sendMessage.mockClear()
    vi.stubGlobal('chrome', {
      runtime: { sendMessage, getURL: (p: string) => `chrome-extension://test/${p}` },
    })
    document.body.innerHTML = ''
  })
  afterEach(() => vi.unstubAllGlobals())

  const button = () =>
    document.getElementById('oac-launcher-host')?.shadowRoot?.querySelector('button') ?? null

  it('injects a shadow-isolated launcher button showing the app icon', () => {
    mountLauncher()
    const host = document.getElementById('oac-launcher-host')
    expect(host).not.toBeNull()
    expect(host?.shadowRoot).not.toBeNull() // styles/markup are isolated
    expect(button()?.getAttribute('aria-label')).toBe('Toggle OpenAPI Companion')
    const img = host?.shadowRoot?.querySelector('img')
    expect(img?.getAttribute('src')).toContain('icons/icon-128.png')
  })

  it('asks the background to open the panel when clicked', () => {
    mountLauncher()
    button()?.click()
    expect(sendMessage).toHaveBeenCalledWith({ type: OPEN_PANEL_REQUEST })
  })

  it('is idempotent — a second mount does not add a second button', () => {
    mountLauncher()
    mountLauncher()
    expect(document.querySelectorAll('#oac-launcher-host')).toHaveLength(1)
  })

  it('removes the launcher when the returned disposer runs', () => {
    const remove = mountLauncher()
    remove()
    expect(document.getElementById('oac-launcher-host')).toBeNull()
  })

  // Firefox: the floating launcher is not mounted at all because the button cannot
  // open Firefox's sidebar (sidebarAction.open() requires a user gesture, which is
  // lost in the content-script → background message hop). Firefox users use the
  // toolbar icon or Ctrl+Alt+O keyboard shortcut instead.
  it('does not inject anything on Firefox', () => {
    const original = navigator.userAgent
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Macintosh) Gecko/20100101 Firefox/128.0',
      configurable: true,
    })
    try {
      const remove = mountLauncher()
      expect(document.getElementById('oac-launcher-host')).toBeNull()
      remove() // disposer must be a no-op
      expect(document.getElementById('oac-launcher-host')).toBeNull()
    } finally {
      Object.defineProperty(navigator, 'userAgent', { value: original, configurable: true })
    }
  })
})

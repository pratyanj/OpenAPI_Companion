import { describe, it, expect, vi, afterEach } from 'vitest'
import { bindActionToPanel, openPanelFor, closeSelf, usesSidebarAction } from './sidebar'

/* eslint-disable @typescript-eslint/no-explicit-any -- terse browser API doubles */
afterEach(() => vi.unstubAllGlobals())

function chromeWithSidePanel() {
  const sidePanel = {
    setPanelBehavior: vi.fn(() => Promise.resolve()),
    open: vi.fn(() => Promise.resolve()),
  }
  const onClicked = { addListener: vi.fn() }
  vi.stubGlobal('chrome', { sidePanel, action: { onClicked } })
  return { sidePanel, onClicked }
}

function firefoxWithSidebarAction() {
  const sidebarAction = {
    open: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
    toggle: vi.fn(() => Promise.resolve()),
  }
  const onClicked = { addListener: vi.fn() }
  // Firefox: no chrome.sidePanel; browser.sidebarAction present.
  vi.stubGlobal('chrome', { action: { onClicked } })
  vi.stubGlobal('browser', { sidebarAction })
  return { sidebarAction, onClicked }
}

describe('sidebar shim — Chrome (sidePanel)', () => {
  it('detects Chrome and drives sidePanel', () => {
    const { sidePanel, onClicked } = chromeWithSidePanel()
    expect(usesSidebarAction()).toBe(false)

    bindActionToPanel()
    expect(sidePanel.setPanelBehavior).toHaveBeenCalledWith({ openPanelOnActionClick: true })
    expect(onClicked.addListener).not.toHaveBeenCalled() // Chrome opens natively

    openPanelFor({ id: 7, windowId: 1 } as any, () => {})
    expect(sidePanel.open).toHaveBeenCalledWith({ tabId: 7 })
  })

  it('closeSelf uses window.close on Chrome', () => {
    chromeWithSidePanel()
    const spy = vi.spyOn(window, 'close').mockImplementation(() => {})
    closeSelf()
    expect(spy).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })
})

describe('sidebar shim — Firefox (sidebarAction)', () => {
  it('detects Firefox and drives sidebarAction', () => {
    const { sidebarAction, onClicked } = firefoxWithSidebarAction()
    expect(usesSidebarAction()).toBe(true)

    bindActionToPanel()
    // Firefox has no native action→panel, so it wires a toggle on click.
    expect(onClicked.addListener).toHaveBeenCalledTimes(1)
    onClicked.addListener.mock.calls[0]![0]()
    expect(sidebarAction.toggle).toHaveBeenCalledTimes(1)

    openPanelFor(undefined, () => {})
    expect(sidebarAction.open).toHaveBeenCalledTimes(1)
  })

  it('closeSelf uses window.close on Firefox (not sidebarAction.close which requires user gesture)', () => {
    const { sidebarAction } = firefoxWithSidebarAction()
    const winClose = vi.spyOn(window, 'close').mockImplementation(() => {})
    closeSelf()
    // Must use window.close() — sidebarAction.close() is blocked by Firefox
    // when called from a background message handler (no user gesture).
    expect(winClose).toHaveBeenCalledTimes(1)
    expect(sidebarAction.close).not.toHaveBeenCalled()
    winClose.mockRestore()
  })
})
/* eslint-enable @typescript-eslint/no-explicit-any */

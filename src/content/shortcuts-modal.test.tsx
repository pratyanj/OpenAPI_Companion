import { describe, it, expect, vi, afterEach } from 'vitest'
import { act } from '@testing-library/react'
import { ok } from '@/types'
import { EventBus } from '@/core/events'
import type { SettingsApi } from '@/modules/settings/settings-service'
import { DEFAULT_PREFERENCES } from '@/modules/settings/types'
import { DEFAULT_SHORTCUTS } from '@/modules/shortcuts'
import { mountShortcutsModal } from './shortcuts-modal'

function mockSettingsService(): SettingsApi {
  return {
    getPreferences: vi.fn(async () => ({
      ...DEFAULT_PREFERENCES,
      shortcuts: { ...DEFAULT_SHORTCUTS },
    })),
    setPreference: vi.fn(async () => ok(undefined)),
    setSwaggerFeature: vi.fn(async () => ok(undefined)),
    resetPreferences: vi.fn(async () => ok(undefined)),
    getStorageMetrics: vi.fn(async () => ({ totalBytes: 0, projects: [] })),
    clearProject: vi.fn(async () => ok(0)),
    clearAll: vi.fn(async () => ok(undefined)),
  }
}

describe('mountShortcutsModal (in-page keyboard shortcuts modal overlay)', () => {
  afterEach(() => {
    document.getElementById('oac-shortcuts-host')?.remove()
  })

  const shadow = () => document.getElementById('oac-shortcuts-host')?.shadowRoot ?? null
  const dialog = () => shadow()?.querySelector('[role="dialog"]') ?? null

  it('injects shadow host but renders nothing until opened', async () => {
    const bus = new EventBus()
    const overlay = mountShortcutsModal(mockSettingsService(), bus)
    expect(shadow()).not.toBeNull()
    expect(overlay.isOpen()).toBe(false)
    expect(dialog()).toBeNull()
    await act(async () => {
      overlay.destroy()
    })
  })

  it('opens and closes the dialog via imperative handle', async () => {
    const bus = new EventBus()
    const settings = mockSettingsService()
    const modal = mountShortcutsModal(settings, bus)

    await act(async () => {
      modal.open()
    })

    expect(modal.isOpen()).toBe(true)
    expect(dialog()).not.toBeNull()
    expect(dialog()?.getAttribute('aria-label')).toBe('Keyboard Shortcuts')

    await act(async () => {
      modal.close()
    })

    expect(modal.isOpen()).toBe(false)
    expect(dialog()).toBeNull()
    await act(async () => {
      modal.destroy()
    })
  })

  it('toggles the dialog state', async () => {
    const bus = new EventBus()
    const settings = mockSettingsService()
    const modal = mountShortcutsModal(settings, bus)

    await act(async () => {
      modal.toggle()
    })
    expect(modal.isOpen()).toBe(true)

    await act(async () => {
      modal.toggle()
    })
    expect(modal.isOpen()).toBe(false)
    await act(async () => {
      modal.destroy()
    })
  })
})

import { describe, it, expect, vi, afterEach } from 'vitest'
import { act } from '@testing-library/react'
import { ok } from '@/types'
import { EventBus } from '@/core/events'
import type { EnvironmentPanelService } from '@/modules/environment'
import { mountVariablesModal } from './variables-modal'

function mockEnvService(): EnvironmentPanelService {
  return {
    list: vi.fn(async () =>
      ok([
        {
          id: 'default',
          name: 'Development',
          baseUrl: 'https://api.dev.local',
          variables: { TOKEN: 'abc-123' },
          secrets: ['TOKEN'],
          updatedAt: 0,
        },
      ]),
    ),
    getActiveId: vi.fn(async () => 'default'),
    update: vi.fn(async () =>
      ok({
        id: 'default',
        name: 'Development',
        baseUrl: 'https://api.dev.local',
        variables: {},
        secrets: [],
        updatedAt: 0,
      }),
    ),
    create: vi.fn(),
    delete: vi.fn(),
  }
}

describe('mountVariablesModal (in-page quick variables overlay)', () => {
  afterEach(() => {
    document.getElementById('oac-variables-host')?.remove()
  })

  const shadow = () => document.getElementById('oac-variables-host')?.shadowRoot ?? null
  const dialog = () => shadow()?.querySelector('[role="dialog"]') ?? null

  it('injects shadow host but renders nothing until opened', async () => {
    const bus = new EventBus()
    const modal = mountVariablesModal(mockEnvService(), bus)
    expect(shadow()).not.toBeNull()
    expect(modal.isOpen()).toBe(false)
    expect(dialog()).toBeNull()
    await act(async () => {
      modal.destroy()
    })
  })

  it('opens and closes via imperative handle', async () => {
    const bus = new EventBus()
    const modal = mountVariablesModal(mockEnvService(), bus)

    await act(async () => {
      modal.open()
    })

    expect(modal.isOpen()).toBe(true)
    expect(dialog()).not.toBeNull()
    expect(dialog()?.getAttribute('aria-label')).toBe('Project Variables')

    await act(async () => {
      modal.close()
    })

    expect(modal.isOpen()).toBe(false)
    expect(dialog()).toBeNull()

    await act(async () => {
      modal.destroy()
    })
  })

  it('toggles open and closed state', async () => {
    const bus = new EventBus()
    const modal = mountVariablesModal(mockEnvService(), bus)

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

  it('cleans up DOM and root on destroy', async () => {
    const bus = new EventBus()
    const modal = mountVariablesModal(mockEnvService(), bus)

    await act(async () => {
      modal.open()
    })
    expect(document.getElementById('oac-variables-host')).not.toBeNull()

    await act(async () => {
      modal.destroy()
    })
    expect(document.getElementById('oac-variables-host')).toBeNull()
  })
})

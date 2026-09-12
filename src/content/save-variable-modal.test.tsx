import { describe, it, expect, vi, afterEach } from 'vitest'
import { act } from '@testing-library/react'
import { ok } from '@/types'
import { EventBus } from '@/core/events'
import type { EnvironmentPanelService } from '@/modules/environment'
import { mountSaveVariableModal } from './save-variable-modal'

function mockEnvService(): EnvironmentPanelService {
  return {
    list: vi.fn(async () =>
      ok([
        {
          id: 'default',
          name: 'Default',
          baseUrl: '',
          variables: { TOKEN: 'abc-123' },
          secrets: ['TOKEN'],
          updatedAt: 0,
        },
      ]),
    ),
    getActiveId: vi.fn(async () => 'default'),
    update: vi.fn(async () =>
      ok({ id: 'default', name: 'Default', baseUrl: '', variables: {}, secrets: [], updatedAt: 0 }),
    ),
    create: vi.fn(),
    delete: vi.fn(),
    listRules: vi.fn(async () => ok([])),
    saveRule: vi.fn(),
    updateRule: vi.fn(),
    deleteRule: vi.fn(),
  }
}

describe('mountSaveVariableModal (in-page save variable overlay)', () => {
  afterEach(() => {
    document.getElementById('oac-save-variable-host')?.remove()
  })

  const shadow = () => document.getElementById('oac-save-variable-host')?.shadowRoot ?? null
  const dialog = () => shadow()?.querySelector('[role="dialog"]') ?? null

  it('injects shadow host but renders nothing until opened', () => {
    const bus = new EventBus()
    const modal = mountSaveVariableModal(mockEnvService(), bus)
    expect(shadow()).not.toBeNull()
    expect(modal.isOpen()).toBe(false)
    expect(dialog()).toBeNull()
    modal.destroy()
  })

  it('opens the save variable dialog in the page when open() is called', () => {
    const bus = new EventBus()
    const modal = mountSaveVariableModal(mockEnvService(), bus)
    act(() =>
      modal.open({
        responseBody: '{"access_token":"secret_jwt_token_123"}',
        endpointId: 'post /auth/login',
      }),
    )

    const overlay = dialog()
    expect(overlay).not.toBeNull()
    expect(overlay?.getAttribute('aria-label')).toBe('Save Response Value to Variable')
    expect(modal.isOpen()).toBe(true)

    act(() => modal.close())
    expect(modal.isOpen()).toBe(false)
    expect(dialog()).toBeNull()
    modal.destroy()
  })
})

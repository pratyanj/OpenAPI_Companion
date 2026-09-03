import { describe, it, expect, vi, afterEach } from 'vitest'
import { act } from '@testing-library/react'
import { ok } from '@/types'
import { EventBus } from '@/core/events'
import type { RequestPanelService } from '@/modules/request'
import type { EnvironmentPanelService } from '@/modules/environment'
import { mountPresetEditor } from './preset-editor'

function mockRequestService(): RequestPanelService {
  return {
    listTemplates: vi.fn(async () => ok([])),
    saveOpenAsTemplate: vi.fn(async () => ok(null)),
    createCustomTemplate: vi.fn(async () =>
      ok({
        templateId: 'tpl_1',
        name: 'New Test Preset',
        endpointId: 'post:/users',
        method: 'post',
        environmentId: 'default',
        updatedAt: Date.now(),
      }),
    ),
    updateTemplate: vi.fn(async () =>
      ok({
        templateId: 'tpl_1',
        name: 'Updated Test Preset',
        endpointId: 'post:/users',
        method: 'post',
        environmentId: 'default',
        updatedAt: Date.now(),
      }),
    ),
    deleteTemplate: vi.fn(async () => ok(undefined)),
    applyTemplate: vi.fn(async () => ok(undefined)),
    locateAndFill: vi.fn(async () => ok(undefined)),
    listEndpoints: vi.fn(() => [
      { endpointId: 'post:/users', method: 'post', path: '/users', summary: 'Create user' },
    ]),
    getOpenRequests: vi.fn(() => []),
  }
}

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
  }
}

describe('mountPresetEditor (in-page preset editor)', () => {
  afterEach(() => {
    document.getElementById('oac-preset-editor-host')?.remove()
  })

  const shadow = () => document.getElementById('oac-preset-editor-host')?.shadowRoot ?? null
  const dialog = () => shadow()?.querySelector('[role="dialog"]') ?? null

  it('injects shadow host but renders nothing until opened', () => {
    const bus = new EventBus()
    const editor = mountPresetEditor(mockRequestService(), mockEnvService(), bus, 'default')
    expect(shadow()).not.toBeNull()
    expect(editor.isOpen()).toBe(false)
    expect(dialog()).toBeNull()
    editor.destroy()
  })

  it('opens the preset editor dialog in the page when open() is called', () => {
    const bus = new EventBus()
    const editor = mountPresetEditor(mockRequestService(), mockEnvService(), bus, 'default')
    act(() => editor.open({ initialName: 'My Preset' }))

    const overlay = dialog()
    expect(overlay).not.toBeNull()
    expect(overlay?.getAttribute('aria-label')).toBe('Create Request Preset')
    expect(editor.isOpen()).toBe(true)

    act(() => editor.close())
    expect(editor.isOpen()).toBe(false)
    expect(dialog()).toBeNull()
    editor.destroy()
  })
})

import { describe, it, expect, vi, afterEach } from 'vitest'
import { act } from '@testing-library/react'
import { ok } from '@/types'
import { EventBus } from '@/core/events'
import type { EnvironmentPanelService } from '@/modules/environment'
import { mountExtractionRuleModal } from './extraction-rule-modal'

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
    saveRule: vi.fn(async (input) =>
      ok({
        id: 'rule_test',
        endpointId: input.endpointId,
        property: input.property,
        targetVariable: input.targetVariable,
        isSecret: Boolean(input.isSecret),
        enabled: true,
        createdAt: Date.now(),
      }),
    ),
    updateRule: vi.fn(),
    deleteRule: vi.fn(async () => ok(undefined)),
  }
}

describe('mountExtractionRuleModal (in-page auto-extraction rule overlay)', () => {
  afterEach(() => {
    document.getElementById('oac-extraction-rule-host')?.remove()
  })

  const shadow = () => document.getElementById('oac-extraction-rule-host')?.shadowRoot ?? null
  const dialog = () => shadow()?.querySelector('[role="dialog"]') ?? null

  it('injects shadow host but renders nothing until opened', () => {
    const bus = new EventBus()
    const modal = mountExtractionRuleModal(mockEnvService(), () => [], bus)
    expect(shadow()).not.toBeNull()
    expect(modal.isOpen()).toBe(false)
    expect(dialog()).toBeNull()
    modal.destroy()
  })

  it('opens the extraction rule dialog in the page when open() is called', () => {
    const bus = new EventBus()
    const modal = mountExtractionRuleModal(
      mockEnvService(),
      () => [{ endpointId: 'post:/tasks', method: 'post', path: '/tasks', summary: 'Create Task' }],
      bus,
    )
    act(() => modal.open({ endpointId: 'post:/tasks', targetVariable: 'TASK_ID' }))

    const overlay = dialog()
    expect(overlay).not.toBeNull()
    expect(overlay?.getAttribute('aria-label')).toBe('Add Auto-Extraction Rule')
    expect(modal.isOpen()).toBe(true)

    act(() => modal.close())
    expect(modal.isOpen()).toBe(false)
    expect(dialog()).toBeNull()
    modal.destroy()
  })
})

import { describe, it, expect, vi, afterEach } from 'vitest'
import { act } from '@testing-library/react'
import { ok } from '@/types'
import { EventBus } from '@/core/events'
import type { ProjectMeta } from '@/core/project/types'
import type { RemoteProjectApi } from '@/sidepanel/bridge'
import { mountProjectSwitcherModal } from './project-switcher-modal'

const mockProject: ProjectMeta = {
  id: 'project_123',
  name: '127.0.0.1:8008',
  originUrl: 'http://127.0.0.1:8008',
  openApiUrl: 'http://127.0.0.1:8008/openapi.json',
  docType: 'swagger-ui',
  createdAt: 1000,
  lastActiveEnvId: 'default',
}

function mockProjectService(): RemoteProjectApi {
  return {
    rename: vi.fn(async () => ok(mockProject)),
    linkOrigin: vi.fn(async () => ok(undefined)),
    unlinkOrigin: vi.fn(async () => ok(undefined)),
    copyData: vi.fn(async () => ok(3)),
    listAll: vi.fn(async () =>
      ok([
        {
          id: 'project_123',
          name: '127.0.0.1:8008',
          originUrl: 'http://127.0.0.1:8008',
          openApiUrl: 'http://127.0.0.1:8008/openapi.json',
        },
      ]),
    ),
    dismissCandidates: vi.fn(async () => ok(undefined)),
  }
}

describe('mountProjectSwitcherModal (in-page project switcher overlay)', () => {
  afterEach(() => {
    document.getElementById('oac-project-switcher-host')?.remove()
  })

  const shadow = () => document.getElementById('oac-project-switcher-host')?.shadowRoot ?? null
  const dialog = () => shadow()?.querySelector('[role="dialog"]') ?? null

  it('injects shadow host but renders nothing until opened', async () => {
    const bus = new EventBus()
    const modal = mountProjectSwitcherModal(mockProjectService(), mockProject, bus)
    expect(shadow()).not.toBeNull()
    expect(modal.isOpen()).toBe(false)
    expect(dialog()).toBeNull()
    await act(async () => {
      modal.destroy()
    })
  })

  it('opens and closes via imperative handle', async () => {
    const bus = new EventBus()
    const modal = mountProjectSwitcherModal(mockProjectService(), mockProject, bus)

    await act(async () => {
      modal.open()
    })

    expect(modal.isOpen()).toBe(true)
    expect(dialog()).not.toBeNull()
    expect(dialog()?.getAttribute('aria-label')).toBe('Workspaces & Projects')

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
    const modal = mountProjectSwitcherModal(mockProjectService(), mockProject, bus)

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

  it('renders connected URL chips and switches workspace on button click', async () => {
    const bus = new EventBus()
    const service = mockProjectService()
    service.listAll = vi.fn(async () =>
      ok([
        {
          id: 'project_123',
          name: 'Current App',
          originUrl: 'http://127.0.0.1:8008',
          openApiUrl: 'http://127.0.0.1:8008/openapi.json',
          linkedOrigins: ['http://localhost:8009'],
          presetCount: 5,
          variableCount: 3,
        },
        {
          id: 'project_456',
          name: 'Payment Service',
          originUrl: 'http://127.0.0.1:4200',
          openApiUrl: 'http://127.0.0.1:4200/swagger.json',
          presetCount: 10,
          variableCount: 6,
        },
      ]),
    )

    const modal = mountProjectSwitcherModal(service, mockProject, bus)
    await act(async () => {
      modal.open()
    })

    const el = dialog()
    expect(el).not.toBeNull()
    expect(el?.textContent).toContain('Current App')
    expect(el?.textContent).toContain('this tab')
    expect(el?.textContent).toContain(':8009')
    expect(el?.textContent).toContain('Payment Service')
    expect(el?.textContent).toContain('Switch')

    // Click "Switch"
    const switchBtn = Array.from(shadow()?.querySelectorAll('button') ?? []).find(
      (b) => b.textContent?.trim() === 'Switch',
    )
    expect(switchBtn).toBeDefined()
    await act(async () => {
      switchBtn?.click()
    })

    expect(service.linkOrigin).toHaveBeenCalledWith('project_456')

    await act(async () => {
      modal.destroy()
    })
  })

  it('cleans up DOM and root on destroy', async () => {
    const bus = new EventBus()
    const modal = mountProjectSwitcherModal(mockProjectService(), mockProject, bus)

    await act(async () => {
      modal.open()
    })
    expect(document.getElementById('oac-project-switcher-host')).not.toBeNull()

    await act(async () => {
      modal.destroy()
    })
    expect(document.getElementById('oac-project-switcher-host')).toBeNull()
  })
})

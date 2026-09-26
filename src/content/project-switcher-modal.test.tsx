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
    expect(dialog()?.getAttribute('aria-label')).toBe('Switch or Link Projects')

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

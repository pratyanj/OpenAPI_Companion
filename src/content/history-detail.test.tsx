import { describe, it, expect, vi, afterEach } from 'vitest'
import { act } from '@testing-library/react'
import { ok } from '@/types'
import { EventBus } from '@/core/events'
import type { HistoryPanelService, HistoryRecord } from '@/modules/history'
import { mountHistoryDetail } from './history-detail'

const mockRecord: HistoryRecord = {
  id: 'h_123',
  endpointId: 'post:/auth/login',
  method: 'post',
  endpoint: '/auth/login',
  status: 200,
  requestBody: '{"email":"admin@example.com"}',
  responseBody: '{"token":"xyz789"}',
  timestamp: Date.now(),
  environmentId: 'default',
}

function mockHistoryService(): HistoryPanelService {
  return {
    list: vi.fn(async () => ok([mockRecord])),
    get: vi.fn(async (id: string) => (id === 'h_123' ? ok(mockRecord) : ok(null))),
    replay: vi.fn(async () => ok(mockRecord)),
    locate: vi.fn(() => ok(undefined)),
    deleteEntry: vi.fn(async () => ok(undefined)),
    clearProject: vi.fn(async () => ok(undefined)),
  }
}

describe('mountHistoryDetail (in-page history request detail overlay)', () => {
  afterEach(() => {
    document.getElementById('oac-history-detail-host')?.remove()
  })

  const shadow = () => document.getElementById('oac-history-detail-host')?.shadowRoot ?? null
  const dialog = () => shadow()?.querySelector('[role="dialog"]') ?? null

  it('injects shadow host but renders nothing until opened', () => {
    const bus = new EventBus()
    const overlay = mountHistoryDetail(mockHistoryService(), undefined, bus)
    expect(shadow()).not.toBeNull()
    expect(overlay.isOpen()).toBe(false)
    expect(dialog()).toBeNull()
    overlay.destroy()
  })

  it('opens the request detail dialog in the page when open() is called', async () => {
    const bus = new EventBus()
    const service = mockHistoryService()
    const overlay = mountHistoryDetail(service, undefined, bus)
    await act(async () => {
      overlay.open('h_123')
    })

    const el = dialog()
    expect(el).not.toBeNull()
    expect(el?.getAttribute('aria-label')).toBe('Request detail')
    expect(overlay.isOpen()).toBe(true)

    await act(async () => {
      overlay.close()
    })
    expect(overlay.isOpen()).toBe(false)
    expect(dialog()).toBeNull()
    overlay.destroy()
  })
})

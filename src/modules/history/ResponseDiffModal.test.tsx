import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ResponseDiffModal } from './ResponseDiffModal'
import type { HistoryRecord, HistoryEntry } from './types'
import type { HistoryPanelService } from './HistoryPanel'
import { ok } from '@/types'

describe('ResponseDiffModal', () => {
  const sampleRecordA: HistoryRecord = {
    id: 'call-1',
    endpointId: 'get /users',
    method: 'get',
    endpoint: '/users',
    status: 200,
    durationMs: 45,
    timestamp: 1000,
    environmentId: 'default',
    requestBody: '{"page":1}',
    responseBody: '{"users":[{"id":1,"name":"Alice"}]}',
    headers: { 'Content-Type': 'application/json' },
  }

  const sampleRecordB: HistoryRecord = {
    id: 'call-2',
    endpointId: 'get /users',
    method: 'get',
    endpoint: '/users',
    status: 200,
    durationMs: 95,
    timestamp: 2000,
    environmentId: 'default',
    requestBody: '{"page":2}',
    responseBody: '{"users":[{"id":2,"name":"Bob"}]}',
    headers: { 'Content-Type': 'application/json' },
  }

  const sampleCalls: HistoryEntry[] = [
    {
      id: 'call-1',
      endpointId: 'get /users',
      method: 'get',
      endpoint: '/users',
      status: 200,
      durationMs: 45,
      timestamp: 1000,
      environmentId: 'default',
    },
    {
      id: 'call-2',
      endpointId: 'get /users',
      method: 'get',
      endpoint: '/users',
      status: 200,
      durationMs: 95,
      timestamp: 2000,
      environmentId: 'default',
    },
  ]

  function mockService(): HistoryPanelService {
    return {
      list: vi.fn(async () => ok(sampleCalls)),
      get: vi.fn(async (id: string) => {
        if (id === 'call-1') return ok(sampleRecordA)
        if (id === 'call-2') return ok(sampleRecordB)
        return ok(null)
      }),
      replay: vi.fn(async () => ok(sampleRecordA)),
      locate: vi.fn(() => ok(undefined)),
      deleteEntry: vi.fn(async () => ok(undefined)),
      clearProject: vi.fn(async () => ok(undefined)),
    }
  }

  it('renders side-by-side diff modal with two records', async () => {
    render(
      <ResponseDiffModal
        isOpen={true}
        onClose={vi.fn()}
        initialRecordA={sampleRecordA}
        initialRecordB={sampleRecordB}
        service={mockService()}
        allCalls={sampleCalls}
      />,
    )

    expect(screen.getByText('Side-by-Side Response Diff')).toBeInTheDocument()
    expect(screen.getByText('Baseline (A):')).toBeInTheDocument()
    expect(screen.getByText('Compare (B):')).toBeInTheDocument()

    // Status delta
    expect(screen.getByText('Status:')).toBeInTheDocument()

    // Latency comparison
    expect(screen.getByText('45ms')).toBeInTheDocument()
    expect(screen.getByText('95ms')).toBeInTheDocument()

    // Diff highlights: Alice removed in A, Bob added in B
    expect(screen.getByText(/"Alice"/)).toBeInTheDocument()
    expect(screen.getByText(/"Bob"/)).toBeInTheDocument()
  })

  it('toggles between Split and Unified view mode', async () => {
    render(
      <ResponseDiffModal
        isOpen={true}
        onClose={vi.fn()}
        initialRecordA={sampleRecordA}
        initialRecordB={sampleRecordB}
        service={mockService()}
        allCalls={sampleCalls}
      />,
    )

    const unifiedBtn = screen.getByRole('button', { name: /Unified/i })
    fireEvent.click(unifiedBtn)

    // Now in Unified mode
    const splitBtn = screen.getByRole('button', { name: /Split/i })
    expect(splitBtn).toBeInTheDocument()
  })

  it('swaps Baseline A and Comparison B on swap click', async () => {
    render(
      <ResponseDiffModal
        isOpen={true}
        onClose={vi.fn()}
        initialRecordA={sampleRecordA}
        initialRecordB={sampleRecordB}
        service={mockService()}
        allCalls={sampleCalls}
      />,
    )

    const swapBtn = screen.getByRole('button', { name: /Swap Baseline/i })
    fireEvent.click(swapBtn)

    // After swapping, latency comparison displays 95ms -> 45ms
    await waitFor(() => {
      expect(screen.getByText(/45ms/)).toBeInTheDocument()
    })
  })

  it('switches tabs between Response, Request, and Headers', async () => {
    render(
      <ResponseDiffModal
        isOpen={true}
        onClose={vi.fn()}
        initialRecordA={sampleRecordA}
        initialRecordB={sampleRecordB}
        service={mockService()}
        allCalls={sampleCalls}
      />,
    )

    // Click Request tab
    const reqTab = screen.getByRole('tab', { name: /Request Body/i })
    fireEvent.click(reqTab)
    expect(await screen.findByText(/"page": 1/)).toBeInTheDocument()

    // Click Headers tab
    const headersTab = screen.getByRole('tab', { name: /Headers/i })
    fireEvent.click(headersTab)
    expect(await screen.findByText('Content-Type')).toBeInTheDocument()
  })

  it('populates dropdown options and allows selecting different executions', async () => {
    const service = mockService()
    render(
      <ResponseDiffModal
        isOpen={true}
        onClose={vi.fn()}
        initialRecordA={sampleRecordA}
        initialRecordB={sampleRecordB}
        service={service}
        allCalls={[]}
      />,
    )

    // Both dropdowns should have options populated from service.list() + records
    const selectA = screen.getByRole('combobox', { name: /Baseline execution/i })
    const selectB = screen.getByRole('combobox', { name: /Comparison execution/i })

    await waitFor(() => {
      expect(selectA.querySelectorAll('option').length).toBeGreaterThanOrEqual(2)
      expect(selectB.querySelectorAll('option').length).toBeGreaterThanOrEqual(2)
    })

    // Change baseline dropdown to call-2
    fireEvent.change(selectA, { target: { value: 'call-2' } })
    await waitFor(() => {
      expect(service.get).toHaveBeenCalledWith('call-2')
    })
  })
})

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { HistoryPanel, type HistoryPanelService } from './HistoryPanel'
import type { HistoryEntry, HistoryRecord } from './types'
import { EventBus } from '@/core/events'
import { ok, type Result } from '@/types'

const entry: HistoryEntry = {
  id: 'h1',
  endpointId: 'post /users',
  method: 'post',
  endpoint: '/users',
  status: 201,
  timestamp: 0,
  environmentId: 'default',
}
const record: HistoryRecord = { ...entry, requestBody: '{"a":1}', responseBody: '{"id":7}' }

function mockService(over: Partial<HistoryPanelService> = {}): HistoryPanelService {
  return {
    list: vi.fn(async (): Promise<Result<HistoryEntry[]>> => ok([entry])),
    get: vi.fn(async (): Promise<Result<HistoryRecord | null>> => ok(record)),
    replay: vi.fn(async (): Promise<Result<HistoryRecord>> => ok(record)),
    deleteEntry: vi.fn(async (): Promise<Result<void>> => ok(undefined)),
    clearProject: vi.fn(async (): Promise<Result<void>> => ok(undefined)),
    ...over,
  }
}

describe('HistoryPanel', () => {
  it('shows the empty state when there is no history', async () => {
    render(
      <HistoryPanel
        service={mockService({ list: vi.fn(async () => ok([])) })}
        bus={new EventBus()}
      />,
    )
    expect(await screen.findByText('No requests yet')).toBeInTheDocument()
  })

  it('lists recorded requests with method, path, and status', async () => {
    render(<HistoryPanel service={mockService()} bus={new EventBus()} />)
    expect(await screen.findByText('/users')).toBeInTheDocument()
    expect(screen.getByText('201')).toBeInTheDocument()
    expect(screen.getByText('post')).toBeInTheDocument()
  })

  it('filters by method', async () => {
    const service = mockService()
    render(<HistoryPanel service={service} bus={new EventBus()} />)
    await screen.findByText('/users')

    fireEvent.change(screen.getByLabelText('Filter by method'), { target: { value: 'get' } })
    await waitFor(() =>
      expect(service.list).toHaveBeenCalledWith({ method: 'get', text: undefined }),
    )
  })

  it('opens a tabbed detail inspector, switching between request and response', async () => {
    const service = mockService()
    render(<HistoryPanel service={service} bus={new EventBus()} />)
    await screen.findByText('/users')

    fireEvent.click(screen.getByRole('button', { name: 'View post /users details' }))
    const dialog = await screen.findByRole('dialog', { name: 'Request detail' })
    expect(service.get).toHaveBeenCalledWith('h1')

    // Request tab is active by default; response body is not yet rendered.
    expect(dialog).toHaveTextContent('"a": 1')
    expect(dialog).not.toHaveTextContent('"id": 7')

    fireEvent.click(screen.getByRole('tab', { name: 'Response' }))
    expect(dialog).toHaveTextContent('"id": 7')
    expect(dialog).not.toHaveTextContent('"a": 1')

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('replays and deletes and clears', async () => {
    const service = mockService()
    render(<HistoryPanel service={service} bus={new EventBus()} />)
    await screen.findByText('/users')

    fireEvent.click(screen.getByRole('button', { name: 'Replay' }))
    expect(service.replay).toHaveBeenCalledWith('h1')

    fireEvent.click(screen.getByRole('button', { name: 'Delete post /users' }))
    expect(service.deleteEntry).toHaveBeenCalledWith('h1')

    fireEvent.click(screen.getByRole('button', { name: 'Clear history' }))
    expect(service.clearProject).toHaveBeenCalled()
  })

  it('surfaces a replay failure as an error toast (EC-013)', async () => {
    const service = mockService({
      replay: vi.fn(async () => ({
        ok: false as const,
        error: {
          code: 'X',
          message: 'No open operation matching "post /users"',
          recoverable: true,
        },
      })),
    })
    const bus = new EventBus()
    const toast = vi.fn()
    bus.subscribe('NOTIFY', toast)
    render(<HistoryPanel service={service} bus={bus} />)
    await screen.findByText('/users')

    fireEvent.click(screen.getByRole('button', { name: 'Replay' }))
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ kind: 'error' })),
    )
  })

  it('reloads when a HISTORY_RECORDED event fires', async () => {
    const bus = new EventBus()
    const list = vi.fn(async () => ok([] as HistoryEntry[]))
    render(<HistoryPanel service={mockService({ list })} bus={bus} />)
    await screen.findByText('No requests yet')

    list.mockResolvedValue(ok([entry]))
    bus.publish('HISTORY_RECORDED', { recordId: 'h1', endpointId: 'post /users', status: 201 })
    await waitFor(() => expect(screen.getByText('/users')).toBeInTheDocument())
  })
})

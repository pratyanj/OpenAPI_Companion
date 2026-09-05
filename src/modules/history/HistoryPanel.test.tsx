import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
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
    locate: vi.fn((): Result<void> => ok(undefined)),
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
    // Colored method badge (uppercased); scope to the badge span, not the filter <option>.
    expect(screen.getByText('POST', { selector: 'span' })).toBeInTheDocument()
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

  // Repeats collapse into ONE row so a hammered endpoint can't bury the rest of
  // the list; every call is still there, listed in the detail view.
  it('groups repeat calls into one row and lists them in the detail view', async () => {
    const second: HistoryEntry = { ...entry, id: 'h2', timestamp: 60_000, status: 500 }
    const service = mockService({
      list: vi.fn(async (): Promise<Result<HistoryEntry[]>> => ok([second, entry])),
    })
    render(<HistoryPanel service={service} bus={new EventBus()} />)

    // One row for two calls, labelled with the count.
    const rows = await screen.findAllByRole('button', { name: 'View post /users details' })
    expect(rows).toHaveLength(1)
    expect(screen.getByText('2 calls')).toBeInTheDocument()

    fireEvent.click(rows[0]!)
    const dialog = await screen.findByRole('dialog', { name: 'Request detail' })
    expect(dialog).toHaveTextContent('2 calls to this endpoint')

    // Replay / Locate live in the dialog header, reachable without scrolling.
    fireEvent.click(screen.getByRole('button', { name: 'Replay' }))
    expect(service.replay).toHaveBeenCalledWith(record.id)
    fireEvent.click(screen.getByRole('button', { name: 'Locate' }))
    expect(service.locate).toHaveBeenCalledWith('post /users')

    // Picking another call loads that record into the same inspector.
    ;(service.get as ReturnType<typeof vi.fn>).mockClear()
    const timeline = within(screen.getByRole('list', { name: 'Calls to this endpoint' }))
    fireEvent.click(timeline.getAllByRole('button')[1]!)
    await waitFor(() => expect(service.get).toHaveBeenCalledWith('h1'))
  })

  it('deletes every call behind a grouped row, saying how many', async () => {
    const second: HistoryEntry = { ...entry, id: 'h2', timestamp: 60_000 }
    const service = mockService({
      list: vi.fn(async (): Promise<Result<HistoryEntry[]>> => ok([second, entry])),
    })
    render(<HistoryPanel service={service} bus={new EventBus()} />)
    await screen.findByText('2 calls')

    fireEvent.click(screen.getByRole('button', { name: 'Actions for post /users' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Delete 2 calls/ }))
    await waitFor(() => expect(service.deleteEntry).toHaveBeenCalledTimes(2))
  })

  it('wraps long body lines by default, and the toggle survives a tab switch', async () => {
    render(<HistoryPanel service={mockService()} bus={new EventBus()} />)
    await screen.findByText('/users')
    fireEvent.click(screen.getByRole('button', { name: 'View post /users details' }))
    await screen.findByRole('dialog', { name: 'Request detail' })

    const body = () => document.querySelector('pre') as HTMLElement
    const toggle = () => screen.getByRole('button', { name: 'wrap' })

    // Narrow panel → wrapping on by default, so long tokens stay visible.
    expect(toggle()).toHaveAttribute('aria-pressed', 'true')
    expect(body().className).toContain('whitespace-pre-wrap')

    fireEvent.click(toggle())
    expect(toggle()).toHaveAttribute('aria-pressed', 'false')
    expect(body().className).not.toContain('whitespace-pre-wrap')

    // Switching tabs keeps the preference (it lives above both panes).
    fireEvent.click(screen.getByRole('tab', { name: 'Response' }))
    expect(toggle()).toHaveAttribute('aria-pressed', 'false')
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

  it('replays, locates, and deletes from the ⋮ menu; clears all', async () => {
    const service = mockService()
    render(<HistoryPanel service={service} bus={new EventBus()} />)
    await screen.findByText('/users')

    const openMenu = () =>
      fireEvent.click(screen.getByRole('button', { name: 'Actions for post /users' }))

    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Replay' }))
    expect(service.replay).toHaveBeenCalledWith('h1')

    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Locate in Swagger' }))
    expect(service.locate).toHaveBeenCalledWith('post /users')

    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(service.deleteEntry).toHaveBeenCalledWith('h1')

    fireEvent.click(screen.getByRole('button', { name: 'Clear history' }))
    expect(service.clearProject).toHaveBeenCalled()
  })

  it('shows the full endpoint path (no truncation)', async () => {
    const longEntry: HistoryEntry = {
      ...entry,
      id: 'h2',
      endpoint: '/site-surveys/{id}/status-history/',
    }
    render(
      <HistoryPanel
        service={mockService({ list: vi.fn(async () => ok([longEntry])) })}
        bus={new EventBus()}
      />,
    )
    expect(await screen.findByText('/site-surveys/{id}/status-history/')).toBeInTheDocument()
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

    fireEvent.click(screen.getByRole('button', { name: 'Actions for post /users' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Replay' }))
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

  // Copy menu in the detail view — offers URL, code snippets, and stored bodies
  // (headers/HAR aren't stored, so aren't offered).
  it('offers a copy menu that copies a cURL snippet with the full URL', async () => {
    // jsdom has no execCommand; capture what copyText puts in the textarea.
    let copied: string | null = null
    ;(document as unknown as { execCommand: () => boolean }).execCommand = () => {
      copied = (document.querySelector('textarea') as HTMLTextAreaElement | null)?.value ?? null
      return true
    }
    render(
      <HistoryPanel
        service={mockService()}
        bus={new EventBus()}
        baseUrl="https://api.example.com"
      />,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'View post /users details' }))
    await screen.findByRole('dialog', { name: 'Request detail' })

    fireEvent.click(screen.getByRole('button', { name: 'Copy from this request' }))
    // Menu options present.
    expect(screen.getByRole('menuitem', { name: 'Copy URL' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Copy as PowerShell' })).toBeInTheDocument()
    // Headers/HAR are NOT offered (not captured).
    expect(screen.queryByRole('menuitem', { name: /Headers/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /HAR/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy as cURL' }))
    expect(copied).toContain("curl -X POST 'https://api.example.com/users'")
    expect(copied).toContain(`-d '{"a":1}'`)
  })

  it('copies the full URL from the copy menu', async () => {
    let copied: string | null = null
    ;(document as unknown as { execCommand: () => boolean }).execCommand = () => {
      copied = (document.querySelector('textarea') as HTMLTextAreaElement | null)?.value ?? null
      return true
    }
    render(
      <HistoryPanel
        service={mockService()}
        bus={new EventBus()}
        baseUrl="https://api.example.com"
      />,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'View post /users details' }))
    await screen.findByRole('dialog', { name: 'Request detail' })
    fireEvent.click(screen.getByRole('button', { name: 'Copy from this request' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy URL' }))
    expect(copied).toBe('https://api.example.com/users')
  })

  it('opens Save to Variable dialog from response tab when environmentService is provided', async () => {
    const envService = {
      list: vi.fn(async () =>
        ok([
          { id: 'default', name: 'Default', baseUrl: '', variables: {}, secrets: [], updatedAt: 0 },
        ]),
      ),
      getActiveId: vi.fn(async () => 'default'),
      update: vi.fn(async () =>
        ok({
          id: 'default',
          name: 'Default',
          baseUrl: '',
          variables: {},
          secrets: [],
          updatedAt: 0,
        }),
      ),
      create: vi.fn(),
      delete: vi.fn(),
    }

    render(
      <HistoryPanel
        service={mockService()}
        bus={new EventBus()}
        baseUrl="https://api.example.com"
        environmentService={envService}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'View post /users details' }))
    await screen.findByRole('dialog', { name: 'Request detail' })

    // Switch to Response tab
    fireEvent.click(screen.getByRole('tab', { name: /Response/ }))

    // Save to variable button should be present
    const saveVarBtn = screen.getByRole('button', { name: 'Save to variable' })
    expect(saveVarBtn).toBeInTheDocument()

    fireEvent.click(saveVarBtn)
    expect(await screen.findByText('Save Response Value to Variable')).toBeInTheDocument()
  })

  it('delegates to onOpenHistoryDetail when provided instead of opening inline dialog', async () => {
    const onOpenHistoryDetail = vi.fn()
    render(
      <HistoryPanel
        service={mockService()}
        bus={new EventBus()}
        onOpenHistoryDetail={onOpenHistoryDetail}
      />,
    )
    await screen.findByText('/users')
    fireEvent.click(screen.getByRole('button', { name: 'View post /users details' }))

    expect(onOpenHistoryDetail).toHaveBeenCalledWith('h1')
    expect(screen.queryByRole('dialog', { name: 'Request detail' })).not.toBeInTheDocument()
  })
})

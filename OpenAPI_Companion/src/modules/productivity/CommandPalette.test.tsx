import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ok, type Result } from '@/types'
import { CommandPalette, type ProductivityPanelService } from './CommandPalette'
import type { EndpointListItem } from './types'

const users: EndpointListItem = {
  endpointId: 'get /users',
  method: 'get',
  path: '/users',
  summary: 'List users',
  favorite: false,
}
const orders: EndpointListItem = {
  endpointId: 'get /orders',
  method: 'get',
  path: '/orders',
  favorite: true,
}

function mockService(over: Partial<ProductivityPanelService> = {}): ProductivityPanelService {
  return {
    search: vi.fn((q: string) => (q.includes('user') ? [users] : [])),
    getFavorites: vi.fn(() => [orders]),
    getRecents: vi.fn(() => [users]),
    toggleFavorite: vi.fn(async (): Promise<Result<boolean>> => ok(true)),
    open: vi.fn(async (): Promise<Result<void>> => ok(undefined)),
    generateCode: vi.fn((): Result<string> => ok("curl -X GET '/users'")),
    ...over,
  }
}

describe('CommandPalette', () => {
  it('shows favorites and recents when the query is empty', () => {
    render(<CommandPalette service={mockService()} onClose={vi.fn()} />)
    expect(screen.getByText('Favorites')).toBeInTheDocument()
    expect(screen.getByText('Recent')).toBeInTheDocument()
    expect(screen.getByText('/orders')).toBeInTheDocument() // favorite
  })

  it('searches as you type and shows results', () => {
    const service = mockService()
    render(<CommandPalette service={service} onClose={vi.fn()} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'user' } })
    expect(service.search).toHaveBeenCalledWith('user', undefined)
    expect(screen.getByText(/List users/)).toBeInTheDocument()
  })

  it('filters by method when a chip is selected (even with no query)', () => {
    const service = mockService({ search: vi.fn(() => [users]) })
    render(<CommandPalette service={service} onClose={vi.fn()} />)
    // Empty query → favorites/recents; picking a method switches to filtered results.
    fireEvent.click(screen.getByRole('button', { name: 'get', pressed: false }))
    expect(service.search).toHaveBeenCalledWith('', 'get')
    expect(screen.getByText(/List users/)).toBeInTheDocument()
  })

  it('shows an empty state when nothing matches', () => {
    render(<CommandPalette service={mockService()} onClose={vi.fn()} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'zzz' } })
    expect(screen.getByText('No endpoints match')).toBeInTheDocument()
  })

  it('navigates to an endpoint on click and closes', () => {
    const service = mockService()
    const onClose = vi.fn()
    render(<CommandPalette service={service} onClose={onClose} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'user' } })
    fireEvent.click(screen.getByRole('button', { name: 'Open get /users' }))
    expect(service.open).toHaveBeenCalledWith(expect.objectContaining({ endpointId: 'get /users' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('toggles a favorite', async () => {
    const service = mockService()
    render(<CommandPalette service={service} onClose={vi.fn()} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'user' } })
    fireEvent.click(screen.getByRole('button', { name: 'Favorite /users' }))
    await waitFor(() =>
      expect(service.toggleFavorite).toHaveBeenCalledWith(
        expect.objectContaining({ endpointId: 'get /users' }),
      ),
    )
  })

  it('reveals copy-as-code buttons', () => {
    const service = mockService()
    render(<CommandPalette service={service} onClose={vi.fn()} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'user' } })
    fireEvent.click(screen.getByRole('button', { name: 'Copy code for /users' }))
    expect(screen.getByRole('button', { name: 'Copy cURL' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy Fetch' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy Axios' })).toBeInTheDocument()
    expect(service.generateCode).toHaveBeenCalledWith('curl', 'get /users')
  })
})

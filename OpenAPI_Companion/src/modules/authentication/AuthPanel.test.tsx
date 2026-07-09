import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { AuthPanel, type AuthPanelService } from './AuthPanel'
import type { AuthRecord } from './types'
import { EventBus } from '@/core/events'
import { ok, type Result } from '@/types'

const authorized: AuthRecord = {
  type: 'bearer',
  token: 'abcdefgh_SECRET_1234',
  schemeName: 'bearerAuth',
  environmentId: 'default',
  updatedAt: 0,
}

function mockService(over: Partial<AuthPanelService> = {}): AuthPanelService {
  return {
    current: vi.fn(async (): Promise<Result<AuthRecord | null>> => ok(null)),
    clear: vi.fn(async (): Promise<Result<void>> => ok(undefined)),
    ...over,
  }
}

describe('AuthPanel', () => {
  it('shows the empty state when nothing is authorized', async () => {
    render(<AuthPanel service={mockService()} bus={new EventBus()} environmentId="default" />)
    expect(await screen.findByText('Not authorized')).toBeInTheDocument()
  })

  it('shows a masked credential and its type when authorized', async () => {
    const service = mockService({ current: vi.fn(async () => ok(authorized)) })
    render(<AuthPanel service={service} bus={new EventBus()} environmentId="default" />)

    expect(await screen.findByText('Authorized')).toBeInTheDocument()
    expect(screen.getByText('bearer')).toBeInTheDocument()
    // token is masked (last 4 shown), not the raw secret
    expect(screen.queryByText('abcdefgh_SECRET_1234')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Stored credential').textContent).toContain('1234')
  })

  it('reveals the full credential on toggle', async () => {
    const service = mockService({ current: vi.fn(async () => ok(authorized)) })
    render(<AuthPanel service={service} bus={new EventBus()} environmentId="default" />)
    await screen.findByText('Authorized')

    fireEvent.click(screen.getByRole('button', { name: 'Show credential' }))
    expect(screen.getByLabelText('Stored credential').textContent).toBe('abcdefgh_SECRET_1234')
  })

  it('calls clear() when the Clear button is pressed', async () => {
    const service = mockService({ current: vi.fn(async () => ok(authorized)) })
    render(<AuthPanel service={service} bus={new EventBus()} environmentId="default" />)
    await screen.findByText('Authorized')

    fireEvent.click(screen.getByRole('button', { name: 'Clear authentication' }))
    expect(service.clear).toHaveBeenCalledWith('default')
  })

  it('reloads when an AUTH_UPDATED event fires', async () => {
    const bus = new EventBus()
    const current = vi.fn(async (): Promise<Result<AuthRecord | null>> => ok(null))
    render(<AuthPanel service={mockService({ current })} bus={bus} environmentId="default" />)
    await screen.findByText('Not authorized')

    current.mockResolvedValue(ok(authorized))
    act(() =>
      bus.publish('AUTH_UPDATED', { projectId: 'p', environmentId: 'default', type: 'bearer' }),
    )

    await waitFor(() => expect(screen.getByText('Authorized')).toBeInTheDocument())
  })
})

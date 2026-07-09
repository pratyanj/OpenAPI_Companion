import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { ToastLayer } from './ToastLayer'
import { EventBus } from '@/core/events'

describe('ToastLayer', () => {
  afterEach(() => vi.useRealTimers())

  it('shows a toast on NOTIFY and auto-dismisses after the timeout', () => {
    vi.useFakeTimers()
    const bus = new EventBus()
    render(<ToastLayer bus={bus} />)

    act(() => bus.publish('NOTIFY', { kind: 'success', message: 'Saved' }))
    expect(screen.getByText('Saved')).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(4000))
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })

  it('can be dismissed manually', () => {
    const bus = new EventBus()
    render(<ToastLayer bus={bus} />)
    act(() => bus.publish('NOTIFY', { kind: 'error', message: 'Boom' }))

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText('Boom')).not.toBeInTheDocument()
  })

  it('stacks multiple toasts', () => {
    const bus = new EventBus()
    render(<ToastLayer bus={bus} />)
    act(() => {
      bus.publish('NOTIFY', { kind: 'success', message: 'One' })
      bus.publish('NOTIFY', { kind: 'warning', message: 'Two' })
    })
    expect(screen.getByText('One')).toBeInTheDocument()
    expect(screen.getByText('Two')).toBeInTheDocument()
  })
})

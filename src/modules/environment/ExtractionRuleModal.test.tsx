import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ExtractionRuleModal } from './ExtractionRuleModal'

describe('ExtractionRuleModal', () => {
  const mockEndpoints = [
    { endpointId: 'post:/tasks/', method: 'post', path: '/tasks/', summary: 'Create Task' },
    { endpointId: 'get:/users', method: 'get', path: '/users', summary: 'Get Users' },
  ]

  it('renders with initial values and preset buttons', () => {
    render(
      <ExtractionRuleModal
        endpoints={mockEndpoints}
        initialEndpointId="post:/tasks/"
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    )

    expect(screen.getByText('Add Auto-Extraction Rule')).toBeInTheDocument()
    expect(screen.getByDisplayValue('access_token')).toBeInTheDocument()
    expect(screen.getByDisplayValue('ACCESS_TOKEN')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'token → {{TOKEN}}' })).toBeInTheDocument()
  })

  it('updates form values when a preset is clicked', () => {
    render(
      <ExtractionRuleModal
        endpoints={mockEndpoints}
        initialEndpointId="post:/tasks/"
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'token → {{TOKEN}}' }))
    expect(screen.getByDisplayValue('token')).toBeInTheDocument()
    expect(screen.getByDisplayValue('TOKEN')).toBeInTheDocument()
  })

  it('validates required fields and saves rule upon submission', async () => {
    const onSave = vi.fn(async () => {})
    const onClose = vi.fn()

    render(
      <ExtractionRuleModal
        endpoints={mockEndpoints}
        initialEndpointId="post:/tasks/"
        onClose={onClose}
        onSave={onSave}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Create Rule' }))

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        endpointId: 'post:/tasks/',
        property: 'access_token',
        targetVariable: 'ACCESS_TOKEN',
        isSecret: true,
        enabled: true,
      })
      expect(onClose).toHaveBeenCalled()
    })
  })
})

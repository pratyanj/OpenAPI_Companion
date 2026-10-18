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

  it('renders in edit mode when ruleId is provided and saves changes', async () => {
    const onSave = vi.fn(async () => {})
    const onClose = vi.fn()

    render(
      <ExtractionRuleModal
        ruleId="rule_123"
        endpoints={mockEndpoints}
        initialEndpointId="get:/users"
        initialProperty="data.id"
        initialTargetVariable="USER_ID"
        initialIsSecret={false}
        onClose={onClose}
        onSave={onSave}
      />,
    )

    expect(screen.getByText('Edit Auto-Extraction Rule')).toBeInTheDocument()
    expect(screen.getByDisplayValue('data.id')).toBeInTheDocument()
    expect(screen.getByDisplayValue('USER_ID')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeInTheDocument()

    // Modify target variable
    const targetInput = screen.getByDisplayValue('USER_ID')
    fireEvent.change(targetInput, { target: { value: 'NEW_USER_ID' } })

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        endpointId: 'get:/users',
        property: 'data.id',
        targetVariable: 'NEW_USER_ID',
        isSecret: false,
        enabled: true,
      })
      expect(onClose).toHaveBeenCalled()
    })
  })
})

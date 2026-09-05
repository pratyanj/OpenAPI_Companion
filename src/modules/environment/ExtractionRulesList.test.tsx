import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ExtractionRulesList } from './ExtractionRulesList'
import type { ExtractionRule } from './extraction-rules-types'
import type { EndpointInfo } from '@/adapters'

const mockEndpoints: EndpointInfo[] = [
  { endpointId: 'post /auth/login', method: 'post', path: '/auth/login' },
  { endpointId: 'get /users', method: 'get', path: '/users' },
]

const mockRules: ExtractionRule[] = [
  {
    id: 'rule_1',
    endpointId: 'post /auth/login',
    property: 'access_token',
    targetVariable: 'ACCESS_TOKEN',
    isSecret: true,
    enabled: true,
    createdAt: 1000,
  },
  {
    id: 'rule_2',
    endpointId: 'post /auth/login',
    property: 'data.userId',
    targetVariable: 'USER_ID',
    isSecret: false,
    enabled: false,
    createdAt: 1001,
  },
]

describe('ExtractionRulesList', () => {
  it('renders empty state when rules array is empty', () => {
    render(
      <ExtractionRulesList
        rules={[]}
        endpoints={mockEndpoints}
        onToggleRule={vi.fn()}
        onDeleteRule={vi.fn()}
        onAddRule={vi.fn()}
      />,
    )

    expect(screen.getByText('No extraction rules configured')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create First Rule' })).toBeInTheDocument()
  })

  it('renders configured extraction rules with badges and controls', () => {
    render(
      <ExtractionRulesList
        rules={mockRules}
        endpoints={mockEndpoints}
        onToggleRule={vi.fn()}
        onDeleteRule={vi.fn()}
        onAddRule={vi.fn()}
      />,
    )

    expect(screen.getByText('Auto-Extraction Rules')).toBeInTheDocument()
    expect(screen.getByText('body.access_token')).toBeInTheDocument()
    expect(screen.getByText('{{ACCESS_TOKEN}}')).toBeInTheDocument()
    expect(screen.getByText('body.data.userId')).toBeInTheDocument()
    expect(screen.getByText('{{USER_ID}}')).toBeInTheDocument()
  })

  it('toggles rule active state and deletes rule', () => {
    const onToggleRule = vi.fn()
    const onDeleteRule = vi.fn()

    render(
      <ExtractionRulesList
        rules={mockRules}
        endpoints={mockEndpoints}
        onToggleRule={onToggleRule}
        onDeleteRule={onDeleteRule}
        onAddRule={vi.fn()}
      />,
    )

    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes[0]).toBeDefined()
    fireEvent.click(checkboxes[0]!)
    expect(onToggleRule).toHaveBeenCalledWith('rule_1', false)

    const deleteButtons = screen.getAllByTitle('Delete rule')
    expect(deleteButtons[0]).toBeDefined()
    fireEvent.click(deleteButtons[0]!)
    expect(onDeleteRule).toHaveBeenCalledWith('rule_1')
  })

  it('opens add rule modal and adds a new rule', async () => {
    const onAddRule = vi.fn(async () => {})

    render(
      <ExtractionRulesList
        rules={mockRules}
        endpoints={mockEndpoints}
        onToggleRule={vi.fn()}
        onDeleteRule={vi.fn()}
        onAddRule={onAddRule}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Add Rule' }))

    expect(await screen.findByText('Add Auto-Extraction Rule')).toBeInTheDocument()

    // Test quick preset button click
    const presetBtn = screen.getByRole('button', { name: 'token → {{TOKEN}}' })
    fireEvent.click(presetBtn)

    expect(screen.getByDisplayValue('token')).toBeInTheDocument()
    expect(screen.getByDisplayValue('TOKEN')).toBeInTheDocument()

    // Submit rule
    fireEvent.click(screen.getByRole('button', { name: 'Create Rule' }))

    await waitFor(() => {
      expect(onAddRule).toHaveBeenCalledWith(
        expect.objectContaining({
          property: 'token',
          targetVariable: 'TOKEN',
          isSecret: true,
          enabled: true,
        }),
      )
    })
  })

  it('delegates to onOpenAddModal when provided instead of local state', () => {
    const onOpenAddModal = vi.fn(async () => true)

    render(
      <ExtractionRulesList
        rules={mockRules}
        endpoints={mockEndpoints}
        onToggleRule={vi.fn()}
        onDeleteRule={vi.fn()}
        onAddRule={vi.fn()}
        onOpenAddModal={onOpenAddModal}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Add Rule' }))
    expect(onOpenAddModal).toHaveBeenCalled()
    expect(screen.queryByText('Add Auto-Extraction Rule')).not.toBeInTheDocument()
  })

  it('falls back to local modal if onOpenAddModal returns false or fails', async () => {
    const onOpenAddModal = vi.fn(async () => false)

    render(
      <ExtractionRulesList
        rules={mockRules}
        endpoints={mockEndpoints}
        onToggleRule={vi.fn()}
        onDeleteRule={vi.fn()}
        onAddRule={vi.fn()}
        onOpenAddModal={onOpenAddModal}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Add Rule' }))
    expect(onOpenAddModal).toHaveBeenCalled()

    // Local modal opens as fallback so the user is never stuck
    expect(await screen.findByText('Add Auto-Extraction Rule')).toBeInTheDocument()
  })
})


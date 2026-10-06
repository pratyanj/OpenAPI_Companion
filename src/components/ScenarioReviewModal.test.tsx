import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ScenarioReviewModal } from './ScenarioReviewModal'
import type { Scenario } from '@/modules/workflows/recorder/types'

describe('ScenarioReviewModal', () => {
  const sampleScenario: Scenario = {
    id: 'scen_1',
    name: 'Order Lifecycle',
    projectId: 'test_project',
    steps: [
      {
        id: 'step_1',
        order: 1,
        endpointId: 'post /login',
        method: 'POST',
        endpoint: '/login',
        response: { status: 200, body: JSON.stringify({ token: 'tok_abc' }), durationMs: 40 },
        timestamp: 100,
      },
      {
        id: 'step_2',
        order: 2,
        endpointId: 'post /orders',
        method: 'POST',
        endpoint: '/orders',
        headers: { Authorization: 'Bearer tok_abc' },
        response: { status: 201, body: JSON.stringify({ id: 5055 }), durationMs: 65 },
        timestamp: 200,
      },
      {
        id: 'step_3',
        order: 3,
        endpointId: 'get /orders/{id}',
        method: 'GET',
        endpoint: '/orders/{id}',
        pathParams: { id: '5055' },
        headers: { Authorization: 'Bearer tok_abc' },
        response: { status: 200, durationMs: 30 },
        timestamp: 300,
      },
    ],
    suggestedVariables: [
      {
        id: 'b1',
        variableName: 'token',
        extractedFromStepIndex: 0,
        sourceJsonPath: '$.token',
        originalValue: 'tok_abc',
        targetStepIndex: 1,
        targetLocation: 'header',
        targetKey: 'Authorization',
        enabled: true,
      },
      {
        id: 'b2',
        variableName: 'order_id',
        extractedFromStepIndex: 1,
        sourceJsonPath: '$.id',
        originalValue: '5055',
        targetStepIndex: 2,
        targetLocation: 'path',
        targetKey: 'id',
        enabled: true,
      },
    ],
    createdAt: 100,
    updatedAt: 300,
  }

  it('renders modal with steps and variable detection banner', () => {
    render(
      <ScenarioReviewModal
        isOpen={true}
        scenario={sampleScenario}
        onClose={vi.fn()}
        onConvertToWorkflow={vi.fn()}
      />,
    )

    expect(screen.getByText('Review Recorded Scenario')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Order Lifecycle')).toBeInTheDocument()
    expect(screen.getByText('3 steps captured')).toBeInTheDocument()

    // Variable detection banner
    expect(screen.getByText(/Dynamic Value Detection/)).toBeInTheDocument()
    expect(screen.getByText(/{{token}}/)).toBeInTheDocument()
    expect(screen.getByText(/{{order_id}}/)).toBeInTheDocument()

    // Steps list
    expect(screen.getByText('/login')).toBeInTheDocument()
    expect(screen.getByText('/orders')).toBeInTheDocument()
    expect(screen.getByText('/orders/{id}')).toBeInTheDocument()
  })

  it('allows reordering and deleting steps', async () => {
    const user = userEvent.setup()
    render(
      <ScenarioReviewModal
        isOpen={true}
        scenario={sampleScenario}
        onClose={vi.fn()}
        onConvertToWorkflow={vi.fn()}
      />,
    )

    // Move step 2 down
    const downButtons = screen.getAllByRole('button', { name: 'Move step down' })
    await user.click(downButtons[0]!) // move step 1 down

    // Delete a step
    const deleteButtons = screen.getAllByRole('button', { name: 'Remove step' })
    await user.click(deleteButtons[deleteButtons.length - 1]!)

    expect(screen.getByText('2 steps captured')).toBeInTheDocument()
  })

  it('converts scenario to workflow and triggers callback', async () => {
    const user = userEvent.setup()
    const convertSpy = vi.fn()
    const closeSpy = vi.fn()

    render(
      <ScenarioReviewModal
        isOpen={true}
        scenario={sampleScenario}
        onClose={closeSpy}
        onConvertToWorkflow={convertSpy}
      />,
    )

    const convertBtn = screen.getByRole('button', { name: /Convert to Workflow/i })
    await user.click(convertBtn)

    expect(convertSpy).toHaveBeenCalledTimes(1)
    expect(closeSpy).toHaveBeenCalledTimes(1)
    const workflow = convertSpy.mock.calls[0]![0]
    expect(workflow.name).toBe('Order Lifecycle')
    expect(workflow.steps).toHaveLength(3)
  })

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <ScenarioReviewModal
        isOpen={false}
        scenario={sampleScenario}
        onClose={vi.fn()}
        onConvertToWorkflow={vi.fn()}
      />,
    )

    expect(container.firstChild).toBeNull()
  })
})

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ok } from '@/types'
import { WorkflowRunnerModal } from './WorkflowRunnerModal'
import type { Workflow, WorkflowExecutionOptions } from './types'

describe('WorkflowRunnerModal', () => {
  const sampleWorkflow: Workflow = {
    id: 'wf_runner_test',
    name: 'Order Checkout Flow',
    mode: 'ask-on-failure',
    steps: [
      {
        id: 'step_1',
        endpointId: 'post /api/orders',
        name: 'Create Order',
        assertions: [
          { id: 'a1', type: 'status', operator: 'equals', expected: 201 },
          { id: 'a2', type: 'responseTime', operator: 'lessThan', expected: 500 },
        ],
      },
    ],
    createdAt: 1000,
    updatedAt: 1000,
  }

  it('renders runner modal, runs workflow, and shows assertion badges', async () => {
    const onRun = vi.fn(async (_id: string, opts?: WorkflowExecutionOptions) => {
      opts?.onStepProgress?.(0, 1, {
        stepId: 'step_1',
        endpointId: 'post /api/orders',
        status: 201,
        durationMs: 142,
        success: true,
        assertionsPassed: true,
        assertionResults: [
          {
            assertionId: 'a1',
            passed: true,
            type: 'status',
            operator: 'equals',
            expected: 201,
            actual: 201,
          },
          {
            assertionId: 'a2',
            passed: true,
            type: 'responseTime',
            operator: 'lessThan',
            expected: 500,
            actual: 142,
          },
        ],
        extractedVariables: { orderId: 'ord_9901' },
        responseBody: JSON.stringify({ id: 'ord_9901', status: 'created' }),
      })
      return ok({
        workflowId: 'wf_runner_test',
        status: 'success' as const,
        totalSteps: 1,
        completedSteps: 1,
        results: [
          {
            stepId: 'step_1',
            endpointId: 'post /api/orders',
            status: 201,
            durationMs: 142,
            success: true,
            assertionsPassed: true,
            assertionResults: [
              {
                assertionId: 'a1',
                passed: true,
                type: 'status' as const,
                operator: 'equals' as const,
                expected: 201,
                actual: 201,
              },
              {
                assertionId: 'a2',
                passed: true,
                type: 'responseTime' as const,
                operator: 'lessThan' as const,
                expected: 500,
                actual: 142,
              },
            ],
            extractedVariables: { orderId: 'ord_9901' },
            responseBody: JSON.stringify({ id: 'ord_9901', status: 'created' }),
          },
        ],
        startedAt: Date.now(),
        durationMs: 142,
      })
    })

    const onClose = vi.fn()

    render(
      <WorkflowRunnerModal
        isOpen={true}
        workflow={sampleWorkflow}
        onRun={onRun}
        onClose={onClose}
      />,
    )

    expect(await screen.findByRole('dialog', { name: /Workflow Runner/i })).toBeInTheDocument()
    expect(screen.getByText(/Order Checkout Flow/i)).toBeInTheDocument()
    expect(screen.getByText(/Ask on failure/i)).toBeInTheDocument()

    // Step should be rendered
    expect(screen.getByText('Create Order')).toBeInTheDocument()
    expect(await screen.findByText('Assertions Passed')).toBeInTheDocument()

    // Expand step details via toggle button
    const toggleBtn = screen.getByRole('button', { name: /Toggle step details/i })
    fireEvent.click(toggleBtn)

    // Verify assertions checklist in expanded drawer
    expect(screen.getByText(/Assertions Checklist \(2\/2 Passed\)/i)).toBeInTheDocument()
    expect(screen.getByText('ord_9901')).toBeInTheDocument()
    expect(screen.getByText(/Response Payload:/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Copy/i })).toBeInTheDocument()
  })

  it('displays interactive prompt banner on step failure under ask-on-failure mode', async () => {
    let promptPromise: Promise<'continue' | 'stop'> | undefined

    const onRun = vi.fn(async (_id: string, opts?: WorkflowExecutionOptions) => {
      // Simulate step failure and triggering prompt
      promptPromise = opts?.onFailurePrompt?.(
        0,
        sampleWorkflow.steps[0]!,
        'Expected 201, but got 500 Server Error',
      )
      const action = await promptPromise
      return ok({
        workflowId: 'wf_runner_test',
        status: action === 'continue' ? ('failed' as const) : ('cancelled' as const),
        totalSteps: 1,
        completedSteps: 1,
        results: [],
        startedAt: Date.now(),
        durationMs: 200,
      })
    })

    const onClose = vi.fn()

    render(
      <WorkflowRunnerModal
        isOpen={true}
        workflow={sampleWorkflow}
        onRun={onRun}
        onClose={onClose}
      />,
    )

    expect(await screen.findByRole('dialog', { name: /Workflow Runner/i })).toBeInTheDocument()

    // Wait for the failure prompt banner to appear
    expect(
      await screen.findByText(/Step #1 Failed — Interactive Action Required/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/Expected 201, but got 500 Server Error/i)).toBeInTheDocument()

    // Click "Continue"
    const continueBtn = screen.getByRole('button', { name: /Continue/i })
    fireEvent.click(continueBtn)

    const resolved = await promptPromise
    expect(resolved).toBe('continue')
  })
})

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WorkflowEditorModal } from './WorkflowEditorModal'
import type { Workflow } from './types'

describe('WorkflowEditorModal', () => {
  const sampleWorkflow: Workflow = {
    id: 'wf_test',
    name: 'Sample Flow',
    description: 'Testing flow',
    mode: 'stop-on-failure',
    steps: [
      {
        id: 'step_1',
        endpointId: 'post /api/v1/auth/login',
        name: 'Login Step',
        body: '{"user":"test"}',
        assertions: [
          { id: 'a1', type: 'status', operator: 'equals', expected: 200 },
        ],
        extractions: [
          { id: 'e1', property: '$.token', variableName: 'jwtToken' },
        ],
      },
    ],
    createdAt: 1000,
    updatedAt: 1000,
  }

  const sampleEndpoints = [
    { endpointId: 'post /api/v1/auth/login', path: '/api/v1/auth/login', method: 'post' },
    { endpointId: 'get /api/v1/users', path: '/api/v1/users', method: 'get' },
  ]

  it('renders with name, description, and 3 failure modes', () => {
    const onSave = vi.fn()
    const onClose = vi.fn()

    render(
      <WorkflowEditorModal
        isOpen={true}
        workflow={sampleWorkflow}
        endpoints={sampleEndpoints}
        onSave={onSave}
        onClose={onClose}
      />,
    )

    expect(screen.getByDisplayValue('Sample Flow')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Testing flow')).toBeInTheDocument()

    expect(screen.getByRole('button', { name: /Stop on failure/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Continue on failure/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Ask on failure/i })).toBeInTheDocument()
  })

  it('switches failure modes when clicked', async () => {
    const onSave = vi.fn()
    const onClose = vi.fn()

    render(
      <WorkflowEditorModal
        isOpen={true}
        workflow={sampleWorkflow}
        endpoints={sampleEndpoints}
        onSave={onSave}
        onClose={onClose}
      />,
    )

    const askBtn = screen.getByRole('button', { name: /Ask on failure/i })
    fireEvent.click(askBtn)

    const saveBtn = screen.getByRole('button', { name: /(Save|Update) Workflow/i })
    fireEvent.click(saveBtn)

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'ask-on-failure',
      }),
    )
  })

  it('switches to Assertions tab and renders presets', () => {
    const onSave = vi.fn()
    const onClose = vi.fn()

    render(
      <WorkflowEditorModal
        isOpen={true}
        workflow={sampleWorkflow}
        endpoints={sampleEndpoints}
        onSave={onSave}
        onClose={onClose}
      />,
    )

    const assertionsTab = screen.getByRole('button', { name: /^Assertions/i })
    fireEvent.click(assertionsTab)

    expect(screen.getByText(/Test Assertions/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /\+ Status 2xx/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /\+ 200 OK/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /\+ < 500ms/i })).toBeInTheDocument()

    // Existing assertion from sampleWorkflow should be visible
    expect(screen.getByDisplayValue('200')).toBeInTheDocument()
  })

  it('adds an assertion via preset button', () => {
    const onSave = vi.fn()
    const onClose = vi.fn()

    render(
      <WorkflowEditorModal
        isOpen={true}
        workflow={sampleWorkflow}
        endpoints={sampleEndpoints}
        onSave={onSave}
        onClose={onClose}
      />,
    )

    const assertionsTab = screen.getByRole('button', { name: /^Assertions/i })
    fireEvent.click(assertionsTab)

    const latencyPreset = screen.getByRole('button', { name: /\+ < 500ms/i })
    fireEvent.click(latencyPreset)

    expect(screen.getByDisplayValue('500')).toBeInTheDocument()
  })

  it('switches to Extractions tab and manages variable extraction rules', () => {
    const onSave = vi.fn()
    const onClose = vi.fn()

    render(
      <WorkflowEditorModal
        isOpen={true}
        workflow={sampleWorkflow}
        endpoints={sampleEndpoints}
        onSave={onSave}
        onClose={onClose}
      />,
    )

    const extractionsTab = screen.getByRole('button', { name: /^Extractions/i })
    fireEvent.click(extractionsTab)

    expect(screen.getByText(/Step Response Extractions/i)).toBeInTheDocument()
    // Existing extraction rule from sampleWorkflow
    expect(screen.getByDisplayValue('$.token')).toBeInTheDocument()
    expect(screen.getByDisplayValue('jwtToken')).toBeInTheDocument()

    const addBtn = screen.getByRole('button', { name: /Add Extraction/i })
    fireEvent.click(addBtn)

    expect(screen.getByDisplayValue('var_2')).toBeInTheDocument()
  })
})

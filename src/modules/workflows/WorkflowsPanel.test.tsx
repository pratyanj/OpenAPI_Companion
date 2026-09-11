import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { WorkflowsPanel } from './WorkflowsPanel'
import { WorkflowRunnerModal } from './WorkflowRunnerModal'
import type { WorkflowsPanelService, Workflow } from './types'
import { EventBus } from '@/core/events'
import { ok, type Result } from '@/types'

const sampleWorkflow: Workflow = {
  id: 'wf_1',
  name: 'User Onboarding Flow',
  description: 'Creates a user and validates profile',
  mode: 'stop-on-failure',
  steps: [
    { id: 's1', endpointId: 'post /users', name: 'Create User' },
    { id: 's2', endpointId: 'get /users/profile', name: 'Get Profile' },
  ],
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  lastRunAt: 1_700_000_000_000,
  lastRunStatus: 'success',
  lastRunDurationMs: 420,
}

function mockService(over: Partial<WorkflowsPanelService> = {}): WorkflowsPanelService {
  return {
    list: vi.fn(async (): Promise<Result<Workflow[]>> => ok([])),
    get: vi.fn(async (): Promise<Result<Workflow | null>> => ok(sampleWorkflow)),
    create: vi.fn(async (): Promise<Result<Workflow>> => ok(sampleWorkflow)),
    update: vi.fn(async (): Promise<Result<Workflow>> => ok(sampleWorkflow)),
    delete: vi.fn(async (): Promise<Result<void>> => ok(undefined)),
    duplicate: vi.fn(async (): Promise<Result<Workflow>> => ok(sampleWorkflow)),
    execute: vi.fn(async () =>
      ok({
        workflowId: 'wf_1',
        status: 'success' as const,
        totalSteps: 2,
        completedSteps: 2,
        results: [],
        startedAt: 1_700_000_000_000,
        durationMs: 420,
      }),
    ),
    listEndpoints: vi.fn(() => [
      { endpointId: 'post /users', method: 'post', path: '/users', summary: 'Create user' },
      {
        endpointId: 'get /users/profile',
        method: 'get',
        path: '/users/profile',
        summary: 'Get profile',
      },
    ]),
    ...over,
  }
}

describe('WorkflowsPanel', () => {
  it('shows empty state when there are no workflows', async () => {
    render(<WorkflowsPanel service={mockService()} bus={new EventBus()} environmentId="default" />)
    expect(await screen.findByText('No Workflows Yet')).toBeInTheDocument()
    expect(screen.getByText('Create First Workflow')).toBeInTheDocument()
  })

  it('renders workflow cards with metadata chips and step counts', async () => {
    const service = mockService({
      list: vi.fn(async () => ok([sampleWorkflow])),
    })
    render(<WorkflowsPanel service={service} bus={new EventBus()} environmentId="default" />)

    expect(await screen.findByText('User Onboarding Flow')).toBeInTheDocument()
    expect(screen.getByText('Creates a user and validates profile')).toBeInTheDocument()
    expect(screen.getByText('2 steps')).toBeInTheDocument()
    expect(screen.getByText('Stop on fail')).toBeInTheDocument()
    expect(screen.getByText(/Passed \(420ms\)/)).toBeInTheDocument()
  })

  it('triggers onOpenWorkflowEditor when clicking New Workflow', async () => {
    const onOpenWorkflowEditor = vi.fn()
    render(
      <WorkflowsPanel
        service={mockService()}
        bus={new EventBus()}
        environmentId="default"
        onOpenWorkflowEditor={onOpenWorkflowEditor}
      />,
    )
    expect(await screen.findByText('No Workflows Yet')).toBeInTheDocument()

    const newBtn = screen.getByText('New Workflow')
    fireEvent.click(newBtn)

    expect(onOpenWorkflowEditor).toHaveBeenCalledWith({ workflow: null })
  })

  it('triggers duplicate action on workflow card', async () => {
    const duplicateMock = vi.fn(async () => ok({ ...sampleWorkflow, id: 'wf_2' }))
    const service = mockService({
      list: vi.fn(async () => ok([sampleWorkflow])),
      duplicate: duplicateMock,
    })

    render(<WorkflowsPanel service={service} bus={new EventBus()} environmentId="default" />)
    expect(await screen.findByText('User Onboarding Flow')).toBeInTheDocument()

    const duplicateBtn = screen.getByTitle('Duplicate workflow')
    fireEvent.click(duplicateBtn)

    await waitFor(() => {
      expect(duplicateMock).toHaveBeenCalledWith('wf_1')
    })
  })

  it('triggers onOpenWorkflowRunner when clicking Run button', async () => {
    const onOpenWorkflowRunner = vi.fn()
    const service = mockService({
      list: vi.fn(async () => ok([sampleWorkflow])),
    })

    render(
      <WorkflowsPanel
        service={service}
        bus={new EventBus()}
        environmentId="default"
        onOpenWorkflowRunner={onOpenWorkflowRunner}
      />,
    )
    expect(await screen.findByText('User Onboarding Flow')).toBeInTheDocument()

    const runBtn = screen.getByText('Run')
    fireEvent.click(runBtn)

    expect(onOpenWorkflowRunner).toHaveBeenCalledWith({
      workflow: sampleWorkflow,
      environmentId: 'default',
    })
  })

  it('renders WorkflowRunnerModal dialog with controls and step details', async () => {
    const onRun = vi.fn(async () =>
      ok({
        workflowId: 'wf_1',
        status: 'success' as const,
        totalSteps: 2,
        completedSteps: 2,
        results: [],
        startedAt: 1_700_000_000_000,
        durationMs: 420,
      }),
    )
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
    expect(screen.getByText('Create User')).toBeInTheDocument()
    expect(screen.getByText('Get Profile')).toBeInTheDocument()
    expect(onRun).toHaveBeenCalledWith('wf_1', expect.anything())
  })
})

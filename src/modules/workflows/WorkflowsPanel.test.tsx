import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { WorkflowsPanel } from './WorkflowsPanel'
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

  it('opens create modal when clicking New Workflow', async () => {
    render(<WorkflowsPanel service={mockService()} bus={new EventBus()} environmentId="default" />)
    const newBtn = await screen.findByText('New Workflow')
    fireEvent.click(newBtn)

    expect(await screen.findByText('Create New Workflow')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('e.g. Smoke Test User Flow')).toBeInTheDocument()
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

  it('opens runner modal when clicking Run button', async () => {
    const service = mockService({
      list: vi.fn(async () => ok([sampleWorkflow])),
    })

    render(<WorkflowsPanel service={service} bus={new EventBus()} environmentId="default" />)
    expect(await screen.findByText('User Onboarding Flow')).toBeInTheDocument()

    const runBtn = screen.getByText('Run')
    fireEvent.click(runBtn)

    expect(await screen.findByText('Workflow Runner: User Onboarding Flow')).toBeInTheDocument()
  })
})

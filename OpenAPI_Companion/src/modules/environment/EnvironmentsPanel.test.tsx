import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { EnvironmentsPanel, type EnvironmentPanelService } from './EnvironmentsPanel'
import { EventBus } from '@/core/events'
import { ok, err, type Result } from '@/types'
import type { Environment } from '@/core/project'

const def: Environment = {
  id: 'default',
  name: 'Local',
  baseUrl: 'https://localhost:8000',
  variables: {},
  updatedAt: 0,
}
const qa: Environment = { id: 'qa', name: 'QA', baseUrl: 'https://qa', variables: {}, updatedAt: 0 }

function mockService(over: Partial<EnvironmentPanelService> = {}): EnvironmentPanelService {
  return {
    list: vi.fn(async (): Promise<Result<Environment[]>> => ok([def])),
    getActiveId: vi.fn(async () => 'default'),
    switch: vi.fn(async (): Promise<Result<Environment>> => ok(qa)),
    create: vi.fn(async (): Promise<Result<Environment>> => ok(qa)),
    update: vi.fn(async (): Promise<Result<Environment>> => ok(def)),
    delete: vi.fn(async (): Promise<Result<void>> => ok(undefined)),
    listBuiltins: () => [{ id: 'staging', name: 'Staging' }],
    ...over,
  }
}

describe('EnvironmentsPanel', () => {
  it('marks the active environment and switches in place for others', async () => {
    const service = mockService({ list: vi.fn(async () => ok([def, qa])) })
    render(<EnvironmentsPanel service={service} bus={new EventBus()} />)

    expect(await screen.findByText('Local')).toBeInTheDocument()
    expect(screen.getByText('active')).toBeInTheDocument() // default is active

    fireEvent.click(screen.getByRole('button', { name: 'Switch' }))
    expect(service.switch).toHaveBeenCalledWith('qa')
  })

  it('creates an environment with name, base URL, and variables', async () => {
    const service = mockService()
    render(<EnvironmentsPanel service={service} bus={new EventBus()} />)
    await screen.findByText('Local')

    fireEvent.change(screen.getByLabelText('Environment name'), { target: { value: 'Staging' } })
    fireEvent.change(screen.getByLabelText('Base URL'), { target: { value: 'https://stg' } })
    fireEvent.click(screen.getByText('+ Add variable'))
    fireEvent.change(screen.getByLabelText('Variable 1 name'), { target: { value: 'TOKEN' } })
    fireEvent.change(screen.getByLabelText('Variable 1 value'), { target: { value: 'abc' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create environment' }))

    await waitFor(() =>
      expect(service.create).toHaveBeenCalledWith({
        name: 'Staging',
        baseUrl: 'https://stg',
        variables: { TOKEN: 'abc' },
      }),
    )
  })

  it('offers built-in suggestions and creates one on click', async () => {
    const service = mockService()
    render(<EnvironmentsPanel service={service} bus={new EventBus()} />)
    await screen.findByText('Local')

    fireEvent.click(screen.getByRole('button', { name: '+ Staging' }))
    expect(service.create).toHaveBeenCalledWith({ name: 'Staging' })
  })

  it('edits an existing environment (incl. adding a variable to default)', async () => {
    const service = mockService({ list: vi.fn(async () => ok([def])) })
    render(<EnvironmentsPanel service={service} bus={new EventBus()} />)
    await screen.findByText('Local')

    // Enter edit mode for the default environment, add a variable, save.
    fireEvent.click(screen.getByRole('button', { name: 'Edit Local' }))
    expect(screen.getByText('Edit environment')).toBeInTheDocument()
    fireEvent.click(screen.getByText('+ Add variable'))
    fireEvent.change(screen.getByLabelText('Variable 1 name'), { target: { value: 'BASE_URL' } })
    fireEvent.change(screen.getByLabelText('Variable 1 value'), { target: { value: 'http://x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(service.update).toHaveBeenCalledWith('default', {
        name: 'Local',
        baseUrl: 'https://localhost:8000',
        variables: { BASE_URL: 'http://x' },
      }),
    )
  })

  it('deletes a non-default environment', async () => {
    const service = mockService({ list: vi.fn(async () => ok([def, qa])) })
    render(<EnvironmentsPanel service={service} bus={new EventBus()} />)
    await screen.findByText('QA')

    fireEvent.click(screen.getByRole('button', { name: 'Delete QA' }))
    expect(service.delete).toHaveBeenCalledWith('qa')
  })

  it('shows a validation error when create fails', async () => {
    const service = mockService({
      create: vi.fn(async () =>
        err({ code: 'ENV_DUPLICATE_NAME', message: 'Name exists', recoverable: true }),
      ),
    })
    render(<EnvironmentsPanel service={service} bus={new EventBus()} />)
    await screen.findByText('Local')

    fireEvent.change(screen.getByLabelText('Environment name'), { target: { value: 'QA' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create environment' }))

    expect(await screen.findByText('Name exists')).toBeInTheDocument()
  })
})

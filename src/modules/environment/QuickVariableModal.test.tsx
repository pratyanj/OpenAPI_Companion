import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { EventBus } from '@/core/events'
import { ok } from '@/types'
import type { Environment } from '@/core/project'
import { QuickVariableModal } from './QuickVariableModal'
import type { EnvironmentPanelService } from './EnvironmentsPanel'

function mockEnvService(overrides: Partial<EnvironmentPanelService> = {}): EnvironmentPanelService {
  let currentEnv: Environment = {
    id: 'default',
    name: 'Development',
    baseUrl: 'https://api.dev.local',
    variables: {
      API_KEY: 'test-key-123',
      BASE_URL: 'https://api.dev.local',
      USER_TOKEN: 'bearer-token-abc',
    },
    secrets: ['API_KEY', 'USER_TOKEN'],
    updatedAt: 1000,
  }

  const prodEnv: Environment = {
    id: 'production',
    name: 'Production',
    baseUrl: 'https://api.prod.com',
    variables: {
      API_KEY: 'prod-key-999',
    },
    secrets: ['API_KEY'],
    updatedAt: 2000,
  }

  return {
    list: vi.fn(async () => ok([currentEnv, prodEnv])),
    getActiveId: vi.fn(async () => 'default'),
    update: vi.fn(async (_id: string, patch: Partial<Environment>) => {
      currentEnv = {
        ...currentEnv,
        ...patch,
        variables: patch.variables ? { ...patch.variables } : currentEnv.variables,
        secrets: patch.secrets ? [...patch.secrets] : currentEnv.secrets,
        updatedAt: Date.now(),
      }
      return ok(currentEnv)
    }),
    switch: vi.fn(async (id: string) => {
      const target = id === 'production' ? prodEnv : currentEnv
      return ok(target)
    }),
    create: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  }
}

describe('QuickVariableModal', () => {
  let bus: EventBus

  beforeEach(() => {
    bus = new EventBus()
  })

  it('renders modal, loads active environment, and lists variables', async () => {
    const service = mockEnvService()
    const onClose = vi.fn()

    render(<QuickVariableModal service={service} bus={bus} onClose={onClose} />)

    await waitFor(() => {
      expect(screen.getByText('Project Variables')).toBeInTheDocument()
      expect(screen.getByDisplayValue('API_KEY')).toBeInTheDocument()
      expect(screen.getByDisplayValue('BASE_URL')).toBeInTheDocument()
    })
  })

  it('filters variables by search query', async () => {
    const service = mockEnvService()
    render(<QuickVariableModal service={service} bus={bus} onClose={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByDisplayValue('API_KEY')).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText('Filter variables...')
    fireEvent.change(searchInput, { target: { value: 'USER' } })

    expect(screen.queryByDisplayValue('API_KEY')).not.toBeInTheDocument()
    expect(screen.getByDisplayValue('USER_TOKEN')).toBeInTheDocument()
  })

  it('quick adds a new variable and immediately saves', async () => {
    const service = mockEnvService()
    render(<QuickVariableModal service={service} bus={bus} onClose={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByDisplayValue('API_KEY')).toBeInTheDocument()
    })

    const keyInput = screen.getByPlaceholderText('VARIABLE_NAME')
    const valInput = screen.getByPlaceholderText('Value')
    const addButton = screen.getByRole('button', { name: /add/i })

    fireEvent.change(keyInput, { target: { value: 'NEW_VAR' } })
    fireEvent.change(valInput, { target: { value: 'new-value-123' } })

    await act(async () => {
      fireEvent.click(addButton)
    })

    expect(service.update).toHaveBeenCalledWith(
      'default',
      expect.objectContaining({
        variables: expect.objectContaining({
          NEW_VAR: 'new-value-123',
        }),
      }),
    )

    await waitFor(() => {
      expect(screen.getByDisplayValue('NEW_VAR')).toBeInTheDocument()
      expect(screen.getByDisplayValue('new-value-123')).toBeInTheDocument()
    })
  })

  it('auto-saves variable value on blur', async () => {
    const service = mockEnvService()
    render(<QuickVariableModal service={service} bus={bus} onClose={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByDisplayValue('BASE_URL')).toBeInTheDocument()
    })

    const valInput = screen.getByDisplayValue('https://api.dev.local')
    fireEvent.change(valInput, { target: { value: 'https://updated.dev.local' } })

    await act(async () => {
      fireEvent.blur(valInput)
    })

    expect(service.update).toHaveBeenCalledWith(
      'default',
      expect.objectContaining({
        variables: expect.objectContaining({
          BASE_URL: 'https://updated.dev.local',
        }),
      }),
    )
  })

  it('toggles secret status and auto-saves', async () => {
    const service = mockEnvService()
    render(<QuickVariableModal service={service} bus={bus} onClose={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByDisplayValue('BASE_URL')).toBeInTheDocument()
    })

    // BASE_URL is not in secrets initially
    const lockBtn = screen.getByLabelText('Mark as secret variable')
    await act(async () => {
      fireEvent.click(lockBtn)
    })

    expect(service.update).toHaveBeenCalledWith(
      'default',
      expect.objectContaining({
        secrets: expect.arrayContaining(['API_KEY', 'USER_TOKEN', 'BASE_URL']),
      }),
    )
  })

  it('deletes variable and auto-saves', async () => {
    const service = mockEnvService()
    render(<QuickVariableModal service={service} bus={bus} onClose={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByDisplayValue('BASE_URL')).toBeInTheDocument()
    })

    const deleteBtn = screen.getByLabelText('Delete BASE_URL')
    await act(async () => {
      fireEvent.click(deleteBtn)
    })

    expect(service.update).toHaveBeenCalledWith(
      'default',
      expect.objectContaining({
        variables: expect.not.objectContaining({
          BASE_URL: expect.anything(),
        }),
      }),
    )
  })

  it('displays the variable count for the project', async () => {
    const service = mockEnvService()
    render(<QuickVariableModal service={service} bus={bus} onClose={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText(/3 variables stored for this project/i)).toBeInTheDocument()
    })
  })
})

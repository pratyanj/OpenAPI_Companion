import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { EventBus } from '@/core/events'
import { EnvironmentSwitcher } from './EnvironmentSwitcher'
import { ok } from '@/types'
import type { Environment } from '@/core/project'

describe('EnvironmentSwitcher', () => {
  const mockEnvs: Environment[] = [
    { id: 'default', name: 'Default', baseUrl: '', variables: {}, updatedAt: 1 },
    { id: 'staging', name: 'Staging', baseUrl: 'https://staging', variables: {}, updatedAt: 2 },
  ]

  const createService = () => ({
    list: vi.fn().mockResolvedValue(ok(mockEnvs)),
    getActiveId: vi.fn().mockResolvedValue('default'),
    switch: vi.fn().mockResolvedValue(ok(mockEnvs[1])),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    listBuiltins: vi.fn().mockReturnValue([]),
  })

  it('renders environment options and allows switching', async () => {
    const user = userEvent.setup()
    const service = createService()
    const bus = new EventBus()

    render(<EnvironmentSwitcher service={service} bus={bus} activeId="default" />)

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: /select environment/i })).toBeInTheDocument()
    })

    const select = screen.getByRole('combobox', { name: /select environment/i })
    expect(select).toHaveValue('default')

    await user.selectOptions(select, 'staging')
    expect(service.switch).toHaveBeenCalledWith('staging')
  })

  it('refreshes environment list on ENVIRONMENT_CREATED', async () => {
    const service = createService()
    const bus = new EventBus()

    render(<EnvironmentSwitcher service={service} bus={bus} activeId="default" />)

    await waitFor(() => {
      expect(service.list).toHaveBeenCalledTimes(1)
    })

    bus.publish('ENVIRONMENT_CREATED', { environmentId: 'prod' })

    await waitFor(() => {
      expect(service.list).toHaveBeenCalledTimes(2)
    })
  })
})

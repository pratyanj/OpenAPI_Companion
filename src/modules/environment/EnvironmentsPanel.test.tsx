import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { EnvironmentsPanel, type EnvironmentPanelService } from './EnvironmentsPanel'
import { EventBus } from '@/core/events'
import { ok, err, type Result } from '@/types'
import type { Environment } from '@/core/project'

const def: Environment = {
  id: 'default',
  name: 'Default',
  baseUrl: 'https://localhost:8000',
  variables: {},
  updatedAt: 0,
}

function mockService(over: Partial<EnvironmentPanelService> = {}): EnvironmentPanelService {
  return {
    list: vi.fn(async (): Promise<Result<Environment[]>> => ok([def])),
    getActiveId: vi.fn(async () => 'default'),
    update: vi.fn(async (): Promise<Result<Environment>> => ok(def)),
    ...over,
  }
}

describe('EnvironmentsPanel (Variables)', () => {
  it('renders Project Variables panel with empty state when no variables are set', async () => {
    const service = mockService()
    render(<EnvironmentsPanel service={service} bus={new EventBus()} />)

    expect(await screen.findByText('Project Variables')).toBeInTheDocument()
    expect(screen.getByText('No variables stored for this project yet.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Add variable' })).toBeInTheDocument()
  })

  it('adds a variable in Table mode and auto-saves', async () => {
    const service = mockService()
    render(<EnvironmentsPanel service={service} bus={new EventBus()} />)
    await screen.findByText('Project Variables')

    fireEvent.click(screen.getByRole('button', { name: '+ Add variable' }))
    fireEvent.change(screen.getByLabelText('Variable 1 name'), { target: { value: 'TOKEN' } })
    fireEvent.change(screen.getByLabelText('Variable 1 value'), { target: { value: 'abc' } })

    await waitFor(() =>
      expect(service.update).toHaveBeenCalledWith('default', {
        name: 'Default',
        variables: { TOKEN: 'abc' },
        secrets: [],
        baseUrl: 'https://localhost:8000',
      }),
    )
  })

  it('edits existing project variables and auto-saves', async () => {
    const existing: Environment = {
      id: 'default',
      name: 'Default',
      baseUrl: '',
      variables: { API_KEY: 'old_val' },
      secrets: ['API_KEY'],
      updatedAt: 0,
    }
    const service = mockService({ list: vi.fn(async () => ok([existing])) })
    render(<EnvironmentsPanel service={service} bus={new EventBus()} />)
    await screen.findByText('Project Variables')

    expect(screen.getByDisplayValue('API_KEY')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Variable 1 value'), { target: { value: 'new_val' } })

    await waitFor(() =>
      expect(service.update).toHaveBeenCalledWith('default', {
        name: 'Default',
        variables: { API_KEY: 'new_val' },
        secrets: ['API_KEY'],
      }),
    )
  })

  it('deletes a variable row via Edit menu and auto-saves', async () => {
    const existing: Environment = {
      id: 'default',
      name: 'Default',
      baseUrl: '',
      variables: { KEY_TO_DELETE: 'bye' },
      updatedAt: 0,
    }
    const service = mockService({ list: vi.fn(async () => ok([existing])) })
    render(<EnvironmentsPanel service={service} bus={new EventBus()} />)
    await screen.findByText('Project Variables')

    expect(screen.getByDisplayValue('KEY_TO_DELETE')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit KEY_TO_DELETE' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete variable' }))
    expect(screen.queryByDisplayValue('KEY_TO_DELETE')).not.toBeInTheDocument()

    await waitFor(() =>
      expect(service.update).toHaveBeenCalledWith('default', {
        name: 'Default',
        variables: {},
        secrets: [],
      }),
    )
  })

  it('supports Raw .env mode for bulk variable editing and auto-saves', async () => {
    const service = mockService()
    render(<EnvironmentsPanel service={service} bus={new EventBus()} />)
    await screen.findByText('Project Variables')

    fireEvent.click(screen.getByLabelText('Raw .env mode'))

    const rawTextarea = screen.getByLabelText('Raw environment content')
    fireEvent.change(rawTextarea, {
      target: { value: 'API_HOST=prod.api.com\nAPI_KEY=secret_key_123' },
    })

    await waitFor(() => {
      expect(service.update).toHaveBeenCalledWith('default', {
        name: 'Default',
        variables: {
          API_HOST: 'prod.api.com',
          API_KEY: 'secret_key_123',
        },
        secrets: ['API_KEY'],
        baseUrl: 'https://localhost:8000',
      })
    })
  })

  it('marks variable as secret and toggles visibility via input eye button', async () => {
    const service = mockService()
    render(<EnvironmentsPanel service={service} bus={new EventBus()} />)
    await screen.findByText('Project Variables')

    fireEvent.click(screen.getByRole('button', { name: '+ Add variable' }))
    fireEvent.change(screen.getByLabelText('Variable 1 name'), { target: { value: 'MY_TOKEN' } })
    const valueInput = screen.getByLabelText('Variable 1 value')
    fireEvent.change(valueInput, { target: { value: 'topsecret' } })

    // By default it's text and eye button is NOT rendered
    expect(valueInput).toHaveAttribute('type', 'text')
    expect(screen.queryByLabelText('Reveal variable 1')).not.toBeInTheDocument()

    // Mark as secret via Edit menu
    fireEvent.click(screen.getByRole('button', { name: 'Edit MY_TOKEN' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Mark as secret' }))
    expect(valueInput).toHaveAttribute('type', 'password')

    // Eye button is now present on the secret input: click to reveal
    const revealBtn = screen.getByLabelText('Reveal variable 1')
    fireEvent.click(revealBtn)
    expect(valueInput).toHaveAttribute('type', 'text')

    // Click again to hide
    const hideBtn = screen.getByLabelText('Hide variable 1')
    fireEvent.click(hideBtn)
    expect(valueInput).toHaveAttribute('type', 'password')

    await waitFor(() => {
      expect(service.update).toHaveBeenCalledWith('default', {
        name: 'Default',
        variables: { MY_TOKEN: 'topsecret' },
        secrets: ['MY_TOKEN'],
        baseUrl: 'https://localhost:8000',
      })
    })
  })

  it('imports variables from pasted .env format', async () => {
    const service = mockService()
    render(<EnvironmentsPanel service={service} bus={new EventBus()} />)
    await screen.findByText('Project Variables')

    fireEvent.click(screen.getAllByRole('button', { name: 'Import .env' })[0]!)
    expect(screen.getByText('Import Environment Variables')).toBeInTheDocument()

    const importArea = screen.getByLabelText('Import text')
    fireEvent.change(importArea, {
      target: { value: 'PORT=9000\nJWT_SECRET=supersecret' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Import Variables' }))

    await waitFor(() => {
      expect(service.update).toHaveBeenCalledWith('default', {
        name: 'Default',
        variables: { PORT: '9000', JWT_SECRET: 'supersecret' },
        secrets: ['JWT_SECRET'],
      })
    })
  })

  it('opens export dialog and shows serialized .env', async () => {
    const envWithVars: Environment = {
      id: 'default',
      name: 'Default',
      baseUrl: '',
      variables: { API_KEY: 'secret1', URL: 'http://localhost' },
      secrets: ['API_KEY'],
      updatedAt: 0,
    }
    const service = mockService({ list: vi.fn(async () => ok([envWithVars])) })
    render(<EnvironmentsPanel service={service} bus={new EventBus()} />)
    await screen.findByText('Project Variables')

    fireEvent.click(screen.getByRole('button', { name: 'Export .env' }))
    expect(screen.getByText('Export Environment Variables')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy .env' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '.env file' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Postman JSON' })).toBeInTheDocument()
  })

  it('downloads .env with exact filename .env and octet-stream', async () => {
    const envWithVars: Environment = {
      id: 'default',
      name: 'Default',
      baseUrl: '',
      variables: { API_KEY: 'secret1' },
      updatedAt: 0,
    }
    const service = mockService({ list: vi.fn(async () => ok([envWithVars])) })
    render(<EnvironmentsPanel service={service} bus={new EventBus()} />)
    await screen.findByText('Project Variables')

    const originalCreateObjectURL = URL.createObjectURL
    URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url')
    URL.revokeObjectURL = vi.fn()
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    let downloadedFilename = ''
    const originalAppendChild = document.body.appendChild.bind(document.body)
    vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
      if (node instanceof HTMLAnchorElement) {
        downloadedFilename = node.download
      }
      return originalAppendChild(node)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Export .env' }))
    fireEvent.click(screen.getByRole('button', { name: '.env file' }))

    expect(downloadedFilename).toBe('.env')
    expect(clickSpy).toHaveBeenCalled()

    clickSpy.mockRestore()
    URL.createObjectURL = originalCreateObjectURL
  })

  it('shows error when update fails', async () => {
    const service = mockService({
      update: vi.fn(async () => err({ code: 'STORAGE_FAILED', message: 'Storage error', recoverable: true })),
    })
    render(<EnvironmentsPanel service={service} bus={new EventBus()} />)
    await screen.findByText('Project Variables')

    fireEvent.click(screen.getByRole('button', { name: '+ Add variable' }))
    fireEvent.change(screen.getByLabelText('Variable 1 name'), { target: { value: 'FAIL' } })

    expect(await screen.findByText('Storage error')).toBeInTheDocument()
  })
})

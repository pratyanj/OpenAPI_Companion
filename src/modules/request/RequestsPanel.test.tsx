import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { RequestsPanel } from './RequestsPanel'
import type { RequestPanelService, RequestTemplate } from './types'
import { EventBus } from '@/core/events'
import { ok, type Result } from '@/types'

const template: RequestTemplate = {
  templateId: 'tpl_1',
  name: 'Create user',
  endpointId: 'post /users',
  method: 'post',
  environmentId: 'default',
  body: '{"name":"a"}',
  updatedAt: 1_700_000_000_000,
}

function mockService(over: Partial<RequestPanelService> = {}): RequestPanelService {
  return {
    listTemplates: vi.fn(async (): Promise<Result<RequestTemplate[]>> => ok([])),
    saveOpenAsTemplate: vi.fn(async (): Promise<Result<RequestTemplate | null>> => ok(template)),
    createCustomTemplate: vi.fn(async (): Promise<Result<RequestTemplate>> => ok(template)),
    updateTemplate: vi.fn(async (): Promise<Result<RequestTemplate>> => ok(template)),
    applyTemplate: vi.fn(async (): Promise<Result<void>> => ok(undefined)),
    locateAndFill: vi.fn(async (): Promise<Result<void>> => ok(undefined)),
    deleteTemplate: vi.fn(async (): Promise<Result<void>> => ok(undefined)),
    listEndpoints: vi.fn(() => [
      { endpointId: 'post /users', method: 'post', path: '/users', summary: 'Create user' },
      { endpointId: 'get /users', method: 'get', path: '/users', summary: 'List users' },
    ]),
    getOpenRequests: vi.fn(() => [
      { endpointId: 'post /users', method: 'post', body: '{"open":true}' },
    ]),
    ...over,
  }
}

describe('RequestsPanel', () => {
  it('shows the empty state when there are no templates', async () => {
    render(<RequestsPanel service={mockService()} bus={new EventBus()} environmentId="default" />)
    expect(await screen.findByText('No request presets yet')).toBeInTheDocument()
  })

  it('lists templates with their method badge, endpoint path, and name', async () => {
    const service = mockService({ listTemplates: vi.fn(async () => ok([template])) })
    render(<RequestsPanel service={service} bus={new EventBus()} environmentId="default" />)
    expect(await screen.findByText('Create user')).toBeInTheDocument()
    expect(screen.getByText('/users')).toBeInTheDocument()
    expect(screen.getAllByText('POST').length).toBeGreaterThanOrEqual(1)
  })

  it('expands a preset card on click to show formatted JSON body and copy button', async () => {
    const service = mockService({ listTemplates: vi.fn(async () => ok([template])) })
    render(<RequestsPanel service={service} bus={new EventBus()} environmentId="default" />)
    const cardHeader = await screen.findByText('Create user')

    fireEvent.click(cardHeader)

    expect(await screen.findByText('Request Body (JSON)')).toBeInTheDocument()
    expect(screen.getByText(/"name": "a"/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy payload' })).toBeInTheDocument()
  })

  it('captures the current open request as a named template from Swagger', async () => {
    const service = mockService()
    render(<RequestsPanel service={service} bus={new EventBus()} environmentId="default" />)
    await screen.findByText('No request presets yet')

    // Click "Capture open" button
    fireEvent.click(screen.getByRole('button', { name: /Capture open/i }))

    expect(screen.getByText(/Found open payload for/i)).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText(/Preset name/i), {
      target: { value: 'Captured Preset' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(service.saveOpenAsTemplate).toHaveBeenCalledWith('Captured Preset', 'default'),
    )
  })

  it('creates a custom preset via the dialog', async () => {
    const service = mockService()
    render(<RequestsPanel service={service} bus={new EventBus()} environmentId="default" />)
    await screen.findByText('No request presets yet')

    // Click "New preset" button
    fireEvent.click(screen.getByRole('button', { name: /New preset/i }))

    expect(await screen.findByText('Create Request Preset')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/Preset Name/i), {
      target: { value: 'My Custom Preset' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create Preset' }))

    await waitFor(() =>
      expect(service.createCustomTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'My Custom Preset',
          endpointId: 'post /users',
          environmentId: 'default',
        }),
      ),
    )
  })

  it('allows picking a different endpoint via the searchable endpoint dropdown', async () => {
    const service = mockService()
    render(<RequestsPanel service={service} bus={new EventBus()} environmentId="default" />)
    await screen.findByText('No request presets yet')

    // Click "New preset" button
    fireEvent.click(screen.getByRole('button', { name: /New preset/i }))
    expect(await screen.findByText('Create Request Preset')).toBeInTheDocument()

    // Open Endpoint Picker dropdown (click trigger box)
    fireEvent.click(screen.getByText(/Create user/))

    // Search for "List users"
    fireEvent.change(screen.getByPlaceholderText(/Filter by path/i), {
      target: { value: 'List' },
    })

    // Click the matched endpoint
    fireEvent.click(screen.getByText(/List users/))

    fireEvent.change(screen.getByLabelText(/Preset Name/i), {
      target: { value: 'List Preset' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create Preset' }))

    await waitFor(() =>
      expect(service.createCustomTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'List Preset',
          endpointId: 'get /users',
        }),
      ),
    )
  })

  it('hides request body input for GET endpoints in create dialog', async () => {
    const service = mockService({
      listEndpoints: vi.fn(() => [
        { endpointId: 'get /health', method: 'get', path: '/health', summary: 'Health check' },
      ]),
    })
    render(<RequestsPanel service={service} bus={new EventBus()} environmentId="default" />)
    await screen.findByText('No request presets yet')

    fireEvent.click(screen.getByRole('button', { name: /New preset/i }))
    expect(await screen.findByText('Create Request Preset')).toBeInTheDocument()

    // Health check endpoint is selected (GET)
    expect(screen.getByText(/requests do not require a request body/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/JSON Request Body/i)).not.toBeInTheDocument()
  })

  it('edits an existing preset via the Edit dialog', async () => {
    const service = mockService({ listTemplates: vi.fn(async () => ok([template])) })
    render(<RequestsPanel service={service} bus={new EventBus()} environmentId="default" />)
    await screen.findByText('Create user')

    fireEvent.click(screen.getByRole('button', { name: 'Edit Create user' }))

    expect(await screen.findByText('Edit Request Preset')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/Preset Name/i), { target: { value: 'Renamed User' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() =>
      expect(service.updateTemplate).toHaveBeenCalledWith(
        'tpl_1',
        expect.objectContaining({ name: 'Renamed User' }),
      ),
    )
  })

  it('applies and executes a template', async () => {
    const service = mockService({ listTemplates: vi.fn(async () => ok([template])) })
    render(<RequestsPanel service={service} bus={new EventBus()} environmentId="default" />)
    await screen.findByText('Create user')

    fireEvent.click(screen.getByRole('button', { name: 'Apply and execute Create user' }))
    expect(service.applyTemplate).toHaveBeenCalledWith('tpl_1')
  })

  it('locates and fills a template in Swagger', async () => {
    const service = mockService({ listTemplates: vi.fn(async () => ok([template])) })
    render(<RequestsPanel service={service} bus={new EventBus()} environmentId="default" />)
    await screen.findByText('Create user')

    fireEvent.click(screen.getByRole('button', { name: 'Locate in Swagger Create user' }))
    expect(service.locateAndFill).toHaveBeenCalledWith('tpl_1')
  })

  it('deletes a template', async () => {
    const service = mockService({ listTemplates: vi.fn(async () => ok([template])) })
    render(<RequestsPanel service={service} bus={new EventBus()} environmentId="default" />)
    await screen.findByText('Create user')

    fireEvent.click(screen.getByRole('button', { name: 'Delete Create user' }))
    expect(service.deleteTemplate).toHaveBeenCalledWith('tpl_1')
  })

  it('filters presets by search query and method', async () => {
    const getTemplate: RequestTemplate = {
      templateId: 'tpl_2',
      name: 'List all users',
      endpointId: 'get /users',
      method: 'get',
      environmentId: 'default',
      updatedAt: 1_700_000_000_000,
    }
    const service = mockService({ listTemplates: vi.fn(async () => ok([template, getTemplate])) })
    render(<RequestsPanel service={service} bus={new EventBus()} environmentId="default" />)
    expect(await screen.findByText('Create user')).toBeInTheDocument()
    expect(screen.getByText('List all users')).toBeInTheDocument()

    // Filter by text
    fireEvent.change(screen.getByPlaceholderText(/Search presets/i), { target: { value: 'List' } })
    expect(screen.queryByText('Create user')).not.toBeInTheDocument()
    expect(screen.getByText('List all users')).toBeInTheDocument()

    // Clear search
    fireEvent.change(screen.getByPlaceholderText(/Search presets/i), { target: { value: '' } })
    expect(screen.getByText('Create user')).toBeInTheDocument()

    // Filter by GET method pill
    fireEvent.click(screen.getByRole('button', { name: 'GET' }))
    expect(screen.queryByText('Create user')).not.toBeInTheDocument()
    expect(screen.getByText('List all users')).toBeInTheDocument()
  })

  it('reloads when a TEMPLATE_SAVED event fires', async () => {
    const bus = new EventBus()
    const listTemplates = vi.fn(async () => ok([] as RequestTemplate[]))
    render(
      <RequestsPanel service={mockService({ listTemplates })} bus={bus} environmentId="default" />,
    )
    await screen.findByText('No request presets yet')

    listTemplates.mockResolvedValue(ok([template]))
    act(() => bus.publish('TEMPLATE_SAVED', { templateId: 'tpl_1', endpointId: 'post /users' }))

    await waitFor(() => expect(screen.getByText('Create user')).toBeInTheDocument())
  })

  it('toggles Preview Resolved and warns about missing variables', async () => {
    const templateWithVar: RequestTemplate = {
      templateId: 'tpl_var',
      name: 'Auth Preset',
      endpointId: 'post /login',
      method: 'post',
      body: JSON.stringify({ token: '{{MY_TOKEN}}', missing: '{{NOT_SET}}' }),
      environmentId: 'default',
      updatedAt: 1_700_000_000_000,
    }
    const envService = {
      list: vi.fn(async () =>
        ok([
          {
            id: 'default',
            name: 'Default',
            baseUrl: '',
            variables: { MY_TOKEN: 'resolved_secret_123' },
            secrets: ['MY_TOKEN'],
            updatedAt: 0,
          },
        ]),
      ),
      getActiveId: vi.fn(async () => 'default'),
      update: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    }

    const service = mockService({ listTemplates: vi.fn(async () => ok([templateWithVar])) })
    render(
      <RequestsPanel
        service={service}
        bus={new EventBus()}
        environmentId="default"
        environmentService={envService}
      />,
    )

    const cardHeader = await screen.findByText('Auth Preset')

    // Expand preset card by clicking header
    fireEvent.click(cardHeader)
    expect(screen.getByRole('button', { name: 'Preview resolved' })).toBeInTheDocument()

    // Click Preview resolved
    fireEvent.click(screen.getByRole('button', { name: 'Preview resolved' }))

    // Should display substituted text
    expect(screen.getByText(/resolved_secret_123/)).toBeInTheDocument()

    // Should display missing variable warning
    expect(screen.getByText(/Missing in project variables:/)).toBeInTheDocument()
    expect(screen.getAllByText(/\{\{NOT_SET\}\}/).length).toBe(2)
  })
})


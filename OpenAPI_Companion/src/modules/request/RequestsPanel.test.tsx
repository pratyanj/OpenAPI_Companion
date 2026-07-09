import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { RequestsPanel, type RequestPanelService } from './RequestsPanel'
import type { RequestTemplate } from './types'
import { EventBus } from '@/core/events'
import { ok, type Result } from '@/types'

const template: RequestTemplate = {
  templateId: 'tpl_1',
  name: 'Create user',
  endpointId: 'post /users',
  method: 'post',
  environmentId: 'default',
  body: '{"name":"a"}',
  updatedAt: 0,
}

function mockService(over: Partial<RequestPanelService> = {}): RequestPanelService {
  return {
    listTemplates: vi.fn(async (): Promise<Result<RequestTemplate[]>> => ok([])),
    saveOpenAsTemplate: vi.fn(async (): Promise<Result<RequestTemplate | null>> => ok(template)),
    applyTemplate: vi.fn(async (): Promise<Result<void>> => ok(undefined)),
    deleteTemplate: vi.fn(async (): Promise<Result<void>> => ok(undefined)),
    ...over,
  }
}

describe('RequestsPanel', () => {
  it('shows the empty state when there are no templates', async () => {
    render(<RequestsPanel service={mockService()} bus={new EventBus()} environmentId="default" />)
    expect(await screen.findByText('No templates yet')).toBeInTheDocument()
  })

  it('lists templates with their endpoint', async () => {
    const service = mockService({ listTemplates: vi.fn(async () => ok([template])) })
    render(<RequestsPanel service={service} bus={new EventBus()} environmentId="default" />)
    expect(await screen.findByText('Create user')).toBeInTheDocument()
    expect(screen.getByText('post /users')).toBeInTheDocument()
  })

  it('saves the current open request as a named template', async () => {
    const service = mockService()
    render(<RequestsPanel service={service} bus={new EventBus()} environmentId="default" />)
    await screen.findByText('No templates yet')

    fireEvent.change(screen.getByPlaceholderText('Template name'), { target: { value: 'My req' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(service.saveOpenAsTemplate).toHaveBeenCalledWith('My req', 'default'),
    )
  })

  it('hints when there is no open request to save', async () => {
    const service = mockService({ saveOpenAsTemplate: vi.fn(async () => ok(null)) })
    render(<RequestsPanel service={service} bus={new EventBus()} environmentId="default" />)
    await screen.findByText('No templates yet')

    fireEvent.change(screen.getByPlaceholderText('Template name'), { target: { value: 'X' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText(/Open a request/)).toBeInTheDocument()
  })

  it('applies and deletes a template', async () => {
    const service = mockService({ listTemplates: vi.fn(async () => ok([template])) })
    render(<RequestsPanel service={service} bus={new EventBus()} environmentId="default" />)
    await screen.findByText('Create user')

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(service.applyTemplate).toHaveBeenCalledWith('tpl_1')

    fireEvent.click(screen.getByRole('button', { name: 'Delete Create user' }))
    expect(service.deleteTemplate).toHaveBeenCalledWith('tpl_1')
  })

  it('reloads when a TEMPLATE_SAVED event fires', async () => {
    const bus = new EventBus()
    const listTemplates = vi.fn(async () => ok([] as RequestTemplate[]))
    render(
      <RequestsPanel service={mockService({ listTemplates })} bus={bus} environmentId="default" />,
    )
    await screen.findByText('No templates yet')

    listTemplates.mockResolvedValue(ok([template]))
    act(() => bus.publish('TEMPLATE_SAVED', { templateId: 'tpl_1', endpointId: 'post /users' }))

    await waitFor(() => expect(screen.getByText('Create user')).toBeInTheDocument())
  })
})

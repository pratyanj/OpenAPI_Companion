import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PresetEditorModal } from './PresetEditorModal'
import type { RequestPanelService, RequestTemplate } from './types'
import { ok, type Result } from '@/types'

const existingTemplate: RequestTemplate = {
  templateId: 'tpl_admin',
  name: 'Admin Login',
  endpointId: 'post /auth/login',
  method: 'post',
  environmentId: 'default',
  body: '{"username":"admin"}',
  updatedAt: 1_700_000_000_000,
}

function mockService(over: Partial<RequestPanelService> = {}): RequestPanelService {
  return {
    listTemplates: vi.fn(async (): Promise<Result<RequestTemplate[]>> => ok([existingTemplate])),
    saveOpenAsTemplate: vi.fn(async () => ok(null)),
    createCustomTemplate: vi.fn(async (input) =>
      ok({
        templateId: `tpl_${Date.now()}`,
        name: input.name,
        endpointId: input.endpointId,
        method: input.method,
        environmentId: input.environmentId,
        body: input.body,
        updatedAt: Date.now(),
      }),
    ),
    updateTemplate: vi.fn(async (id, updates) =>
      ok({
        ...existingTemplate,
        templateId: id,
        ...updates,
        updatedAt: Date.now(),
      }),
    ),
    applyTemplate: vi.fn(async () => ok(undefined)),
    locateAndFill: vi.fn(async () => ok(undefined)),
    deleteTemplate: vi.fn(async () => ok(undefined)),
    listEndpoints: vi.fn(() => [
      { endpointId: 'post /auth/login', method: 'post', path: '/auth/login', summary: 'Sign in' },
      { endpointId: 'get /users', method: 'get', path: '/users', summary: 'Get all users' },
    ]),
    getOpenRequests: vi.fn(() => []),
    ...over,
  }
}

describe('PresetEditorModal', () => {
  it('displays field-level error when preset name is empty on submission', async () => {
    const service = mockService()
    render(
      <PresetEditorModal
        service={service}
        environmentId="default"
        initialEndpointId="post /auth/login"
        initialName=""
        onClose={vi.fn()}
      />,
    )

    const createBtn = screen.getByRole('button', { name: 'Create Preset' })
    fireEvent.click(createBtn)

    await waitFor(() => {
      expect(screen.getByText('Preset name is required.')).toBeInTheDocument()
    })
    expect(service.createCustomTemplate).not.toHaveBeenCalled()
  })

  it('displays warning when preset name already exists in templates', async () => {
    const service = mockService()
    render(
      <PresetEditorModal
        service={service}
        environmentId="default"
        initialEndpointId="post /auth/login"
        initialName="Admin Login"
        onClose={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(
        screen.getByText(/A preset named "Admin Login" already exists/i),
      ).toBeInTheDocument()
    })
  })

  it('displays informational banner indicating existing presets for the selected endpoint', async () => {
    const service = mockService()
    render(
      <PresetEditorModal
        service={service}
        environmentId="default"
        initialEndpointId="post /auth/login"
        onClose={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText(/This endpoint has/i)).toBeInTheDocument()
      expect(
        screen.getByText(/You can create multiple presets for the same endpoint with different values/i),
      ).toBeInTheDocument()
    })
  })

  it('detects invalid JSON syntax in the request body and warns the user', async () => {
    const service = mockService()
    render(
      <PresetEditorModal
        service={service}
        environmentId="default"
        initialEndpointId="post /auth/login"
        initialBody='{"broken": '
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByText(/Invalid JSON syntax:/i)).toBeInTheDocument()

    // Clicking format should show feedback instead of throwing
    const formatBtn = screen.getByTitle('Format JSON with standard 2-space indentation')
    fireEvent.click(formatBtn)
    expect(screen.getByText('⚠️ Invalid JSON syntax')).toBeInTheDocument()
  })

  it('allows creating a second preset on the same endpoint with different values', async () => {
    const service = mockService()
    const onSaved = vi.fn()
    const onClose = vi.fn()

    render(
      <PresetEditorModal
        service={service}
        environmentId="default"
        initialEndpointId="post /auth/login"
        initialName="Guest User Login"
        initialBody='{"username": "guest", "role": "viewer"}'
        onClose={onClose}
        onSaved={onSaved}
      />,
    )

    const createBtn = screen.getByRole('button', { name: 'Create Preset' })
    fireEvent.click(createBtn)

    await waitFor(() => {
      expect(service.createCustomTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Guest User Login',
          endpointId: 'post /auth/login',
        }),
      )
      expect(onSaved).toHaveBeenCalled()
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('provides "+ Save as New Preset" in edit mode to save a new preset with different values', async () => {
    const service = mockService()
    const onSaved = vi.fn()
    const onClose = vi.fn()

    const { container } = render(
      <PresetEditorModal
        service={service}
        environmentId="default"
        template={existingTemplate}
        onClose={onClose}
        onSaved={onSaved}
      />,
    )

    // Check that both action buttons are rendered
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeInTheDocument()
    const saveAsNewBtn = screen.getByRole('button', { name: '+ Save as New Preset' })
    expect(saveAsNewBtn).toBeInTheDocument()

    // Change body to different value and click "+ Save as New Preset"
    const textarea = container.querySelector('#preset-modal-body') as HTMLTextAreaElement
    expect(textarea).toBeInTheDocument()
    fireEvent.change(textarea, { target: { value: '{"username": "manager"}' } })

    fireEvent.click(saveAsNewBtn)

    await waitFor(() => {
      // createCustomTemplate is called instead of updateTemplate!
      expect(service.createCustomTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Admin Login',
          endpointId: 'post /auth/login',
        }),
      )
      expect(service.updateTemplate).not.toHaveBeenCalled()
      expect(onSaved).toHaveBeenCalled()
      expect(onClose).toHaveBeenCalled()
    })
  })
})

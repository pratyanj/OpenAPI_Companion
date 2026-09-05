import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PresetEditorModal } from './PresetEditorModal'
import { validateJsonWithVariables, extractPathParams } from './json-utils'
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
      {
        endpointId: 'patch /teams/{team_id}/members/{user_id}/promote',
        method: 'patch',
        path: '/teams/{team_id}/members/{user_id}/promote',
        summary: 'Promote team member',
      },
    ]),
    getOpenRequests: vi.fn(() => []),
    getSwaggerDefaults: vi.fn((endpointId: string) => {
      if (endpointId.includes('teams')) {
        return {
          exampleBody: '{\n  "role": "admin"\n}',
          path: { team_id: '99', user_id: '123' },
          query: { notify: 'true' },
        }
      }
      return {}
    }),
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
      expect(screen.getByText(/A preset named "Admin Login" already exists/i)).toBeInTheDocument()
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
        screen.getByText(
          /You can create multiple presets for the same endpoint with different values/i,
        ),
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

  it('updates the selected endpoint when picking a different one from EndpointPicker', async () => {
    const service = mockService()
    render(
      <PresetEditorModal
        service={service}
        environmentId="default"
        initialEndpointId="post /auth/login"
        onClose={vi.fn()}
      />,
    )

    // Initial endpoint is /auth/login (POST)
    const matches = screen.getAllByText('/auth/login')
    expect(matches.length).toBeGreaterThanOrEqual(1)

    // Open EndpointPicker
    const trigger = matches[0]?.closest('button')
    expect(trigger).toBeInTheDocument()
    fireEvent.click(trigger!)

    // Click on 'Get all users' (/users)
    const userOption = screen.getByText('Get all users').closest('[role="button"]')
    expect(userOption).toBeInTheDocument()
    fireEvent.click(userOption!)

    // Now trigger and preview should display /users
    expect(screen.getAllByText('/users').length).toBeGreaterThanOrEqual(1)
    // And since it's GET, body notice should be displayed
    expect(
      screen.getByText(/requests do not typically require a request body/i),
    ).toBeInTheDocument()
  })

  describe('validateJsonWithVariables', () => {
    it('accepts quoted variables without generating duplicate quotes (e.g. {{$randomName}})', () => {
      const userPayload = `{\n  "name": "{{$randomName}}",\n  "description": "testing this new request page",\n  "color": "#6366F1",\n  "icon": "folder"\n}`
      const res = validateJsonWithVariables(userPayload)
      expect(res.isValid).toBe(true)
      expect(res.error).toBeNull()
    })

    it('accepts unquoted variables for numeric/raw fields', () => {
      const payload = `{\n  "id": {{USER_ID}},\n  "active": {{IS_ACTIVE}}\n}`
      const res = validateJsonWithVariables(payload)
      expect(res.isValid).toBe(true)
      expect(res.error).toBeNull()
    })

    it('properly catches real JSON syntax errors', () => {
      const brokenPayload = `{\n  "name": "unclosed\n}`
      const res = validateJsonWithVariables(brokenPayload)
      expect(res.isValid).toBe(false)
      expect(res.error).toBeTruthy()
    })
  })

  it('renders warning banners with yellow background styling', async () => {
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

    // Check that the syntax warning has yellow background and border
    const warningEl = screen.getByText(/Invalid JSON syntax:/i).closest('div')
    expect(warningEl).toBeInTheDocument()
    expect(warningEl?.className).toContain('bg-yellow-500/20')
    expect(warningEl?.className).toContain('border-yellow-500/50')
  })

  describe('extractPathParams', () => {
    it('extracts distinct path parameters from parameterized URLs', () => {
      expect(extractPathParams('/teams/{team_id}/members/{user_id}/promote')).toEqual([
        'team_id',
        'user_id',
      ])
      expect(extractPathParams('/items/{id}')).toEqual(['id'])
      expect(extractPathParams('/users')).toEqual([])
      expect(extractPathParams('/orgs/{org_id}/teams/{org_id}')).toEqual(['org_id'])
    })
  })

  describe('Path Parameters UI & Validation', () => {
    it('renders path parameter inputs for parameterized endpoints and validates on save', async () => {
      const service = mockService()
      render(
        <PresetEditorModal
          service={service}
          environmentId="default"
          initialEndpointId="patch /teams/{team_id}/members/{user_id}/promote"
          initialName="Promote Member"
          onClose={vi.fn()}
        />,
      )

      // Path Parameters section header should be visible
      expect(screen.getByText('Path Parameters')).toBeInTheDocument()
      expect(screen.getByText('2 required')).toBeInTheDocument()
      expect(screen.getByText('{team_id}')).toBeInTheDocument()
      expect(screen.getByText('{user_id}')).toBeInTheDocument()

      // Try saving without entering path parameters
      const saveButton = screen.getByRole('button', { name: /Create Preset/i })
      fireEvent.click(saveButton)

      // Validation errors should appear
      await waitFor(() => {
        expect(screen.getByText(/Parameter {team_id} is required/i)).toBeInTheDocument()
      })
      expect(service.createCustomTemplate).not.toHaveBeenCalled()

      // Fill in path parameters
      const teamIdInput = screen.getByPlaceholderText(/e\.g\. 101 or {{TEAM_ID}}/i)
      const userIdInput = screen.getByPlaceholderText(/e\.g\. 101 or {{USER_ID}}/i)
      fireEvent.change(teamIdInput, { target: { value: '42' } })
      fireEvent.change(userIdInput, { target: { value: '{{CURRENT_USER}}' } })

      // Live resolved URL preview should update
      expect(screen.getByText('/teams/42/members/{{CURRENT_USER}}/promote')).toBeInTheDocument()

      // Save should now succeed with path record
      fireEvent.click(saveButton)
      await waitFor(() => {
        expect(service.createCustomTemplate).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Promote Member',
            endpointId: 'patch /teams/{team_id}/members/{user_id}/promote',
            path: { team_id: '42', user_id: '{{CURRENT_USER}}' },
          }),
        )
      })
    })
  })

  describe('Query Parameters Builder', () => {
    it('allows adding, updating, and removing query parameters with live URL preview', async () => {
      const service = mockService()
      render(
        <PresetEditorModal
          service={service}
          environmentId="default"
          initialEndpointId="get /users"
          initialName="List Active Users"
          onClose={vi.fn()}
        />,
      )

      // Initially no query parameters
      expect(screen.getByText(/No query parameters added/i)).toBeInTheDocument()

      // Click Add Query Param
      const addQueryBtn = screen.getByRole('button', { name: /Add Query Param/i })
      fireEvent.click(addQueryBtn)

      // Find key and value inputs
      const keyInput = screen.getByPlaceholderText(/Parameter key \(e\.g\. limit\)/i)
      const valueInput = screen.getByPlaceholderText(/Value or {{VARIABLE}}/i)

      fireEvent.change(keyInput, { target: { value: 'role' } })
      fireEvent.change(valueInput, { target: { value: 'admin' } })

      // URL preview should show /users?role=admin
      expect(screen.getByText('/users?role=admin')).toBeInTheDocument()

      // Add second param
      fireEvent.click(addQueryBtn)
      const keyInputs = screen.getAllByPlaceholderText(/Parameter key \(e\.g\. limit\)/i)
      const valueInputs = screen.getAllByPlaceholderText(/Value or {{VARIABLE}}/i)
      fireEvent.change(keyInputs[1]!, { target: { value: 'limit' } })
      fireEvent.change(valueInputs[1]!, { target: { value: '{{PAGE_LIMIT}}' } })

      expect(screen.getByText('/users?role=admin&limit={{PAGE_LIMIT}}')).toBeInTheDocument()

      // Submit preset and check saved query record
      const saveBtn = screen.getByRole('button', { name: /Create Preset/i })
      fireEvent.click(saveBtn)

      await waitFor(() => {
        expect(service.createCustomTemplate).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'List Active Users',
            query: { role: 'admin', limit: '{{PAGE_LIMIT}}' },
          }),
        )
      })
    })
  })

  describe('Load from Swagger Action', () => {
    it('populates example request body and path/query defaults from Swagger', async () => {
      const service = mockService()
      render(
        <PresetEditorModal
          service={service}
          environmentId="default"
          initialEndpointId="patch /teams/{team_id}/members/{user_id}/promote"
          initialName="Promote"
          onClose={vi.fn()}
        />,
      )

      const loadBtn = screen.getByRole('button', { name: /Load from Swagger/i })
      fireEvent.click(loadBtn)

      // Service defaults should be fetched
      expect(service.getSwaggerDefaults).toHaveBeenCalledWith(
        'patch /teams/{team_id}/members/{user_id}/promote',
      )

      // Path inputs should be populated
      await waitFor(() => {
        const teamInput = screen.getByPlaceholderText(
          /e\.g\. 101 or {{TEAM_ID}}/i,
        ) as HTMLInputElement
        const userInput = screen.getByPlaceholderText(
          /e\.g\. 101 or {{USER_ID}}/i,
        ) as HTMLInputElement
        expect(teamInput.value).toBe('99')
        expect(userInput.value).toBe('123')
      })

      // Query param 'notify'='true' should be populated
      expect(screen.getByDisplayValue('notify')).toBeInTheDocument()
      expect(screen.getByDisplayValue('true')).toBeInTheDocument()

      // Feedback text should show
      expect(screen.getByText(/Loaded from Swagger/i)).toBeInTheDocument()
    })
  })
})

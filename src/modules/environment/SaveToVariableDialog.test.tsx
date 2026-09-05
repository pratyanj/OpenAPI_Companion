import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { EventBus } from '@/core/events'
import { ok, err } from '@/types'
import type { Environment } from '@/core/project'
import { SaveToVariableDialog } from './SaveToVariableDialog'
import { extractJsonCandidates } from './json-candidates'
import type { EnvironmentPanelService } from './EnvironmentsPanel'

function mockEnvService(overrides: Partial<EnvironmentPanelService> = {}): EnvironmentPanelService {
  const env: Environment = {
    id: 'default',
    name: 'Default',
    baseUrl: 'https://api.example.com',
    variables: { EXISTING: 'value1' },
    secrets: [],
    updatedAt: 0,
  }
  return {
    list: vi.fn(async () => ok([env])),
    getActiveId: vi.fn(async () => 'default'),
    update: vi.fn(async () => ok(env)),
    create: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  }
}

describe('extractJsonCandidates', () => {
  it('extracts top-level and nested primitive values', () => {
    const raw = JSON.stringify({
      access_token: 'secret_jwt_token',
      user: {
        id: 101,
        email: 'dev@example.com',
      },
      active: true,
    })

    const candidates = extractJsonCandidates(raw)
    expect(candidates.length).toBe(4)

    const tokenCand = candidates.find((c) => c.path === 'access_token')
    expect(tokenCand).toBeDefined()
    expect(tokenCand?.suggestedName).toBe('ACCESS_TOKEN')
    expect(tokenCand?.value).toBe('secret_jwt_token')
    expect(tokenCand?.isLikelySecret).toBe(true)

    const idCand = candidates.find((c) => c.path === 'user.id')
    expect(idCand).toBeDefined()
    expect(idCand?.suggestedName).toBe('USER_ID')
    expect(idCand?.value).toBe('101')
    expect(idCand?.isLikelySecret).toBe(false)
  })

  it('returns empty array on invalid JSON or empty body', () => {
    expect(extractJsonCandidates('')).toEqual([])
    expect(extractJsonCandidates('not json string')).toEqual([])
  })
})

describe('SaveToVariableDialog', () => {
  it('renders candidates and allows saving a new variable', async () => {
    const service = mockEnvService()
    const bus = new EventBus()
    const notifySpy = vi.fn()
    bus.subscribe('NOTIFY', notifySpy)
    const onClose = vi.fn()

    const rawJson = JSON.stringify({
      token: 'eyJhbGciOi...',
      status: 'success',
    })

    render(
      <SaveToVariableDialog
        responseBody={rawJson}
        service={service}
        bus={bus}
        onClose={onClose}
      />,
    )

    expect(await screen.findByText('Save Response Value to Variable')).toBeInTheDocument()
    expect(screen.getByText('token')).toBeInTheDocument()
    expect(screen.getByText('status')).toBeInTheDocument()

    // Default selection should be the highest-scored candidate (token)
    expect(screen.getByDisplayValue('TOKEN')).toBeInTheDocument()
    expect(screen.getByDisplayValue('eyJhbGciOi...')).toBeInTheDocument()

    // Click Save to Variables
    fireEvent.click(screen.getByRole('button', { name: 'Save to Variables' }))

    await waitFor(() => {
      expect(service.update).toHaveBeenCalledWith('default', {
        name: 'Default',
        baseUrl: 'https://api.example.com',
        variables: {
          EXISTING: 'value1',
          TOKEN: 'eyJhbGciOi...',
        },
        secrets: ['TOKEN'],
      })
    })

    expect(notifySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'success',
        message: 'Saved {{TOKEN}} to project variables!',
      }),
    )
  })

  it('switches candidate when clicking candidate chip', async () => {
    const service = mockEnvService()
    const rawJson = JSON.stringify({
      access_token: 'secret123',
      userId: 42,
    })

    render(
      <SaveToVariableDialog
        responseBody={rawJson}
        service={service}
        onClose={vi.fn()}
      />,
    )

    await screen.findByText('Save Response Value to Variable')
    const userChip = screen.getByRole('button', { name: 'userId' })
    fireEvent.click(userChip)

    expect(screen.getByDisplayValue('USER_ID')).toBeInTheDocument()
    expect(screen.getByDisplayValue('42')).toBeInTheDocument()
  })

  it('displays error when update fails', async () => {
    const service = mockEnvService({
      update: vi.fn(async () => err({ code: 'STORAGE_FAILED', message: 'Storage error', recoverable: true })),
    })

    const rawJson = JSON.stringify({ key: 'val' })

    render(
      <SaveToVariableDialog
        responseBody={rawJson}
        service={service}
        onClose={vi.fn()}
      />,
    )

    await screen.findByText('Save Response Value to Variable')
    fireEvent.click(screen.getByRole('button', { name: 'Save to Variables' }))

    expect(await screen.findByText('Storage error')).toBeInTheDocument()
  })

  it('creates an auto-extraction rule when checkbox is checked', async () => {
    const saveRuleSpy = vi.fn(async () => ok({
      id: 'rule_1',
      endpointId: 'post /auth/login',
      property: 'token',
      targetVariable: 'TOKEN',
      isSecret: true,
      enabled: true,
      createdAt: Date.now(),
    }))
    const service = mockEnvService({ saveRule: saveRuleSpy })
    const rawJson = JSON.stringify({ token: 'jwt_abc' })

    render(
      <SaveToVariableDialog
        responseBody={rawJson}
        service={service}
        endpointId="post /auth/login"
        onClose={vi.fn()}
      />,
    )

    await screen.findByText('Save Response Value to Variable')
    const autoExtractCheckbox = screen.getByLabelText(/Auto-extract on future 2xx responses/i)
    expect(autoExtractCheckbox).toBeInTheDocument()
    fireEvent.click(autoExtractCheckbox)

    fireEvent.click(screen.getByRole('button', { name: 'Save to Variables' }))

    await waitFor(() => {
      expect(saveRuleSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          endpointId: 'post /auth/login',
          property: 'token',
          targetVariable: 'TOKEN',
          isSecret: true,
          enabled: true,
        }),
      )
    })
  })
})

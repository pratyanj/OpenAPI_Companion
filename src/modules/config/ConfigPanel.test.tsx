import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ok, type Result } from '@/types'
import { EventBus } from '@/core/events'
import { DEFAULT_SWAGGER_FEATURES } from '@/modules/settings/types'
import type { SettingsApi } from '@/modules/settings/settings-service'
import { ConfigPanel } from './ConfigPanel'

function mockSettings(over: Partial<SettingsApi> = {}): SettingsApi {
  return {
    getPreferences: vi.fn(async () => ({
      autoBackup: false,
      historyLimit: 1000,
      swaggerFeatures: { ...DEFAULT_SWAGGER_FEATURES },
    })),
    setPreference: vi.fn(async (): Promise<Result<void>> => ok(undefined)),
    setSwaggerFeature: vi.fn(async (): Promise<Result<void>> => ok(undefined)),
    resetPreferences: vi.fn(async (): Promise<Result<void>> => ok(undefined)),
    getStorageMetrics: vi.fn(async () => ({ totalBytes: 0, projects: [] })),
    clearProject: vi.fn(async (): Promise<Result<number>> => ok(0)),
    clearAll: vi.fn(async (): Promise<Result<void>> => ok(undefined)),
    ...over,
  }
}

describe('ConfigPanel', () => {
  it('renders all 13 swagger feature toggles with active count', async () => {
    const settings = mockSettings()
    const bus = new EventBus()
    render(<ConfigPanel settings={settings} bus={bus} />)

    expect(await screen.findByText(/Swagger In-Page Features/i)).toBeInTheDocument()
    expect(screen.getByText('13/13 Active')).toBeInTheDocument()

    const mockDataCheckbox = screen.getByLabelText(
      /Toggle 1-Click Realistic Mock Data/i,
    ) as HTMLInputElement
    const jsonFormatCheckbox = screen.getByLabelText(
      /Toggle JSON Formatter & Auto-Repair Validator/i,
    ) as HTMLInputElement
    const historyCheckbox = screen.getByLabelText(
      /Toggle Re-fill Last Sent Payload/i,
    ) as HTMLInputElement
    const respVarCheckbox = screen.getByLabelText(
      /Toggle Save Response Property to Variable/i,
    ) as HTMLInputElement
    const authBadgeCheckbox = screen.getByLabelText(
      /Toggle Active Account & Token Expiry Badge/i,
    ) as HTMLInputElement
    const varResCheckbox = screen.getByLabelText(
      /Toggle Direct Variable Resolution/i,
    ) as HTMLInputElement
    const accountSwitcherCheckbox = screen.getByLabelText(
      /Toggle 1-Click Multi-Account & Role Switcher/i,
    ) as HTMLInputElement
    const respSearchCheckbox = screen.getByLabelText(
      /Toggle Response JSON Search & Tree View/i,
    ) as HTMLInputElement
    const copyCodeCheckbox = screen.getByLabelText(
      /Toggle Multi-Language Copy Code Dropdown/i,
    ) as HTMLInputElement
    const exportCheckbox = screen.getByLabelText(/Toggle Response Export/i) as HTMLInputElement
    const pinnedCheckbox = screen.getByLabelText(
      /Toggle Endpoint Favorites & Top Pinning/i,
    ) as HTMLInputElement

    expect(mockDataCheckbox.checked).toBe(true)
    expect(jsonFormatCheckbox.checked).toBe(true)
    expect(historyCheckbox.checked).toBe(true)
    expect(respVarCheckbox.checked).toBe(true)
    expect(authBadgeCheckbox.checked).toBe(true)
    expect(varResCheckbox.checked).toBe(true)
    expect(accountSwitcherCheckbox.checked).toBe(true)
    expect(respSearchCheckbox.checked).toBe(true)
    expect(copyCodeCheckbox.checked).toBe(true)
    expect(exportCheckbox.checked).toBe(true)
    expect(pinnedCheckbox.checked).toBe(true)

    const globalHeadersCheckbox = screen.getByLabelText(
      /Toggle Global Debug Headers/i,
    ) as HTMLInputElement
    expect(globalHeadersCheckbox.checked).toBe(true)

    expect(screen.getByText('Ctrl+Shift+V')).toBeInTheDocument()
    expect(screen.getByText('Alt+M')).toBeInTheDocument()
    expect(screen.getByText('Alt+Shift+F')).toBeInTheDocument()
    expect(screen.getByText('Alt+L')).toBeInTheDocument()
  })

  it('calls setSwaggerFeature when a toggle is clicked', async () => {
    const settings = mockSettings()
    const bus = new EventBus()
    render(<ConfigPanel settings={settings} bus={bus} />)

    const authBadgeCheckbox = await screen.findByLabelText(
      /Toggle Active Account & Token Expiry Badge/i,
    )
    fireEvent.click(authBadgeCheckbox)

    expect(settings.setSwaggerFeature).toHaveBeenCalledWith('authBadge', false)
  })

  it('resets defaults when Reset Defaults button is clicked', async () => {
    const settings = mockSettings()
    const bus = new EventBus()
    render(<ConfigPanel settings={settings} bus={bus} />)

    const resetBtn = await screen.findByRole('button', { name: /Reset Defaults/i })
    fireEvent.click(resetBtn)

    expect(settings.setPreference).toHaveBeenCalledWith('swaggerFeatures', DEFAULT_SWAGGER_FEATURES)
  })
})

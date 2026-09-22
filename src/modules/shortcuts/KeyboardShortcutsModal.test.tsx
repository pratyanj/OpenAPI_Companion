import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { KeyboardShortcutsModal } from './KeyboardShortcutsModal'
import { DEFAULT_SHORTCUTS } from './types'
import type { SettingsApi } from '@/modules/settings/settings-service'
import { ok } from '@/types'

describe('KeyboardShortcutsModal', () => {
  let mockSettings: SettingsApi
  let prefsData: Record<string, unknown>

  beforeEach(() => {
    prefsData = {
      shortcuts: { ...DEFAULT_SHORTCUTS },
    }

    mockSettings = {
      getPreferences: vi.fn().mockImplementation(async () => ({
        autoBackup: false,
        autoBackupFrequency: '24h',
        autoBackupSkipUnchanged: true,
        autoBackupScope: 'all',
        historyLimit: 1000,
        swaggerFeatures: {},
        shortcuts: { ...DEFAULT_SHORTCUTS },
        ...prefsData,
      })),
      setPreference: vi.fn().mockImplementation(async (k, v) => {
        prefsData[k] = v
        return ok(undefined)
      }),
      setSwaggerFeature: vi.fn().mockResolvedValue(ok(undefined)),
      resetPreferences: vi.fn().mockResolvedValue(ok(undefined)),
      getStorageMetrics: vi.fn().mockResolvedValue({ totalBytes: 0, projects: [] }),
      clearProject: vi.fn().mockResolvedValue(ok(0)),
      clearAll: vi.fn().mockResolvedValue(ok(undefined)),
    }
  })

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <KeyboardShortcutsModal isOpen={false} onClose={vi.fn()} settings={mockSettings} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders all shortcuts and headers when isOpen is true', async () => {
    render(<KeyboardShortcutsModal isOpen={true} onClose={vi.fn()} settings={mockSettings} />)

    await waitFor(() => {
      expect(screen.getByText('Command Palette')).toBeInTheDocument()
      expect(screen.getByText('Fill Realistic Mock Data')).toBeInTheDocument()
      expect(screen.getByText('Re-fill Last Sent Payload')).toBeInTheDocument()
      expect(screen.getByText('Format & Auto-Repair JSON')).toBeInTheDocument()
      expect(screen.getByText('Paste cURL as Request')).toBeInTheDocument()
    })
  })

  it('filters shortcuts when searching', async () => {
    render(<KeyboardShortcutsModal isOpen={true} onClose={vi.fn()} settings={mockSettings} />)

    await waitFor(() => {
      expect(screen.getByText('Command Palette')).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText('Search shortcuts...')
    fireEvent.change(searchInput, { target: { value: 'mock data' } })

    expect(screen.getByText('Fill Realistic Mock Data')).toBeInTheDocument()
    expect(screen.queryByText('Command Palette')).not.toBeInTheDocument()
  })

  it('enters recording mode when Edit button is clicked and cancels on Escape', async () => {
    render(<KeyboardShortcutsModal isOpen={true} onClose={vi.fn()} settings={mockSettings} />)

    await waitFor(() => {
      expect(screen.getByText('Command Palette')).toBeInTheDocument()
    })

    const editBtn = screen.getByLabelText('Change shortcut for Command Palette')
    fireEvent.click(editBtn)

    expect(screen.getByText('Press keys...')).toBeInTheDocument()

    // Press Escape to cancel
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByText('Press keys...')).not.toBeInTheDocument()
  })

  it('records a new valid shortcut combination', async () => {
    const onToast = vi.fn()
    render(
      <KeyboardShortcutsModal
        isOpen={true}
        onClose={vi.fn()}
        settings={mockSettings}
        onToast={onToast}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Fill Realistic Mock Data')).toBeInTheDocument()
    })

    const editBtn = screen.getByLabelText('Change shortcut for Fill Realistic Mock Data')
    fireEvent.click(editBtn)

    // Press Alt+D
    fireEvent.keyDown(window, { key: 'd', altKey: true })

    await waitFor(() => {
      expect(mockSettings.setPreference).toHaveBeenCalledWith(
        'shortcuts',
        expect.objectContaining({
          'mockData.generate': { key: 'd', alt: true },
        }),
      )
    })
    expect(onToast).toHaveBeenCalledWith(expect.stringContaining('Updated shortcut'), 'success')
  })

  it('detects reserved browser keys and warns user', async () => {
    render(<KeyboardShortcutsModal isOpen={true} onClose={vi.fn()} settings={mockSettings} />)

    await waitFor(() => {
      expect(screen.getByText('Command Palette')).toBeInTheDocument()
    })

    const editBtn = screen.getByLabelText('Change shortcut for Command Palette')
    fireEvent.click(editBtn)

    // Press Ctrl+W (browser tab close)
    fireEvent.keyDown(window, { key: 'w', ctrlKey: true })

    expect(screen.getByText(/is reserved by the browser or system/)).toBeInTheDocument()
  })

  it('detects shortcut conflict and offers Swap Bindings', async () => {
    render(<KeyboardShortcutsModal isOpen={true} onClose={vi.fn()} settings={mockSettings} />)

    await waitFor(() => {
      expect(screen.getByText('Fill Realistic Mock Data')).toBeInTheDocument()
    })

    const editBtn = screen.getByLabelText('Change shortcut for Fill Realistic Mock Data')
    fireEvent.click(editBtn)
    await waitFor(() => {
      expect(screen.getByText('Press keys...')).toBeInTheDocument()
    })

    // Press Ctrl+K which is already used by palette.toggle
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })

    await waitFor(() => {
      expect(screen.getByText(/Shortcut Conflict Detected/)).toBeInTheDocument()
      expect(screen.getAllByText(/Command Palette/).length).toBeGreaterThanOrEqual(2)
    })

    // Click Swap Bindings
    const swapBtn = screen.getByText('Swap Bindings')
    fireEvent.click(swapBtn)

    await waitFor(() => {
      expect(mockSettings.setPreference).toHaveBeenCalledWith(
        'shortcuts',
        expect.objectContaining({
          'mockData.generate': { key: 'k', ctrlOrCmd: true },
          'palette.toggle': { key: 'm', alt: true },
        }),
      )
    })
  })

  it('resets all shortcuts to defaults when Reset All is clicked', async () => {
    render(<KeyboardShortcutsModal isOpen={true} onClose={vi.fn()} settings={mockSettings} />)

    await waitFor(() => {
      expect(screen.getByText('Reset All to Defaults')).toBeInTheDocument()
    })

    const resetAllBtn = screen.getByText('Reset All to Defaults')
    fireEvent.click(resetAllBtn)

    await waitFor(() => {
      expect(mockSettings.setPreference).toHaveBeenCalledWith('shortcuts', DEFAULT_SHORTCUTS)
    })
  })
})

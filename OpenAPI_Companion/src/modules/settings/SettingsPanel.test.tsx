import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ok, type Result } from '@/types'
import { StorageService } from '@/core/storage'
import { EventBus } from '@/core/events'
import { createFakeArea } from '@/tests/fake-storage'
import { ThemeManager } from '@/services'
import { SettingsPanel } from './SettingsPanel'
import type { SettingsApi } from './settings-service'
import type { ImportExportApi } from './import-export-service'
import type { ImportSummary } from '@/core/events'

function mockSettings(over: Partial<SettingsApi> = {}): SettingsApi {
  return {
    getPreferences: vi.fn(async () => ({ autoBackup: false, historyLimit: 1000 })),
    setPreference: vi.fn(async (): Promise<Result<void>> => ok(undefined)),
    resetPreferences: vi.fn(async (): Promise<Result<void>> => ok(undefined)),
    getStorageMetrics: vi.fn(async () => ({
      totalBytes: 2048,
      projects: [{ projectId: 'p1', bytes: 1024 }],
    })),
    clearProject: vi.fn(async (): Promise<Result<number>> => ok(3)),
    clearAll: vi.fn(async (): Promise<Result<void>> => ok(undefined)),
    ...over,
  }
}

function mockIo(over: Partial<ImportExportApi> = {}): ImportExportApi {
  return {
    exportAll: vi.fn(async (): Promise<Result<string>> => ok('{}')),
    backup: vi.fn(async (): Promise<Result<string>> => ok('backup.json')),
    previewImport: vi.fn(() =>
      ok({
        appVersion: '0.1.0',
        schemaVersion: 1,
        exportedAt: 1,
        total: 2,
        byRoot: { settings: 2 },
        projectCount: 0,
        containsSecrets: false,
      }),
    ),
    applyImport: vi.fn(async (): Promise<Result<ImportSummary>> =>
      ok({ imported: 2, skipped: 0, renamed: 0 }),
    ),
    ...over,
  }
}

let theme: ThemeManager

beforeEach(async () => {
  const storage = new StorageService({ area: createFakeArea() })
  theme = new ThemeManager({
    storage,
    root: document.createElement('div'),
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  })
  await theme.init()
})

function renderPanel(settings = mockSettings(), io = mockIo()) {
  const bus = new EventBus()
  render(<SettingsPanel settings={settings} io={io} theme={theme} projectId="p1" bus={bus} />)
  return { settings, io, bus }
}

describe('SettingsPanel', () => {
  it('renders the categories, storage usage, and version', async () => {
    renderPanel()
    expect(screen.getByText('Appearance')).toBeInTheDocument()
    expect(screen.getByText('Storage')).toBeInTheDocument()
    expect(screen.getByText('Data')).toBeInTheDocument()
    expect(await screen.findByText('2.0 KB')).toBeInTheDocument() // total used
    expect(screen.getByText(/^v\d/)).toBeInTheDocument()
  })

  it('changes theme via the appearance radios', () => {
    const spy = vi.spyOn(theme, 'setPreference')
    renderPanel()
    fireEvent.click(screen.getByRole('radio', { name: 'dark' }))
    expect(spy).toHaveBeenCalledWith('dark')
  })

  it('confirms before clearing all data', async () => {
    const { settings } = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Clear all data' }))
    expect(await screen.findByRole('dialog', { name: 'Please confirm' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(settings.clearAll).toHaveBeenCalled())
  })

  it('downloads a backup', async () => {
    const { io } = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Download backup' }))
    await waitFor(() => expect(io.backup).toHaveBeenCalled())
  })

  it('previews then applies an import', async () => {
    const { io } = renderPanel()
    fireEvent.change(screen.getByLabelText('Import JSON'), { target: { value: '{"x":1}' } })
    fireEvent.click(screen.getByRole('button', { name: 'Preview import' }))
    expect(await screen.findByText('2 entries')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Import' }))
    await waitFor(() => expect(io.applyImport).toHaveBeenCalledWith('{"x":1}', 'skip'))
  })

  it('restores from a picked backup file (auto-previews, then imports)', async () => {
    const { io } = renderPanel()
    const file = new File(['{"backup":true}'], 'openapi-companion-backup.json', {
      type: 'application/json',
    })
    fireEvent.change(screen.getByLabelText('Restore backup file'), { target: { files: [file] } })

    // File contents flow into the same preview → import pipeline.
    await waitFor(() => expect(io.previewImport).toHaveBeenCalledWith('{"backup":true}'))
    expect(await screen.findByText('2 entries')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Import' }))
    await waitFor(() => expect(io.applyImport).toHaveBeenCalledWith('{"backup":true}', 'skip'))
  })
})

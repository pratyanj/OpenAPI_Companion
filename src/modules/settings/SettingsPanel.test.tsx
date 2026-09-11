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
  it('renders human-readable project details and opens external link', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    const settings = mockSettings({
      getStorageMetrics: vi.fn(async () => ({
        totalBytes: 2048,
        projects: [
          {
            projectId: 'p1',
            name: 'TaskUp API',
            originUrl: 'http://localhost:8008',
            openApiUrl: 'http://localhost:8008/openapi.json',
            bytes: 1024,
          },
        ],
      })),
    })
    renderPanel(settings)
    expect(await screen.findByText('TaskUp API')).toBeInTheDocument()
    expect(screen.getByText('http://localhost:8008')).toBeInTheDocument()
    const linkBtn = screen.getByRole('button', { name: 'Open TaskUp API in new tab' })
    fireEvent.click(linkBtn)
    expect(openSpy).toHaveBeenCalledWith('http://localhost:8008', '_blank', 'noopener,noreferrer')
    openSpy.mockRestore()
  })

  it('allows clearing an individual project from the storage list', async () => {
    const settings = mockSettings({
      getStorageMetrics: vi.fn(async () => ({
        totalBytes: 2048,
        projects: [
          {
            projectId: 'p1',
            name: 'TaskUp API',
            originUrl: 'http://localhost:8008',
            bytes: 1024,
          },
        ],
      })),
    })
    renderPanel(settings)
    const deleteBtn = await screen.findByRole('button', { name: 'Clear data for TaskUp API' })
    fireEvent.click(deleteBtn)
    expect(await screen.findByRole('dialog', { name: 'Please confirm' })).toBeInTheDocument()
    expect(screen.getByText(/permanently deletes all saved data for TaskUp API/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(settings.clearProject).toHaveBeenCalledWith('p1'))
  })

  it('downloads an encrypted backup when a passphrase is typed', async () => {
    const { io } = renderPanel()
    const passInput = screen.getByPlaceholderText(/Enter passphrase for encrypted export/i)
    fireEvent.change(passInput, { target: { value: 'mypassword123' } })

    const downloadBtn = screen.getByRole('button', { name: 'Download encrypted backup' })
    expect(downloadBtn).toBeInTheDocument()
    fireEvent.click(downloadBtn)

    await waitFor(() => expect(io.backup).toHaveBeenCalledWith(false, 'mypassword123'))
  })

  it('prompts for decryption and decrypts an encrypted backup file on restore', async () => {
    const io = mockIo({
      isEncrypted: vi.fn((json: string) => json.includes('"encrypted":true')),
      decryptBackup: vi.fn(async () => ok('{"decrypted":true}')),
      previewImport: vi.fn(() =>
        ok({
          appVersion: '0.1.0',
          schemaVersion: 1,
          exportedAt: 1,
          total: 5,
          byRoot: { settings: 5 },
          projectCount: 1,
          containsSecrets: true,
        }),
      ),
    })
    renderPanel(mockSettings(), io)

    // Paste encrypted JSON
    const textarea = screen.getByLabelText('Import JSON')
    fireEvent.change(textarea, { target: { value: '{"app":"OpenAPI Companion","encrypted":true}' } })

    // Encrypted detected banner appears
    expect(await screen.findByText('Encrypted Backup Detected')).toBeInTheDocument()

    // Type decrypt passphrase
    const decryptInput = screen.getByLabelText('Decrypt passphrase')
    fireEvent.change(decryptInput, { target: { value: 'correct-pass' } })

    // Click Decrypt
    fireEvent.click(screen.getByRole('button', { name: 'Decrypt' }))

    await waitFor(() => expect(io.decryptBackup).toHaveBeenCalledWith('{"app":"OpenAPI Companion","encrypted":true}', 'correct-pass'))
    expect(await screen.findByText('5 entries')).toBeInTheDocument()
    expect(screen.getByText(/Decrypted/i)).toBeInTheDocument()

    // Import button is enabled and applies decrypted payload
    fireEvent.click(screen.getByRole('button', { name: 'Import' }))
    await waitFor(() => expect(io.applyImport).toHaveBeenCalledWith('{"decrypted":true}', 'skip'))
  })
});

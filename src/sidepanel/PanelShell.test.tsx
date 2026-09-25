import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ok, type Result } from '@/types'
import { StorageService } from '@/core/storage'
import { EventBus } from '@/core/events'
import { ThemeManager, type MediaQueryListLike } from '@/services'
import { createFakeArea } from '@/tests/fake-storage'
import type { ProjectMeta } from '@/core/project'
import { PanelShell } from './PanelShell'

const noMatch: MediaQueryListLike = {
  matches: false,
  addEventListener: () => {},
  removeEventListener: () => {},
}

const project: ProjectMeta = {
  id: 'project_abc',
  name: 'Petstore API',
  originUrl: 'https://petstore.example',
  openApiUrl: '',
  docType: 'swagger-ui',
  createdAt: 0,
  lastActiveEnvId: 'default',
}

/* eslint-disable @typescript-eslint/no-explicit-any -- terse test doubles */
function services() {
  const okAsync = (v: unknown = undefined) => vi.fn(async (): Promise<Result<any>> => ok(v))
  return {
    authService: {
      current: okAsync(null),
      clear: okAsync(),
      isAutoRefreshEnabled: vi.fn(async () => false),
      setAutoRefreshEnabled: okAsync(),
      isBearerPrefixEnabled: vi.fn(async () => true),
      setBearerPrefixEnabled: okAsync(),
      addByLogin: okAsync({}),
      refreshActivity: vi.fn(async () => []),
      refreshNow: okAsync(true),
      loginEndpoint: vi.fn(async () => null),
      loginTemplate: vi.fn(async () => null),
      listSaved: okAsync([]),
      saveAs: okAsync({}),
      activateSaved: okAsync({}),
      deleteSaved: okAsync(),
      setLogin: okAsync({}),
    } as any,
    requestService: {
      listTemplates: okAsync([]),
      saveOpenAsTemplate: okAsync(null),
      createCustomTemplate: okAsync({}),
      updateTemplate: okAsync({}),
      applyTemplate: okAsync(),
      locateAndFill: okAsync(),
      deleteTemplate: okAsync(),
      listEndpoints: vi.fn(() => []),
      getOpenRequests: vi.fn(() => []),
    } as any,
    environmentService: {
      list: okAsync([]),
      getActiveId: vi.fn(async () => 'default'),
      switch: okAsync({}),
      create: okAsync({}),
      update: okAsync({}),
      delete: okAsync(),
      listBuiltins: () => [],
    } as any,
    historyService: {
      list: okAsync([]),
      get: okAsync(null),
      replay: okAsync({}),
      locate: vi.fn(() => ok(undefined)),
      deleteEntry: okAsync(),
      clearProject: okAsync(),
    } as any,
    fakeDataService: {
      previewOpenRequest: vi.fn(() => null),
      generateAll: okAsync({ endpointId: '', fieldCount: 0 }),
      regenerateField: okAsync({ endpointId: '', fieldCount: 0 }),
      listEndpoints: vi.fn(() => []),
      generateMockPayload: okAsync('{}'),
      generateBulk: okAsync({ format: 'json', count: 0, text: '[]', records: [] }),
      injectPayload: okAsync(undefined),
    } as any,
    settingsService: {
      getPreferences: vi.fn(async () => ({ autoBackup: false, historyLimit: 1000 })),
      setPreference: okAsync(),
      resetPreferences: okAsync(),
      getStorageMetrics: vi.fn(async () => ({ totalBytes: 0, projects: [] })),
      clearProject: okAsync(0),
      clearAll: okAsync(),
    } as any,
    importExportService: {
      exportAll: okAsync('{}'),
      backup: okAsync('backup.json'),
      previewImport: vi.fn(() => ok({} as any)),
      applyImport: okAsync({ imported: 0, skipped: 0, renamed: 0 }),
    } as any,
    collectionsService: {
      listCollections: okAsync([]),
      createCollection: okAsync({} as any),
      updateCollection: okAsync({} as any),
      deleteCollection: okAsync(),
      addEndpointToCollection: okAsync(),
      removeEndpointFromCollection: okAsync(),
      listEndpoints: () => [],
      openEndpoint: vi.fn(),
      replayEndpoint: okAsync(),
      importTags: okAsync({ created: 0, updated: 0 }),
      getStoredRequestBody: () => null,
    } as any,
  }
}

/* eslint-enable @typescript-eslint/no-explicit-any */

async function setup(over: { staleTab?: boolean } = {}) {
  const storage = new StorageService({ area: createFakeArea(), now: () => 0 })
  const theme = new ThemeManager({
    storage,
    root: document.createElement('div'),
    matchMedia: () => noMatch,
  })
  await theme.init()
  const bus = new EventBus()
  const onOpenPalette = vi.fn()
  const onOpenShortcutsModal = vi.fn()
  render(
    <PanelShell
      project={project}
      theme={theme}
      bus={bus}
      environmentId="default"
      onOpenPalette={onOpenPalette}
      onOpenShortcutsModal={onOpenShortcutsModal}
      staleTab={over.staleTab}
      {...services()}
    />,
  )
  return { onOpenPalette, onOpenShortcutsModal }
}

describe('PanelShell (native side panel)', () => {
  it('renders the header, tabs, and the project dashboard', async () => {
    await setup()
    expect(screen.getByText('OpenAPI Companion')).toBeInTheDocument()
    expect(screen.getByRole('tablist')).toBeInTheDocument()
    expect(screen.getAllByText('Petstore API').length).toBeGreaterThanOrEqual(1)
  })

  it('switches to the interactive History tab', async () => {
    await setup()
    fireEvent.click(screen.getByRole('tab', { name: /History/ }))
    expect(await screen.findByLabelText('Search history')).toBeInTheDocument()
  })

  // The palette renders in the PAGE (top-centered over the doc), not in this
  // narrow column — so the panel only asks for it, and never renders it itself.
  it('delegates the search button to the in-page palette', async () => {
    const { onOpenPalette } = await setup()
    fireEvent.click(screen.getByRole('button', { name: 'Search endpoints (⌘K)' }))
    expect(onOpenPalette).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog', { name: 'Search endpoints' })).not.toBeInTheDocument()
  })

  it('delegates ⌘K to the in-page palette', async () => {
    const { onOpenPalette } = await setup()
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(onOpenPalette).toHaveBeenCalledTimes(1)
  })

  it('delegates the keyboard shortcuts button to the in-page modal', async () => {
    const { onOpenShortcutsModal } = await setup()
    fireEvent.click(screen.getByRole('button', { name: 'Keyboard shortcuts (?)' }))
    expect(onOpenShortcutsModal).toHaveBeenCalledTimes(1)
  })

  // Reloading the extension leaves old content scripts in open tabs, where newer
  // RPC methods don't exist — the panel must say so, not fail silently.
  it('warns when the page is running an older build', async () => {
    await setup({ staleTab: true })
    expect(screen.getByRole('status')).toHaveTextContent('older build of the extension')
  })

  it('shows no warning when the builds match', async () => {
    await setup()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('renders PortChangeBanner when candidate projects exist', async () => {
    const storage = new StorageService({ area: createFakeArea(), now: () => 0 })
    const theme = new ThemeManager({
      storage,
      root: document.createElement('div'),
      matchMedia: () => noMatch,
    })
    await theme.init()
    const bus = new EventBus()
    const mockProjectService = {
      rename: vi.fn(async () => ok(project)),
      linkOrigin: vi.fn(async () => ok(undefined)),
      unlinkOrigin: vi.fn(async () => ok(undefined)),
      copyData: vi.fn(async () => ok(5)),
      listAll: vi.fn(async () => ok([])),
      dismissCandidates: vi.fn(async () => ok(undefined)),
    }

    render(
      <PanelShell
        project={project}
        theme={theme}
        bus={bus}
        environmentId="default"
        onOpenPalette={vi.fn()}
        candidateProjects={[
          {
            id: 'p_8008',
            name: 'Local API 8008',
            originUrl: 'http://localhost:8008',
            openApiUrl: 'http://localhost:8008/docs',
            presetCount: 3,
            variableCount: 2,
          },
        ]}
        projectService={mockProjectService}
        {...services()}
      />,
    )

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/Port Change Detected/)).toBeInTheDocument()
    expect(screen.getByText(/Local API 8008/)).toBeInTheDocument()
  })

  it('opens ProjectSwitcherModal when clicking project button in header', async () => {
    const storage = new StorageService({ area: createFakeArea(), now: () => 0 })
    const theme = new ThemeManager({
      storage,
      root: document.createElement('div'),
      matchMedia: () => noMatch,
    })
    await theme.init()
    const bus = new EventBus()
    const mockProjectService = {
      rename: vi.fn(async () => ok(project)),
      linkOrigin: vi.fn(async () => ok(undefined)),
      unlinkOrigin: vi.fn(async () => ok(undefined)),
      copyData: vi.fn(async () => ok(5)),
      listAll: vi.fn(async () => ok([])),
      dismissCandidates: vi.fn(async () => ok(undefined)),
    }

    render(
      <PanelShell
        project={project}
        theme={theme}
        bus={bus}
        environmentId="default"
        onOpenPalette={vi.fn()}
        projectService={mockProjectService}
        {...services()}
      />,
    )

    const switchBtn = screen.getByTitle(/Switch or link project/)
    fireEvent.click(switchBtn)

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Switch or Link Projects')).toBeInTheDocument()
  })
})

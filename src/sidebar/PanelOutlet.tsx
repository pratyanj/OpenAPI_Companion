import { EmptyState, SearchIcon, PlaceholderIcon } from '@/components'
import type { ProjectMeta } from '@/core/project'
import type { EventBus } from '@/core/events'
import type { ThemeManager } from '@/services'
import { AuthPanel, type AuthPanelService } from '@/modules/authentication'
import { RequestsPanel, type RequestPanelService, type PresetEditorOpenOptions } from '@/modules/request'
import { EnvironmentsPanel, type EnvironmentPanelService } from '@/modules/environment'
import { HistoryPanel, type HistoryPanelService } from '@/modules/history'
import { FakeDataPanel, type FakeDataPanelService } from '@/modules/fake-data'
import { SettingsPanel, type SettingsApi, type ImportExportApi } from '@/modules/settings'
import { CollectionsPanel, type CollectionsPanelService } from '@/modules/collections'
import { Dashboard, type DocStats } from './Dashboard'

/**
 * Fallback copy when a panel's service isn't wired (e.g. the page agent isn't
 * reachable). Every module has shipped, so this is a connection problem now.
 */
const PLACEHOLDERS: Record<string, { title: string; message: string }> = {
  auth: { title: 'Authentication', message: 'Not connected to the page yet.' },
  requests: { title: 'Requests & Templates', message: 'Not connected to the page yet.' },
  environments: { title: 'Variables', message: 'Not connected to the page yet.' },
  history: { title: 'API History', message: 'Not connected to the page yet.' },
  collections: { title: 'Collections', message: 'Not connected to the page yet.' },
}

/** Shown when the rich dashboard can't be built (no services / no project). */
function BasicHome({ project }: { project: ProjectMeta | null }) {
  return (
    <EmptyState
      icon={<SearchIcon className="h-8 w-8 text-muted" />}
      title={project ? project.name : 'No project detected'}
      message={project ? 'Connecting to the page…' : 'Open an OpenAPI (Swagger UI) page to begin.'}
    />
  )
}

interface PanelOutletProps {
  activeTab: string
  project: ProjectMeta | null
  bus?: EventBus
  authService?: AuthPanelService
  requestService?: RequestPanelService
  environmentService?: EnvironmentPanelService
  historyService?: HistoryPanelService
  fakeDataService?: FakeDataPanelService
  collectionsService?: CollectionsPanelService
  settingsService?: SettingsApi
  importExportService?: ImportExportApi
  theme?: ThemeManager
  environmentId?: string
  /** Opens the in-page command palette; enables the dashboard's Search action. */
  onOpenPalette?: () => void
  /** Opens the in-page preset editor overlay. */
  onOpenPresetEditor?: (options?: PresetEditorOpenOptions) => void
  /** Opens the in-page history request detail overlay. */
  onOpenHistoryDetail?: (historyId: string) => void
  /** Tab switcher, so the dashboard can link into the other panels. */
  onNavigate?: (tabId: string) => void
  /** Adapter reads for the dashboard's spec summary (version / endpoint count). */
  swagger?: DocStats
}

export function PanelOutlet({
  activeTab,
  project,
  bus,
  authService,
  requestService,
  environmentService,
  historyService,
  fakeDataService,
  collectionsService,
  settingsService,
  importExportService,
  theme,
  environmentId,
  onOpenPalette,
  onOpenPresetEditor,
  onOpenHistoryDetail,
  onNavigate,
  swagger,
}: PanelOutletProps) {
  if (activeTab === 'dashboard') {
    // The rich dashboard needs the read services; fall back if they're absent.
    if (
      bus &&
      environmentId &&
      authService &&
      environmentService &&
      historyService &&
      requestService &&
      importExportService &&
      onOpenPalette &&
      onNavigate
    ) {
      return (
        <Dashboard
          project={project}
          bus={bus}
          environmentId={environmentId}
          authService={authService}
          environmentService={environmentService}
          historyService={historyService}
          requestService={requestService}
          importExportService={importExportService}
          onOpenPalette={onOpenPalette}
          onNavigate={onNavigate}
          swagger={swagger}
        />
      )
    }
    return <BasicHome project={project} />
  }

  if (activeTab === 'auth' && authService && bus && environmentId) {
    return (
      <AuthPanel
        service={authService}
        bus={bus}
        environmentId={environmentId}
        onNavigate={onNavigate}
      />
    )
  }

  if (activeTab === 'requests' && requestService && bus && environmentId) {
    return (
      <RequestsPanel
        service={requestService}
        bus={bus}
        environmentId={environmentId}
        environmentService={environmentService}
        onOpenPresetEditor={onOpenPresetEditor}
      />
    )
  }

  if (activeTab === 'environments' && environmentService && bus) {
    return (
      <EnvironmentsPanel
        service={environmentService}
        bus={bus}
        endpoints={requestService?.listEndpoints?.() ?? []}
        requestService={requestService}
      />
    )
  }

  if (activeTab === 'history' && historyService && bus) {
    return (
      <HistoryPanel
        service={historyService}
        bus={bus}
        baseUrl={project?.originUrl}
        environmentService={environmentService}
        onOpenHistoryDetail={onOpenHistoryDetail}
      />
    )
  }

  if (activeTab === 'fake-data' && fakeDataService && bus) {
    return <FakeDataPanel service={fakeDataService} bus={bus} />
  }

  if (activeTab === 'collections' && collectionsService && bus) {
    return <CollectionsPanel service={collectionsService} bus={bus} />
  }

  if (activeTab === 'settings' && settingsService && importExportService && theme && bus) {
    return (
      <SettingsPanel
        settings={settingsService}
        io={importExportService}
        theme={theme}
        projectId={project?.id}
        bus={bus}
      />
    )
  }

  const placeholder = PLACEHOLDERS[activeTab]
  if (!placeholder) return <BasicHome project={project} />
  return (
    <EmptyState
      icon={<PlaceholderIcon className="h-8 w-8 text-muted" />}
      title={placeholder.title}
      message={placeholder.message}
    />
  )
}

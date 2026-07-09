import { Badge, EmptyState, SearchIcon, PlaceholderIcon } from '@/components'
import type { ProjectMeta } from '@/core/project'
import type { EventBus } from '@/core/events'
import type { ThemeManager } from '@/services'
import { AuthPanel, type AuthPanelService } from '@/modules/authentication'
import { RequestsPanel, type RequestPanelService } from '@/modules/request'
import { EnvironmentsPanel, type EnvironmentPanelService } from '@/modules/environment'
import { HistoryPanel, type HistoryPanelService } from '@/modules/history'
import { FakeDataPanel, type FakeDataPanelService } from '@/modules/fake-data'
import { SettingsPanel, type SettingsApi, type ImportExportApi } from '@/modules/settings'

/** Placeholder copy per not-yet-built module (each names its sprint). */
const PLACEHOLDERS: Record<string, { title: string; message: string }> = {
  auth: {
    title: 'Authentication',
    message: 'Persist & auto-restore your Swagger login across refreshes. Arrives in Sprint 4.',
  },
  requests: {
    title: 'Requests & Templates',
    message: 'Auto-save and restore request bodies, params, and headers. Arrives in Sprint 6.',
  },
  environments: {
    title: 'Environments',
    message: 'Switch between Local/QA/Staging with one click. Arrives in Sprint 8.',
  },
  history: {
    title: 'API History',
    message: 'Every executed request, searchable and replayable. Arrives in Sprint 9.',
  },
}

function Dashboard({ project }: { project: ProjectMeta | null }) {
  if (!project) {
    return (
      <EmptyState
        icon={<SearchIcon className="h-8 w-8 text-muted" />}
        title="No project detected"
        message="Open an OpenAPI (Swagger UI) page to begin."
      />
    )
  }
  return (
    <div className="flex flex-col gap-3 p-4">
      <div>
        <div className="text-sm font-semibold text-text">{project.name}</div>
        <div className="font-mono text-[11px] text-muted">{project.id}</div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge kind="info">{project.docType}</Badge>
        <Badge kind="neutral">env: {project.lastActiveEnvId}</Badge>
      </div>
      <p className="text-xs text-muted">
        Foundation is in place — feature modules (auth, requests, history…) light up the tabs above
        as they ship.
      </p>
    </div>
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
  settingsService?: SettingsApi
  importExportService?: ImportExportApi
  theme?: ThemeManager
  environmentId?: string
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
  settingsService,
  importExportService,
  theme,
  environmentId,
}: PanelOutletProps) {
  if (activeTab === 'dashboard') return <Dashboard project={project} />

  if (activeTab === 'auth' && authService && bus && environmentId) {
    return <AuthPanel service={authService} bus={bus} environmentId={environmentId} />
  }

  if (activeTab === 'requests' && requestService && bus && environmentId) {
    return <RequestsPanel service={requestService} bus={bus} environmentId={environmentId} />
  }

  if (activeTab === 'environments' && environmentService && bus) {
    return <EnvironmentsPanel service={environmentService} bus={bus} />
  }

  if (activeTab === 'history' && historyService && bus) {
    return <HistoryPanel service={historyService} bus={bus} />
  }

  if (activeTab === 'fake-data' && fakeDataService && bus) {
    return <FakeDataPanel service={fakeDataService} bus={bus} />
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
  if (!placeholder) return <Dashboard project={project} />
  return (
    <EmptyState
      icon={<PlaceholderIcon className="h-8 w-8 text-muted" />}
      title={placeholder.title}
      message={placeholder.message}
    />
  )
}

import { useEffect, useState, type ComponentType } from 'react'
import {
  IconButton,
  Tabs,
  ToastLayer,
  SearchIcon,
  ThemeLightIcon,
  ThemeDarkIcon,
  ThemeSystemIcon,
} from '@/components'
import { useEventBus, useTheme } from '@/hooks'
import type { EventBus } from '@/core/events'
import type { ProjectMeta } from '@/core/project'
import type { ThemeManager, ThemePreference } from '@/services'
import type { AuthPanelService } from '@/modules/authentication'
import type { RequestPanelService } from '@/modules/request'
import type { EnvironmentPanelService } from '@/modules/environment'
import type { HistoryPanelService } from '@/modules/history'
import type { FakeDataPanelService } from '@/modules/fake-data'
import type { SettingsApi, ImportExportApi } from '@/modules/settings'
import type { CollectionsPanelService } from '@/modules/collections'
import type { DocStats } from '@/sidebar/Dashboard'
import { PanelOutlet } from '@/sidebar/PanelOutlet'
import { TABS, DEFAULT_TAB } from '@/sidebar/tabs'

const NEXT_PREFERENCE: Record<ThemePreference, ThemePreference> = {
  light: 'dark',
  dark: 'system',
  system: 'light',
}
const PREFERENCE_ICON: Record<ThemePreference, ComponentType<{ className?: string }>> = {
  light: ThemeLightIcon,
  dark: ThemeDarkIcon,
  system: ThemeSystemIcon,
}

export interface PanelShellProps {
  project: ProjectMeta
  theme: ThemeManager
  bus: EventBus
  environmentId: string
  /** Opens the palette in the PAGE (see `openPagePalette`) — not in this column. */
  onOpenPalette: () => void
  /** The page is running an older build of the agent; it needs a refresh. */
  staleTab?: boolean
  authService: AuthPanelService
  requestService: RequestPanelService
  environmentService: EnvironmentPanelService
  historyService: HistoryPanelService
  fakeDataService: FakeDataPanelService
  settingsService: SettingsApi
  importExportService: ImportExportApi
  collectionsService: CollectionsPanelService
  /** Adapter reads for the dashboard's spec summary (version / endpoint count). */
  swagger?: DocStats
}

/**
 * Full-height shell for the native Side Panel. Same tabs + panels as the old
 * injected sidebar (reuses `PanelOutlet`), minus the floating card / collapse
 * chrome the browser's panel already provides.
 */
export function PanelShell({
  project,
  theme,
  bus,
  environmentId,
  onOpenPalette,
  staleTab = false,
  authService,
  requestService,
  environmentService,
  historyService,
  fakeDataService,
  settingsService,
  importExportService,
  collectionsService,
  swagger,
}: PanelShellProps) {
  const [activeTab, setActiveTab] = useState(DEFAULT_TAB)
  const [activeEnv, setActiveEnv] = useState(environmentId)
  const { preference } = useTheme(theme)

  useEventBus(bus, 'ENVIRONMENT_CHANGED', (payload) => setActiveEnv(payload.environmentId))

  // ⌘K works from the panel too, but the palette itself opens in the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        onOpenPalette()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onOpenPalette])

  const cycleTheme = () => void theme.setPreference(NEXT_PREFERENCE[theme.getPreference()])
  const PreferenceIcon = PREFERENCE_ICON[preference]

  return (
    <div className="flex min-h-screen flex-col bg-bg text-text">
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <strong className="text-sm">OpenAPI Companion</strong>
        <div className="flex items-center gap-1.5">
          <IconButton label="Search endpoints (⌘K)" onClick={onOpenPalette}>
            <SearchIcon />
          </IconButton>
          <IconButton label={`Theme: ${preference}. Click to change.`} onClick={cycleTheme}>
            <PreferenceIcon className="h-4 w-4" />
          </IconButton>
        </div>
      </header>

      {staleTab ? (
        <p
          role="status"
          className="border-b border-warning bg-warning/10 px-3 py-2 text-[11px] leading-snug text-warning"
        >
          This tab is running an older build of the extension, so newer actions won&apos;t work.
          Refresh the page (⌘⇧R / Ctrl+Shift+R).
        </p>
      ) : null}

      <nav className="border-b border-border px-2 py-2">
        <Tabs tabs={TABS} activeId={activeTab} onChange={setActiveTab} />
      </nav>

      <div
        role="tabpanel"
        id={`panel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
        className="flex-1 overflow-auto"
      >
        <PanelOutlet
          activeTab={activeTab}
          project={project}
          bus={bus}
          authService={authService}
          requestService={requestService}
          environmentService={environmentService}
          historyService={historyService}
          fakeDataService={fakeDataService}
          collectionsService={collectionsService}
          settingsService={settingsService}
          importExportService={importExportService}
          theme={theme}
          environmentId={activeEnv}
          onOpenPalette={onOpenPalette}
          onNavigate={setActiveTab}
          swagger={swagger}
        />
      </div>

      <ToastLayer bus={bus} />
    </div>
  )
}

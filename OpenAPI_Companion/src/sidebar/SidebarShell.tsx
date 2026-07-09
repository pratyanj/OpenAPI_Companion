import { useEffect, useState, type ComponentType } from 'react'
import {
  IconButton,
  Tabs,
  ToastLayer,
  BrandIcon,
  CloseIcon,
  SearchIcon,
  ThemeLightIcon,
  ThemeDarkIcon,
  ThemeSystemIcon,
} from '@/components'
import { useEventBus, useTheme } from '@/hooks'
import { settingsKey, type StorageService } from '@/core/storage'
import type { EventBus } from '@/core/events'
import type { ProjectMeta } from '@/core/project'
import type { ThemeManager, ThemePreference } from '@/services'
import type { AuthPanelService } from '@/modules/authentication'
import type { RequestPanelService } from '@/modules/request'
import type { EnvironmentPanelService } from '@/modules/environment'
import type { HistoryPanelService } from '@/modules/history'
import type { FakeDataPanelService } from '@/modules/fake-data'
import { CommandPalette, type ProductivityPanelService } from '@/modules/productivity'
import type { SettingsApi, ImportExportApi } from '@/modules/settings'
import { PanelOutlet } from './PanelOutlet'
import { TABS, DEFAULT_TAB } from './tabs'

export const SIDEBAR_COLLAPSED_KEY = settingsKey('sidebar-collapsed')

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

export interface SidebarShellProps {
  project: ProjectMeta | null
  theme: ThemeManager
  bus: EventBus
  storage: StorageService
  initialCollapsed?: boolean
  /** Present once a project is identified — power the feature panels. */
  authService?: AuthPanelService
  requestService?: RequestPanelService
  environmentService?: EnvironmentPanelService
  historyService?: HistoryPanelService
  fakeDataService?: FakeDataPanelService
  productivityService?: ProductivityPanelService
  settingsService?: SettingsApi
  importExportService?: ImportExportApi
  environmentId?: string
}

export function SidebarShell({
  project,
  theme,
  bus,
  storage,
  initialCollapsed = false,
  authService,
  requestService,
  environmentService,
  historyService,
  fakeDataService,
  productivityService,
  settingsService,
  importExportService,
  environmentId,
}: SidebarShellProps) {
  const [collapsed, setCollapsed] = useState(initialCollapsed)
  const [activeTab, setActiveTab] = useState(DEFAULT_TAB)
  const [activeEnv, setActiveEnv] = useState(environmentId)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const { preference } = useTheme(theme)

  // Switching environments re-scopes the Auth/Request panels to the new env.
  useEventBus(bus, 'ENVIRONMENT_CHANGED', (payload) => setActiveEnv(payload.environmentId))

  // ⌘K / Ctrl+K opens the endpoint search palette (FR-PROD-001).
  useEffect(() => {
    if (!productivityService) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [productivityService])

  const toggleCollapsed = () => {
    const next = !collapsed
    setCollapsed(next)
    void storage.set(SIDEBAR_COLLAPSED_KEY, next, { immediate: true })
  }
  const cycleTheme = () => void theme.setPreference(NEXT_PREFERENCE[theme.getPreference()])
  const PreferenceIcon = PREFERENCE_ICON[preference]

  const palette =
    paletteOpen && productivityService ? (
      <CommandPalette service={productivityService} onClose={() => setPaletteOpen(false)} />
    ) : null

  if (collapsed) {
    return (
      <>
        <IconButton
          label="Open OpenAPI Companion"
          onClick={toggleCollapsed}
          className="fixed right-3 top-3 z-[2147483647] h-9 w-9 rounded-full border border-border bg-bg text-base shadow-xl"
        >
          <BrandIcon className="h-5 w-5" />
        </IconButton>
        {palette}
        <ToastLayer bus={bus} />
      </>
    )
  }

  return (
    <>
      <aside
        role="complementary"
        aria-label="OpenAPI Companion"
        className="fixed right-3 top-3 z-[2147483647] flex max-h-[85vh] w-80 flex-col overflow-hidden rounded-xl border border-border bg-bg text-text shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-border px-3 py-2">
          <strong className="text-sm">OpenAPI Companion</strong>
          <div className="flex items-center gap-1">
            {productivityService ? (
              <IconButton label="Search endpoints (⌘K)" onClick={() => setPaletteOpen(true)}>
                <SearchIcon />
              </IconButton>
            ) : null}
            <IconButton label={`Theme: ${preference}. Click to change.`} onClick={cycleTheme}>
              <PreferenceIcon className="h-4 w-4" />
            </IconButton>
            <IconButton label="Collapse" onClick={toggleCollapsed}>
              <CloseIcon />
            </IconButton>
          </div>
        </header>

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
            settingsService={settingsService}
            importExportService={importExportService}
            theme={theme}
            environmentId={activeEnv}
          />
        </div>

        <ToastLayer bus={bus} />
      </aside>
      {palette}
    </>
  )
}

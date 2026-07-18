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
  CollapseIcon,
  ExpandIcon,
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

/** Width values that mirror the CSS variable set in index.tsx. */
const OPEN_W = '320px'
const MINI_W = '40px'

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

  // Keep the page-level CSS variable in sync so the host width + body
  // margin-right animate together whenever the collapse state changes.
  useEffect(() => {
    document.documentElement.style.setProperty('--oac-w', collapsed ? MINI_W : OPEN_W)
  }, [collapsed])

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

  // ── Collapsed: narrow icon strip ─────────────────────────────────────────
  if (collapsed) {
    return (
      <>
        <aside
          role="complementary"
          aria-label="OpenAPI Companion (collapsed)"
          className="flex h-full w-full flex-col items-center overflow-hidden rounded-xl border border-border bg-bg text-text shadow-xl"
        >
          {/* Top: brand icon + search + tab shortcuts */}
          <div className="flex flex-1 flex-col items-center gap-1 overflow-y-auto py-2">
            <IconButton
              label="Open OpenAPI Companion"
              onClick={toggleCollapsed}
              className="h-8 w-8 text-primary"
            >
              <BrandIcon className="h-5 w-5" />
            </IconButton>

            {/* Search — opens the API palette without expanding the sidebar */}
            {productivityService ? (
              <IconButton
                label="Search endpoints (⌘K)"
                onClick={() => setPaletteOpen(true)}
                className="h-8 w-8 text-muted hover:text-text"
              >
                <SearchIcon className="h-4 w-4" />
              </IconButton>
            ) : null}

            <div className="my-1 h-px w-6 bg-border" />

            {/* Click a tab icon to jump directly to that panel and expand */}
            {TABS.map((tab) => (
              <IconButton
                key={tab.id}
                label={tab.label}
                onClick={() => {
                  setActiveTab(tab.id)
                  toggleCollapsed()
                }}
                className={`h-8 w-8 ${
                  activeTab === tab.id ? 'text-primary' : 'text-muted'
                }`}
              >
                {tab.icon}
              </IconButton>
            ))}
          </div>

          {/* Bottom: theme toggle + expand arrow */}
          <div className="flex w-full flex-col items-center gap-1 border-t border-border py-2">
            <IconButton
              label={`Theme: ${preference}. Click to change.`}
              onClick={cycleTheme}
              className="h-8 w-8 text-muted"
            >
              <PreferenceIcon className="h-4 w-4" />
            </IconButton>
            <IconButton
              label="Expand sidebar"
              onClick={toggleCollapsed}
              className="h-8 w-8 text-muted hover:text-text"
            >
              <ExpandIcon className="h-4 w-4" />
            </IconButton>
          </div>
        </aside>
        {palette}
        <ToastLayer bus={bus} />
      </>
    )
  }

  // ── Expanded: full sidebar panel ──────────────────────────────────────────
  return (
    <>
      <aside
        role="complementary"
        aria-label="OpenAPI Companion"
        className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-border bg-bg text-text shadow-xl"
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

        {/* Collapse to icon strip — up arrow at the bottom */}
        <div className="flex items-center justify-center border-t border-border py-1">
          <IconButton
            label="Collapse to icon strip"
            onClick={toggleCollapsed}
            className="h-7 w-7 text-muted hover:text-text"
          >
            <CollapseIcon className="h-4 w-4" />
          </IconButton>
        </div>
      </aside>
      {palette}
    </>
  )
}

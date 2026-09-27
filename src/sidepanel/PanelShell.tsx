import { useCallback, useEffect, useState, type ComponentType } from 'react'
import {
  IconButton,
  Button,
  Tabs,
  ToastLayer,
  SearchIcon,
  ThemeLightIcon,
  ThemeDarkIcon,
  ThemeSystemIcon,
  ChevronDownIcon,
  FolderIcon,
  KeyboardIcon,
  PortChangeBanner,
  MessageSquareIcon,
  OnboardingModal,
  FeedbackModal,
  CloseIcon,
} from '@/components'
import { ProjectSwitcherModal } from '@/components/ProjectSwitcherModal'
import { isOnboardingCompleted } from '@/services/feedback-service'
import {
  getPendingUpdate,
  applyUpdateAndReload,
  type PendingUpdate,
} from '@/services/update-service'
import { useEventBus, useTheme } from '@/hooks'
import type { EventBus } from '@/core/events'
import type { ProjectMeta, CandidateProject } from '@/core/project'
import type { ThemeManager, ThemePreference } from '@/services'
import type { AuthPanelService } from '@/modules/authentication'
import type { RequestPanelService, PresetEditorOpenOptions } from '@/modules/request'
import type { EnvironmentPanelService } from '@/modules/environment'
import type { HistoryPanelService } from '@/modules/history'
import type { FakeDataPanelService } from '@/modules/fake-data'
import type { SettingsApi, ImportExportApi } from '@/modules/settings'
import type { CollectionsPanelService } from '@/modules/collections'
import type { WorkflowsPanelService } from '@/modules/workflows'
import type { DocStats } from '@/sidebar/Dashboard'
import { PanelOutlet } from '@/sidebar/PanelOutlet'
import { TABS, DEFAULT_TAB } from '@/sidebar/tabs'
import type { Result } from '@/types'
import type {
  ExtractionRuleModalOpenOptions,
  WorkflowEditorBridgeOpenOptions,
  WorkflowRunnerBridgeOpenOptions,
  RemoteProjectApi,
} from './bridge'

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
  /** Opens the preset editor overlay in the PAGE (see `openPagePresetEditor`). */
  onOpenPresetEditor?: (options?: PresetEditorOpenOptions) => void
  /** Opens the request detail overlay in the PAGE (see `openPageHistoryDetail`). */
  onOpenHistoryDetail?: (historyId: string) => void
  /** Opens the auto-extraction rule modal overlay in the PAGE (see `openPageExtractionRuleModal`). */
  onOpenExtractionRuleModal?: (
    options?: ExtractionRuleModalOpenOptions,
  ) => Promise<Result<void>> | Result<void> | void
  /** Opens the keyboard shortcuts modal overlay in the PAGE (see `openPageShortcutsModal`). */
  onOpenShortcutsModal?: () => void
  /** Opens the project switcher modal overlay in the PAGE (see `openPageProjectSwitcher`). */
  onOpenProjectSwitcher?: () => void
  /** Opens the feedback modal overlay in the PAGE (see `openPageFeedbackModal`). */
  onOpenFeedbackModal?: (options?: {
    initialCategory?: 'feature' | 'bug' | 'general'
  }) => Promise<Result<void>> | Result<void> | void
  /** Opens the workflow editor overlay in the PAGE (see `openPageWorkflowEditor`). */
  onOpenWorkflowEditor?: (options?: WorkflowEditorBridgeOpenOptions) => void
  /** Opens the workflow runner overlay in the PAGE (see `openPageWorkflowRunner`). */
  onOpenWorkflowRunner?: (options: WorkflowRunnerBridgeOpenOptions) => void
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
  workflowsService?: WorkflowsPanelService
  /** Adapter reads for the dashboard's spec summary (version / endpoint count). */
  swagger?: DocStats
  candidateProjects?: CandidateProject[]
  projectService?: RemoteProjectApi
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
  onOpenPresetEditor,
  onOpenHistoryDetail,
  onOpenExtractionRuleModal,
  onOpenShortcutsModal,
  onOpenProjectSwitcher,
  onOpenFeedbackModal,
  onOpenWorkflowEditor,
  onOpenWorkflowRunner,
  staleTab = false,
  authService,
  requestService,
  environmentService,
  historyService,
  fakeDataService,
  settingsService,
  importExportService,
  collectionsService,
  workflowsService,
  swagger,
  candidateProjects,
  projectService,
}: PanelShellProps) {
  const [activeTab, setActiveTab] = useState(DEFAULT_TAB)
  const [activeEnv, setActiveEnv] = useState(environmentId)
  const [currentProjectName, setCurrentProjectName] = useState(project.name)
  const [isProjectSwitcherOpen, setIsProjectSwitcherOpen] = useState(false)
  const [candidates, setCandidates] = useState<CandidateProject[]>(candidateProjects ?? [])
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false)
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false)
  const [pendingUpdate, setPendingUpdate] = useState<PendingUpdate | null>(null)
  const { preference } = useTheme(theme)

  useEffect(() => {
    isOnboardingCompleted().then((completed) => {
      if (!completed) {
        setIsOnboardingOpen(true)
      }
    })

    getPendingUpdate().then(setPendingUpdate)

    const onStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName === 'local' && changes['oac_update_available']) {
        const val = changes['oac_update_available'].newValue as PendingUpdate | undefined
        setPendingUpdate(val ?? null)
      }
    }
    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener(onStorageChange)
      return () => chrome.storage.onChanged.removeListener(onStorageChange)
    }
  }, [])

  useEffect(() => {
    setCurrentProjectName(project.name)
  }, [project.name])

  useEffect(() => {
    if (candidateProjects && candidateProjects.length > 0) {
      setCandidates(candidateProjects)
    }
  }, [candidateProjects])

  useEventBus(bus, 'PROJECT_UPDATED', (payload) => {
    if (payload?.name && (!payload.projectId || payload.projectId === project.id)) {
      setCurrentProjectName(payload.name)
    }
  })

  const lastTabKey = project?.id ? `oac_last_tab_${project.id}` : 'oac_last_tab'

  const handleTabChange = useCallback(
    (tab: string) => {
      setActiveTab(tab)
      try {
        if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
          chrome.storage.local.set({ [lastTabKey]: tab, oac_last_tab: tab })
        }
      } catch {
        // ignore
      }
    },
    [lastTabKey],
  )

  useEventBus(bus, 'ENVIRONMENT_CHANGED', (payload) => setActiveEnv(payload.environmentId))
  useEventBus(bus, 'TAB_NAVIGATE', (payload) => {
    const tab = payload?.tab
    if (tab && TABS.some((t) => t.id === tab)) {
      handleTabChange(tab)
    }
  })

  useEffect(() => {
    try {
      if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
        chrome.storage.local.get(['oac_requested_tab', lastTabKey, 'oac_last_tab'], (res) => {
          if (res?.oac_requested_tab && TABS.some((t) => t.id === res.oac_requested_tab)) {
            handleTabChange(res.oac_requested_tab)
            chrome.storage.local.remove('oac_requested_tab')
          } else {
            const saved = res?.[lastTabKey] || res?.oac_last_tab
            if (saved && TABS.some((t) => t.id === saved)) {
              setActiveTab(saved)
            }
          }
        })
      }
    } catch {
      // ignore
    }
  }, [handleTabChange, lastTabKey])

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

  const handleOpenProjectSwitcher = () => {
    if (onOpenProjectSwitcher) {
      onOpenProjectSwitcher()
    } else {
      setIsProjectSwitcherOpen(true)
    }
  }

  const handleOpenFeedback = (options?: { initialCategory?: 'feature' | 'bug' | 'general' }) => {
    if (onOpenFeedbackModal) {
      void Promise.resolve(onOpenFeedbackModal(options))
        .then((res) => {
          if (res && typeof res === 'object' && 'ok' in res && !(res as { ok: boolean }).ok) {
            setIsFeedbackOpen(true)
          }
        })
        .catch(() => {
          setIsFeedbackOpen(true)
        })
    } else {
      setIsFeedbackOpen(true)
    }
  }

  return (
    <div className="flex h-screen max-h-screen flex-col bg-bg text-text overscroll-none overflow-hidden">
      <header className="flex flex-shrink-0 items-center justify-between border-b border-border bg-bg px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <strong className="text-sm whitespace-nowrap">OpenAPI Companion</strong>
          <button
            type="button"
            onClick={handleOpenProjectSwitcher}
            className="flex items-center gap-1 rounded bg-surface/60 px-1.5 py-0.5 text-xs font-medium text-text hover:bg-surface border border-border transition-colors truncate max-w-[140px] text-left"
            title={`Switch or link project (Active: ${currentProjectName})`}
          >
            <FolderIcon className="h-3 w-3 text-primary flex-shrink-0" />
            <span className="truncate">{currentProjectName}</span>
            <ChevronDownIcon className="h-2.5 w-2.5 text-muted flex-shrink-0" />
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <IconButton label="Search endpoints (⌘K)" onClick={onOpenPalette}>
            <SearchIcon />
          </IconButton>
          {onOpenShortcutsModal ? (
            <IconButton label="Keyboard shortcuts (?)" onClick={onOpenShortcutsModal}>
              <KeyboardIcon className="h-4 w-4" />
            </IconButton>
          ) : null}
          <IconButton label="Share feedback" onClick={() => handleOpenFeedback()}>
            <MessageSquareIcon className="h-4 w-4" />
          </IconButton>
          <IconButton label={`Theme: ${preference}. Click to change.`} onClick={cycleTheme}>
            <PreferenceIcon className="h-4 w-4" />
          </IconButton>
        </div>
      </header>

      {pendingUpdate ? (
        <div
          role="status"
          className="flex-shrink-0 flex items-center justify-between gap-2 border-b border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-text shadow-sm"
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-emerald-500 font-bold shrink-0">⚡</span>
            <span className="truncate text-[11px]">
              Update ready (<strong>v{pendingUpdate.version}</strong>)!
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="primary"
              onClick={() => void applyUpdateAndReload()}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] py-0.5 px-2 h-auto"
            >
              Update Now
            </Button>
            <IconButton
              label="Dismiss update notification"
              onClick={() => setPendingUpdate(null)}
              className="h-5 w-5 text-muted hover:text-text"
            >
              <CloseIcon className="h-3 w-3" />
            </IconButton>
          </div>
        </div>
      ) : null}

      {staleTab ? (
        <p
          role="status"
          className="flex-shrink-0 border-b border-warning bg-warning/10 px-3 py-2 text-[11px] leading-snug text-warning"
        >
          This tab is running an older build of the extension, so newer actions won&apos;t work.
          Refresh the page (⌘⇧R / Ctrl+Shift+R).
        </p>
      ) : null}

      {candidates.length > 0 && projectService ? (
        <div className="flex-shrink-0 px-2 pt-2">
          <PortChangeBanner
            candidates={candidates}
            onLink={async (id) => {
              const res = await projectService.linkOrigin(id)
              if (!res.ok) {
                bus.publish('NOTIFY', {
                  message: res.error.message || 'Failed to link',
                  kind: 'error',
                })
              }
            }}
            onCopy={async (id) => {
              const res = await projectService.copyData(id)
              if (res.ok) {
                bus.publish('NOTIFY', {
                  message: `Copied ${res.value} items from project!`,
                  kind: 'success',
                })
                setCandidates([])
              } else {
                bus.publish('NOTIFY', {
                  message: res.error.message || 'Failed to copy',
                  kind: 'error',
                })
              }
            }}
            onDismiss={async () => {
              setCandidates([])
              await projectService.dismissCandidates()
            }}
          />
        </div>
      ) : null}

      <nav className="flex-shrink-0 border-b border-border bg-bg px-2 py-2">
        <Tabs tabs={TABS} activeId={activeTab} onChange={handleTabChange} />
      </nav>

      <div
        role="tabpanel"
        id={`panel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
        className="flex-1 overflow-y-auto overscroll-contain bg-bg"
      >
        <PanelOutlet
          activeTab={activeTab}
          project={{ ...project, name: currentProjectName }}
          bus={bus}
          authService={authService}
          requestService={requestService}
          environmentService={environmentService}
          historyService={historyService}
          fakeDataService={fakeDataService}
          collectionsService={collectionsService}
          workflowsService={workflowsService}
          settingsService={settingsService}
          importExportService={importExportService}
          theme={theme}
          environmentId={activeEnv}
          onOpenPalette={onOpenPalette}
          onOpenPresetEditor={onOpenPresetEditor}
          onOpenHistoryDetail={onOpenHistoryDetail}
          onOpenExtractionRuleModal={onOpenExtractionRuleModal}
          onOpenShortcutsModal={onOpenShortcutsModal}
          onOpenWorkflowEditor={onOpenWorkflowEditor}
          onOpenWorkflowRunner={onOpenWorkflowRunner}
          onNavigate={handleTabChange}
          swagger={swagger}
          projectService={projectService}
          onOpenProjectSwitcher={handleOpenProjectSwitcher}
          onOpenFeedbackModal={handleOpenFeedback}
        />
      </div>

      {!onOpenProjectSwitcher && isProjectSwitcherOpen && projectService ? (
        <ProjectSwitcherModal
          isOpen={isProjectSwitcherOpen}
          onClose={() => setIsProjectSwitcherOpen(false)}
          currentProject={{ ...project, name: currentProjectName }}
          projectService={projectService}
          onProjectRenamed={(name) => setCurrentProjectName(name)}
          onToast={(message, kind) => bus.publish('NOTIFY', { message, kind: kind ?? 'success' })}
        />
      ) : null}

      <ToastLayer bus={bus} />

      <OnboardingModal
        isOpen={isOnboardingOpen}
        onClose={() => setIsOnboardingOpen(false)}
        onToast={(message, kind) => bus.publish('NOTIFY', { message, kind: kind ?? 'success' })}
      />

      <FeedbackModal
        isOpen={isFeedbackOpen}
        onClose={() => setIsFeedbackOpen(false)}
        onToast={(message, kind) => bus.publish('NOTIFY', { message, kind: kind ?? 'success' })}
      />
    </div>
  )
}

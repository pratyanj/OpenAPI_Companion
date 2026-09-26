import { useState, useEffect, useMemo, useCallback } from 'react'
import type { CandidateProject, ProjectMeta } from '@/core/project/types'
import type { RemoteProjectApi } from '@/sidepanel/bridge'
import {
  Dialog,
  Button,
  IconButton,
  Input,
  Badge,
  Spinner,
  SearchIcon,
  CopyIcon,
  EditIcon,
  CopiedIcon,
  CloseIcon,
  FolderIcon,
  SwapIcon,
} from '@/components'
import { extractPort, normalizeLocalOrigin } from '@/utils/doc-url'

export interface ProjectSwitcherModalProps {
  isOpen: boolean
  onClose: () => void
  currentProject: ProjectMeta
  projectService: RemoteProjectApi
  onProjectRenamed?: (newName: string) => void
  onToast?: (message: string, kind?: 'success' | 'warning' | 'error') => void
}

/** Formats an origin URL into a concise, readable port or host label. */
function formatOriginChip(origin: string): { label: string; full: string } {
  const port = extractPort(origin)
  if (port) {
    return { label: `:${port}`, full: origin }
  }
  try {
    const url = new URL(origin)
    return { label: url.host, full: origin }
  } catch {
    return { label: origin, full: origin }
  }
}

export function ProjectSwitcherModal({
  isOpen,
  onClose,
  currentProject,
  projectService,
  onProjectRenamed,
  onToast,
}: ProjectSwitcherModalProps) {
  const [projects, setProjects] = useState<CandidateProject[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  // Inline rename state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  const loadProjects = useCallback(async () => {
    setLoading(true)
    try {
      const res = await projectService.listAll()
      if (res.ok) {
        setProjects(res.value)
      }
    } finally {
      setLoading(false)
    }
  }, [projectService])

  useEffect(() => {
    if (isOpen) {
      void loadProjects()
    }
  }, [isOpen, loadProjects])

  const filteredProjects = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return projects
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.originUrl.toLowerCase().includes(q) ||
        (p.linkedOrigins && p.linkedOrigins.some((o) => o.toLowerCase().includes(q))),
    )
  }, [projects, search])

  const handleStartRename = (id: string, currentName: string) => {
    setEditingId(id)
    setEditingName(currentName)
  }

  const handleSaveRename = async (id: string) => {
    const trimmed = editingName.trim()
    if (!trimmed) return
    try {
      setBusyId(`rename-${id}`)
      const res = await projectService.rename(trimmed, id)
      if (res.ok) {
        onToast?.(`Project renamed to "${trimmed}"`, 'success')
        if (id === currentProject.id) {
          onProjectRenamed?.(trimmed)
        }
        setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, name: trimmed } : p)))
        setEditingId(null)
      } else {
        onToast?.(res.error.message || 'Failed to rename project', 'error')
      }
    } finally {
      setBusyId(null)
    }
  }

  /**
   * 1-Click switch: attaches the current tab's origin to targetProjectId.
   * Cleans up any previous project binding and reloads the tab workspace.
   */
  const handleSwitchToProject = async (targetProject: CandidateProject) => {
    try {
      setBusyId(`switch-${targetProject.id}`)
      const res = await projectService.linkOrigin(targetProject.id)
      if (res.ok) {
        onToast?.(`Switched to "${targetProject.name}"! Reloading workspace...`, 'success')
        onClose()
      } else {
        onToast?.(res.error.message || 'Failed to switch project', 'error')
      }
    } finally {
      setBusyId(null)
    }
  }

  /**
   * Disconnects a specific origin from its project.
   * If it's the current tab, reloads as an independent project.
   * If it's another port chip, updates the list in-place without page reload.
   */
  const handleDisconnectOrigin = async (origin: string, isCurrentTab: boolean) => {
    try {
      setBusyId(`unlink-${origin}`)
      const res = await projectService.unlinkOrigin(origin)
      if (res.ok) {
        if (isCurrentTab) {
          onToast?.('Tab disconnected! Reloading as independent workspace...', 'success')
          onClose()
        } else {
          onToast?.(`Disconnected ${origin} from workspace`, 'success')
          await loadProjects()
        }
      } else {
        onToast?.(res.error.message || 'Failed to disconnect origin', 'error')
      }
    } finally {
      setBusyId(null)
    }
  }

  const handleCopyData = async (sourceProject: CandidateProject) => {
    try {
      setBusyId(`copy-${sourceProject.id}`)
      const res = await projectService.copyData(sourceProject.id)
      if (res.ok) {
        onToast?.(`Copied ${res.value} items from "${sourceProject.name}"!`, 'success')
        onClose()
      } else {
        onToast?.(res.error.message || 'Failed to copy project data', 'error')
      }
    } finally {
      setBusyId(null)
    }
  }

  if (!isOpen) return null

  const currentPort = extractPort(currentProject.originUrl)

  const otherProjects = filteredProjects.filter((p) => {
    if (p.id === currentProject.id) return false
    if (p.originUrl === currentProject.originUrl) return false
    if (p.linkedOrigins?.includes(currentProject.originUrl)) return false
    if (
      normalizeLocalOrigin(p.originUrl) === normalizeLocalOrigin(currentProject.originUrl) &&
      extractPort(p.originUrl) === currentPort
    ) {
      return false
    }
    return true
  })

  const activeEntry = projects.find((p) => p.id === currentProject.id)
  const isTabAliased = Boolean(
    activeEntry?.linkedOrigins?.includes(currentProject.originUrl) &&
      activeEntry.originUrl !== currentProject.originUrl,
  )

  // Origins associated with the current project
  const currentAssociatedOrigins = Array.from(
    new Set([
      ...(activeEntry?.originUrl ? [activeEntry.originUrl] : []),
      ...(activeEntry?.linkedOrigins ?? []),
      currentProject.originUrl,
    ]),
  )

  const projectName = activeEntry?.name ?? currentProject.name

  return (
    <Dialog title="Workspaces & Projects" onClose={onClose} size="lg">
      <div className="flex flex-col gap-3.5 p-4 text-xs text-text max-h-[78vh] overflow-y-auto">
        {/* Subtitle / explanation */}
        <p className="text-[11px] text-muted -mt-1 leading-relaxed">
          Manage workspaces and connected Swagger ports or URLs. Switch this Swagger tab to any
          workspace with a single click.
        </p>

        {/* Search input */}
        <div className="relative">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search workspaces by name, port, or host..."
            className="pl-8 h-8 text-xs"
            autoFocus
          />
          <SearchIcon className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted pointer-events-none" />
          {search ? (
            <IconButton
              label="Clear search"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1.5 h-5 w-5 text-muted hover:text-text"
            >
              <CloseIcon className="h-3 w-3" />
            </IconButton>
          ) : null}
        </div>

        {/* Current active workspace card */}
        <div className="flex flex-col gap-2 rounded-lg border-2 border-primary/40 bg-primary/5 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <FolderIcon className="h-4 w-4 text-primary shrink-0" />
              {editingId === currentProject.id ? (
                <div className="flex items-center gap-1.5">
                  <Input
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleSaveRename(currentProject.id)
                      if (e.key === 'Escape') setEditingId(null)
                    }}
                    className="h-6 text-xs w-48"
                    autoFocus
                  />
                  <IconButton
                    label="Save project name"
                    onClick={() => void handleSaveRename(currentProject.id)}
                    disabled={busyId === `rename-${currentProject.id}`}
                    className="h-6 w-6 text-primary hover:bg-primary/10"
                  >
                    <CopiedIcon className="h-3.5 w-3.5" />
                  </IconButton>
                  <IconButton
                    label="Cancel rename"
                    onClick={() => setEditingId(null)}
                    className="h-6 w-6 text-muted hover:bg-surface"
                  >
                    <CloseIcon className="h-3.5 w-3.5" />
                  </IconButton>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-bold text-sm text-text truncate">{projectName}</span>
                  <IconButton
                    label="Rename current project"
                    onClick={() => handleStartRename(currentProject.id, projectName)}
                    className="h-4 w-4 text-muted hover:text-text shrink-0"
                  >
                    <EditIcon className="h-3 w-3" />
                  </IconButton>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Badge kind="success" className="text-[10px] px-2 py-0.5 font-medium">
                Active for this tab
              </Badge>
              {isTabAliased ? (
                <Button
                  variant="ghost"
                  onClick={() => void handleDisconnectOrigin(currentProject.originUrl, true)}
                  disabled={busyId !== null}
                  title="Disconnect this tab from this workspace to create an independent workspace"
                  className="h-6 px-2 text-[10px] text-muted hover:text-rose-500 hover:bg-rose-500/10"
                >
                  {busyId === `unlink-${currentProject.originUrl}` ? (
                    <Spinner className="h-3 w-3" />
                  ) : (
                    'Disconnect Tab'
                  )}
                </Button>
              ) : null}
            </div>
          </div>

          {/* Connected URLs & Ports chips */}
          <div className="flex flex-col gap-1 pt-1">
            <span className="text-[10px] uppercase font-semibold tracking-wider text-muted">
              Connected Ports & URLs ({currentAssociatedOrigins.length}):
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {currentAssociatedOrigins.map((orig) => {
                const isTab = orig === currentProject.originUrl
                const chip = formatOriginChip(orig)
                const isUnlinking = busyId === `unlink-${orig}`

                return (
                  <span
                    key={orig}
                    title={chip.full}
                    className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-mono text-[11px] border transition-colors ${
                      isTab
                        ? 'bg-primary/15 text-primary border-primary/30 font-semibold'
                        : 'bg-surface text-text border-border'
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        isTab ? 'bg-emerald-500 animate-pulse' : 'bg-muted/60'
                      }`}
                    />
                    <span>{chip.label}</span>
                    {isTab ? (
                      <span className="text-[9px] uppercase font-bold text-primary/80">
                        (this tab)
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void handleDisconnectOrigin(orig, false)}
                        disabled={busyId !== null}
                        title={`Disconnect ${chip.label} from this project`}
                        className="text-muted/60 hover:text-rose-500 ml-0.5 transition-colors"
                      >
                        {isUnlinking ? (
                          <Spinner className="h-2.5 w-2.5" />
                        ) : (
                          <CloseIcon className="h-2.5 w-2.5" />
                        )}
                      </button>
                    )}
                  </span>
                )
              })}
            </div>
          </div>

          {/* Stats badges */}
          <div className="flex items-center gap-2 pt-1 border-t border-primary/15 text-[10px] text-muted">
            <span>
              <strong className="text-text">{activeEntry?.presetCount ?? 0}</strong> presets
            </span>
            <span>•</span>
            <span>
              <strong className="text-text">{activeEntry?.variableCount ?? 0}</strong> variables
            </span>
          </div>
        </div>

        {/* Other workspaces list */}
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            All Workspaces ({otherProjects.length})
          </span>

          {loading ? (
            <div className="flex items-center justify-center py-6 text-muted">
              <Spinner className="h-5 w-5" />
            </div>
          ) : otherProjects.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-muted">
              {search
                ? 'No workspaces matching your search.'
                : 'No other workspaces found. Any additional backend ports or Swagger origins you test will appear here.'}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {otherProjects.map((p) => {
                const isEditing = editingId === p.id
                const pOrigins = Array.from(
                  new Set([p.originUrl, ...(p.linkedOrigins ?? [])]),
                )

                return (
                  <div
                    key={p.id}
                    className="flex flex-col gap-2 rounded-lg border border-border/80 bg-surface/40 p-3 hover:bg-surface hover:border-border transition-colors"
                  >
                    {/* Header: Project Name & Data Badges */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <FolderIcon className="h-3.5 w-3.5 text-muted shrink-0" />
                        {isEditing ? (
                          <div className="flex items-center gap-1.5">
                            <Input
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') void handleSaveRename(p.id)
                                if (e.key === 'Escape') setEditingId(null)
                              }}
                              className="h-6 text-xs w-48"
                              autoFocus
                            />
                            <IconButton
                              label="Save"
                              onClick={() => void handleSaveRename(p.id)}
                              className="h-5 w-5 text-primary"
                            >
                              <CopiedIcon className="h-3 w-3" />
                            </IconButton>
                            <IconButton
                              label="Cancel"
                              onClick={() => setEditingId(null)}
                              className="h-5 w-5 text-muted"
                            >
                              <CloseIcon className="h-3 w-3" />
                            </IconButton>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-semibold text-xs text-text truncate max-w-[200px]">
                              {p.name}
                            </span>
                            <IconButton
                              label="Rename project"
                              onClick={() => handleStartRename(p.id, p.name)}
                              className="h-4 w-4 text-muted hover:text-text shrink-0"
                            >
                              <EditIcon className="h-2.5 w-2.5" />
                            </IconButton>
                          </div>
                        )}
                      </div>

                      {/* Presets and variables count */}
                      <div className="flex items-center gap-1.5 shrink-0 text-[10px] text-muted">
                        {p.presetCount ? (
                          <Badge kind="neutral" className="text-[9px] py-0 px-1.5">
                            {p.presetCount} {p.presetCount === 1 ? 'preset' : 'presets'}
                          </Badge>
                        ) : null}
                        {p.variableCount ? (
                          <Badge kind="neutral" className="text-[9px] py-0 px-1.5">
                            {p.variableCount} {p.variableCount === 1 ? 'var' : 'vars'}
                          </Badge>
                        ) : null}
                      </div>
                    </div>

                    {/* Connected URLs/Ports chips for this workspace */}
                    <div className="flex flex-wrap items-center gap-1">
                      {pOrigins.map((orig) => {
                        const chip = formatOriginChip(orig)
                        const isUnlinking = busyId === `unlink-${orig}`
                        const canRemove = pOrigins.length > 1 && orig !== p.originUrl

                        return (
                          <span
                            key={orig}
                            title={chip.full}
                            className="inline-flex items-center gap-1 rounded bg-surface-hover px-1.5 py-0.5 font-mono text-[10px] text-muted border border-border/80"
                          >
                            <span>{chip.label}</span>
                            {canRemove ? (
                              <button
                                type="button"
                                onClick={() => void handleDisconnectOrigin(orig, false)}
                                disabled={busyId !== null}
                                title={`Disconnect ${chip.label}`}
                                className="text-muted/60 hover:text-rose-500 ml-0.5"
                              >
                                {isUnlinking ? (
                                  <Spinner className="h-2.5 w-2.5" />
                                ) : (
                                  <CloseIcon className="h-2 w-2" />
                                )}
                              </button>
                            ) : null}
                          </span>
                        )
                      })}
                    </div>

                    {/* Action buttons footer */}
                    <div className="flex items-center justify-end gap-2 pt-1 border-t border-border/40">
                      <Button
                        variant="primary"
                        onClick={() => void handleSwitchToProject(p)}
                        disabled={busyId !== null}
                        title={`Switch this Swagger tab to the "${p.name}" workspace`}
                        className="h-6 px-2.5 text-[11px] flex items-center gap-1.5 font-medium"
                      >
                        {busyId === `switch-${p.id}` ? (
                          <Spinner className="h-3 w-3" />
                        ) : (
                          <SwapIcon className="h-3.5 w-3.5" />
                        )}
                        <span>Switch to This Project</span>
                      </Button>

                      <Button
                        variant="secondary"
                        onClick={() => void handleCopyData(p)}
                        disabled={busyId !== null}
                        title={`Copy presets and variables from "${p.name}" into current workspace`}
                        className="h-6 px-2 text-[11px] flex items-center gap-1 text-muted hover:text-text"
                      >
                        {busyId === `copy-${p.id}` ? (
                          <Spinner className="h-3 w-3" />
                        ) : (
                          <CopyIcon className="h-3 w-3" />
                        )}
                        <span>Copy Data</span>
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </Dialog>
  )
}

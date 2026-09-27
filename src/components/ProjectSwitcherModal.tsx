import { useState, useEffect, useMemo, useCallback } from 'react'
import type { CandidateProject, ProjectMeta } from '@/core/project/types'
import type { RemoteProjectApi } from '@/sidepanel/bridge'
import {
  Dialog,
  Button,
  IconButton,
  Input,
  Spinner,
  SearchIcon,
  CopyIcon,
  EditIcon,
  CopiedIcon,
  CloseIcon,
  FolderIcon,
  SwapIcon,
  PlusIcon,
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
    <Dialog
      title={
        <div className="flex items-center gap-2.5">
          <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[11px] font-bold tracking-wider text-primary border border-primary/30">
            API
          </span>
          <span className="text-base font-bold text-text tracking-tight">Workspaces</span>
        </div>
      }
      ariaLabel="Workspaces & Projects"
      onClose={onClose}
      size="lg"
      headerClassName="border-b border-border/40 px-5 pt-4 pb-3 bg-transparent"
      contentClassName="p-5 pt-3.5 flex flex-col gap-4 text-xs text-text max-h-[80vh] overflow-y-auto"
    >
      {/* Search input */}
      <div className="relative">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search workspaces"
          className="pl-10 pr-9 h-10 text-sm rounded-xl bg-surface/60 border-border/80 text-text placeholder:text-muted/70 focus:border-primary/50 transition-colors"
          autoFocus
        />
        <SearchIcon className="absolute left-3.5 top-3 h-4 w-4 text-muted pointer-events-none" />
        {search ? (
          <IconButton
            label="Clear search"
            onClick={() => setSearch('')}
            className="absolute right-2.5 top-2.5 h-5 w-5 text-muted hover:text-text"
          >
            <CloseIcon className="h-3 w-3" />
          </IconButton>
        ) : null}
      </div>

      {/* Current active workspace card */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted tracking-tight">active workspace</span>
        <div className="flex flex-col gap-3 rounded-2xl border border-primary/50 bg-primary/[0.06] p-4 transition-colors">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <FolderIcon className="h-5 w-5 text-primary shrink-0" />
              {editingId === currentProject.id ? (
                <div className="flex items-center gap-1.5">
                  <Input
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleSaveRename(currentProject.id)
                      if (e.key === 'Escape') setEditingId(null)
                    }}
                    className="h-7 text-xs w-48 rounded-lg"
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
                  <span className="font-bold text-base text-text truncate">{projectName}</span>
                  <IconButton
                    label="Rename current project"
                    onClick={() => handleStartRename(currentProject.id, projectName)}
                    className="h-4 w-4 text-muted hover:text-text shrink-0"
                  >
                    <EditIcon className="h-3.5 w-3.5" />
                  </IconButton>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-1.5 text-xs text-emerald-500 font-semibold">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>this tab</span>
              </div>
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
                    'Disconnect'
                  )}
                </Button>
              ) : null}
            </div>
          </div>

          {/* Connected URLs & Ports chips */}
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            {currentAssociatedOrigins.map((orig) => {
              const isTab = orig === currentProject.originUrl
              const chip = formatOriginChip(orig)
              const isUnlinking = busyId === `unlink-${orig}`

              return (
                <span
                  key={orig}
                  title={chip.full}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 font-mono text-xs border transition-colors ${
                    isTab
                      ? 'bg-primary/15 text-primary border-primary/40 font-semibold'
                      : 'bg-surface/90 text-muted border-border/80 font-medium'
                  }`}
                >
                  <span>{chip.label}</span>
                  {!isTab ? (
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
                  ) : null}
                </span>
              )
            })}
          </div>

          {/* Stats badges */}
          <div className="text-xs text-muted flex items-center gap-1.5 pt-0.5 font-normal">
            <span>{activeEntry?.presetCount ?? 0} presets</span>
            <span>·</span>
            <span>{activeEntry?.variableCount ?? 0} variables</span>
          </div>
        </div>
      </div>

      {/* Other workspaces list */}
      <div className="flex flex-col gap-1.5 pt-1">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted tracking-tight">
            all workspaces · {otherProjects.length}
          </span>
          <IconButton
            label="Workspaces are auto-created when visiting new Swagger tabs"
            title="Workspaces are auto-created when visiting new Swagger tabs or backends"
            className="h-6 w-6 text-primary hover:text-primary hover:bg-primary/10 rounded-md transition-colors"
            onClick={() => {
              onToast?.(
                'Open any backend or Swagger port in your browser to automatically create a workspace for it!',
                'success',
              )
            }}
          >
            <PlusIcon className="h-4 w-4" />
          </IconButton>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-6 text-muted">
            <Spinner className="h-5 w-5" />
          </div>
        ) : otherProjects.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/80 p-6 text-center text-xs text-muted">
            {search
              ? 'No workspaces matching your search.'
              : 'No other workspaces found. Any additional backend ports or Swagger origins you test will appear here.'}
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {otherProjects.map((p) => {
              const isEditing = editingId === p.id
              const pOrigins = Array.from(new Set([p.originUrl, ...(p.linkedOrigins ?? [])]))

              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 p-3.5 rounded-2xl border border-border/80 bg-surface/30 hover:bg-surface/60 hover:border-border transition-colors shadow-sm"
                >
                  {/* Left: Folder Icon & Name + Ports */}
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    <FolderIcon className="h-5 w-5 text-muted shrink-0" />
                    <div className="flex flex-col gap-0.5 min-w-0">
                      {isEditing ? (
                        <div className="flex items-center gap-1.5">
                          <Input
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void handleSaveRename(p.id)
                              if (e.key === 'Escape') setEditingId(null)
                            }}
                            className="h-7 text-xs w-48 rounded-lg"
                            autoFocus
                          />
                          <IconButton
                            label="Save"
                            onClick={() => void handleSaveRename(p.id)}
                            className="h-6 w-6 text-primary hover:bg-primary/10"
                          >
                            <CopiedIcon className="h-3.5 w-3.5" />
                          </IconButton>
                          <IconButton
                            label="Cancel"
                            onClick={() => setEditingId(null)}
                            className="h-6 w-6 text-muted hover:bg-surface"
                          >
                            <CloseIcon className="h-3.5 w-3.5" />
                          </IconButton>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 min-w-0 group">
                          <span className="font-bold text-sm text-text truncate max-w-[220px]">
                            {p.name}
                          </span>
                          <IconButton
                            label="Rename workspace"
                            onClick={() => handleStartRename(p.id, p.name)}
                            className="h-3.5 w-3.5 text-muted/60 opacity-0 group-hover:opacity-100 hover:text-text shrink-0 transition-opacity"
                          >
                            <EditIcon className="h-2.5 w-2.5" />
                          </IconButton>
                        </div>
                      )}
                      {/* Port list */}
                      <div className="flex items-center gap-2 text-xs font-mono text-muted">
                        {pOrigins.map((orig) => {
                          const chip = formatOriginChip(orig)
                          return <span key={orig}>{chip.label}</span>
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Right: Switch & Copy buttons */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="secondary"
                      onClick={() => void handleSwitchToProject(p)}
                      disabled={busyId !== null}
                      title={`Switch this Swagger tab to "${p.name}"`}
                      className="h-8 px-3.5 text-xs flex items-center gap-2 rounded-xl border border-border/80 bg-surface/70 hover:bg-surface hover:border-border font-semibold text-text shadow-sm transition-colors"
                    >
                      {busyId === `switch-${p.id}` ? (
                        <Spinner className="h-3 w-3" />
                      ) : (
                        <SwapIcon className="h-3.5 w-3.5" />
                      )}
                      <span>Switch</span>
                    </Button>

                    <IconButton
                      label={`Copy data from "${p.name}"`}
                      onClick={() => void handleCopyData(p)}
                      disabled={busyId !== null}
                      title={`Copy presets and variables from "${p.name}" into current workspace`}
                      className="h-8 w-8 rounded-xl border border-border/80 bg-surface/70 hover:bg-surface hover:border-border text-muted hover:text-text flex items-center justify-center shadow-sm transition-colors"
                    >
                      {busyId === `copy-${p.id}` ? (
                        <Spinner className="h-3 w-3" />
                      ) : (
                        <CopyIcon className="h-3.5 w-3.5" />
                      )}
                    </IconButton>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Dialog>
  )
}

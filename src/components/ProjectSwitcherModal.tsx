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
  LinkIcon,
  CopyIcon,
  EditIcon,
  CopiedIcon,
  CloseIcon,
  FolderIcon,
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

  const handleLink = async (targetProjectId: string) => {
    try {
      setBusyId(`link-${targetProjectId}`)
      const res = await projectService.linkOrigin(targetProjectId)
      if (res.ok) {
        onToast?.('Tab linked to project! Refreshing workspace...', 'success')
        onClose()
      } else {
        onToast?.(res.error.message || 'Failed to link project', 'error')
      }
    } finally {
      setBusyId(null)
    }
  }

  const handleUnlink = async () => {
    try {
      setBusyId('unlink')
      const res = await projectService.unlinkOrigin()
      if (res.ok) {
        onToast?.('Origin unlinked! Reloading as independent project...', 'success')
        onClose()
      } else {
        onToast?.(res.error.message || 'Failed to unlink origin', 'error')
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
        onToast?.(`Successfully copied ${res.value} items from "${sourceProject.name}"!`, 'success')
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
  const isLinked = !!activeEntry?.linkedOrigins?.length

  // Origins associated with this project excluding current tab's port
  const allAssociatedOrigins = [
    ...(activeEntry?.originUrl ? [activeEntry.originUrl] : []),
    ...(activeEntry?.linkedOrigins ?? []),
  ]
  const otherLinkedPorts = Array.from(
    new Set(
      allAssociatedOrigins
        .map(extractPort)
        .filter((p): p is string => Boolean(p && p !== currentPort)),
    ),
  )

  const projectName = activeEntry?.name ?? currentProject.name

  return (
    <Dialog title="Switch or Link Projects" onClose={onClose} size="lg">
      <div className="flex flex-col gap-3 p-4 text-xs text-text max-h-[75vh] overflow-y-auto">
        {/* Search input */}
        <div className="relative">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects by name, port, or host..."
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

        {/* Current active project */}
        <div className="flex flex-col gap-1.5 rounded-lg border border-primary/30 bg-primary/5 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 font-semibold text-text">
              <FolderIcon className="h-3.5 w-3.5 text-primary" />
              <span>Current Project</span>
              <Badge kind="success" className="text-[10px] px-1.5 py-0">
                Active
              </Badge>
              {currentPort ? (
                <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] text-primary border border-primary/20 font-medium">
                  :{currentPort}
                </span>
              ) : null}
            </div>
            {isLinked ? (
              <Button
                variant="ghost"
                onClick={handleUnlink}
                disabled={busyId === 'unlink'}
                className="h-5 px-1.5 text-[10px] text-muted hover:text-danger hover:bg-danger/10"
              >
                {busyId === 'unlink' ? <Spinner className="h-3 w-3" /> : 'Unlink Origin'}
              </Button>
            ) : null}
          </div>

          {editingId === currentProject.id ? (
            <div className="flex items-center gap-1.5 pt-0.5">
              <Input
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleSaveRename(currentProject.id)
                  if (e.key === 'Escape') setEditingId(null)
                }}
                className="h-6 text-xs flex-1"
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
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="font-semibold text-xs text-text truncate">{projectName}</span>
                <IconButton
                  label="Rename current project"
                  onClick={() => handleStartRename(currentProject.id, projectName)}
                  className="h-4 w-4 text-muted hover:text-text shrink-0"
                >
                  <EditIcon className="h-2.5 w-2.5" />
                </IconButton>
              </div>

              {otherLinkedPorts.length > 0 ? (
                <div className="flex items-center gap-1 text-[10px] text-muted shrink-0">
                  <span>Also linked:</span>
                  {otherLinkedPorts.map((p) => (
                    <span
                      key={p}
                      className="rounded bg-surface px-1 py-0.2 font-mono text-[9px] text-text border border-border"
                    >
                      :{p}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* Other projects list */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            All Saved Projects ({otherProjects.length})
          </span>

          {loading ? (
            <div className="flex items-center justify-center py-6 text-muted">
              <Spinner className="h-5 w-5" />
            </div>
          ) : otherProjects.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-muted">
              {search
                ? 'No projects matching your search.'
                : 'No other projects found. As you connect other Swagger pages or backend ports, they will appear here.'}
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {otherProjects.map((p) => {
                const isEditing = editingId === p.id
                const port = extractPort(p.originUrl)
                let host = ''
                try {
                  host = new URL(p.originUrl).host
                } catch {
                  // ignore
                }
                const isCustomName =
                  Boolean(host) &&
                  p.name !== host &&
                  p.name !== p.originUrl &&
                  !p.originUrl.endsWith(p.name)

                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-surface/40 px-2.5 py-2 hover:bg-surface hover:border-border transition-colors"
                  >
                    {/* Left: Project Info */}
                    <div className="flex flex-col min-w-0 flex-1">
                      {isEditing ? (
                        <div className="flex items-center gap-1.5">
                          <Input
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void handleSaveRename(p.id)
                              if (e.key === 'Escape') setEditingId(null)
                            }}
                            className="h-6 text-xs flex-1"
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
                        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                          <span className="font-semibold text-xs text-text truncate max-w-[160px]">
                            {p.name}
                          </span>
                          <IconButton
                            label="Rename project"
                            onClick={() => handleStartRename(p.id, p.name)}
                            className="h-4 w-4 text-muted hover:text-text shrink-0"
                          >
                            <EditIcon className="h-2.5 w-2.5" />
                          </IconButton>

                          {port ? (
                            <span className="rounded bg-surface-hover px-1.5 py-0.2 font-mono text-[10px] text-muted border border-border shrink-0">
                              :{port}
                            </span>
                          ) : null}

                          {p.presetCount ? (
                            <Badge kind="neutral" className="text-[9px] py-0 px-1">
                              {p.presetCount} {p.presetCount === 1 ? 'preset' : 'presets'}
                            </Badge>
                          ) : null}
                          {p.variableCount ? (
                            <Badge kind="neutral" className="text-[9px] py-0 px-1">
                              {p.variableCount} {p.variableCount === 1 ? 'var' : 'vars'}
                            </Badge>
                          ) : null}
                        </div>
                      )}

                      {isCustomName && !isEditing ? (
                        <span className="font-mono text-[10px] text-muted truncate mt-0.5">
                          {p.originUrl}
                        </span>
                      ) : null}
                    </div>

                    {/* Right: Inline Actions */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        variant="secondary"
                        onClick={() => void handleLink(p.id)}
                        disabled={busyId !== null}
                        className="h-6 px-2 text-[11px] flex items-center gap-1 hover:border-primary/60 hover:text-primary"
                      >
                        {busyId === `link-${p.id}` ? (
                          <Spinner className="h-3 w-3" />
                        ) : (
                          <LinkIcon className="h-3 w-3" />
                        )}
                        <span>Link</span>
                      </Button>

                      <Button
                        variant="ghost"
                        onClick={() => void handleCopyData(p)}
                        disabled={busyId !== null}
                        className="h-6 px-2 text-[11px] flex items-center gap-1 text-muted hover:text-text hover:bg-surface-hover"
                      >
                        {busyId === `copy-${p.id}` ? (
                          <Spinner className="h-3 w-3" />
                        ) : (
                          <CopyIcon className="h-3 w-3" />
                        )}
                        <span>Copy</span>
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

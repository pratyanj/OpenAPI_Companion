import { useCallback, useEffect, useMemo, useState } from 'react'
import type { EventBus } from '@/core/events'
import { useEventBus } from '@/hooks'
import {
  Button,
  CopyButton,
  EmptyState,
  IconButton,
  Input,
  Spinner,
  RequestsIcon,
  DeleteIcon,
  EditIcon,
  LocateIcon,
  ReplayIcon,
  SearchIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  PlusIcon,
  ZapIcon,
  CloseIcon,
} from '@/components'
import type { EndpointInfo } from '@/adapters'
import { substitute, type EnvironmentPanelService } from '@/modules/environment'
import {
  METHODS,
  type RequestPanelService,
  type RequestTemplate,
  type MethodFilter,
  type PresetEditorOpenOptions,
} from './types'
import { MethodTag } from './EndpointPicker'
import { PresetEditorModal } from './PresetEditorModal'

export interface RequestsPanelProps {
  service: RequestPanelService
  bus: EventBus
  environmentId: string
  environmentService?: EnvironmentPanelService
  onOpenPresetEditor?: (options?: PresetEditorOpenOptions) => void
}

function formatJsonSafe(raw: string | undefined): string {
  if (!raw || !raw.trim()) return ''
  try {
    const parsed = JSON.parse(raw)
    return JSON.stringify(parsed, null, 2)
  } catch {
    return raw
  }
}

function formatDate(timestamp: number): string {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const METHOD_BORDER_COLORS: Record<string, string> = {
  get: 'border-l-[#61affe]',
  post: 'border-l-[#49cc90]',
  put: 'border-l-[#fca130]',
  delete: 'border-l-[#f93e3e]',
  patch: 'border-l-[#50e3c2]',
}

export function RequestsPanel({
  service,
  bus,
  environmentId,
  environmentService,
  onOpenPresetEditor,
}: RequestsPanelProps) {
  const [templates, setTemplates] = useState<RequestTemplate[]>([])
  const [loading, setLoading] = useState(true)

  // Project variables state for live autocomplete and preview
  const [projectVars, setProjectVars] = useState<Record<string, string>>({})
  const [previewIds, setPreviewIds] = useState<Set<string>>(new Set())

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [methodFilter, setMethodFilter] = useState<MethodFilter>('ALL')

  // Expanded preset IDs
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  // Quick Capture from Swagger state
  const [isCapturing, setIsCapturing] = useState(false)
  const [captureName, setCaptureName] = useState('')
  const [captureHint, setCaptureHint] = useState<string | null>(null)

  // Custom Preset Modal state (for local / fallback editing)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<RequestTemplate | null>(null)

  const loadVariables = useCallback(async () => {
    if (!environmentService) return
    const [listRes, activeRes] = await Promise.all([
      environmentService.list(),
      environmentService.getActiveId(),
    ])
    if (listRes.ok) {
      const target = listRes.value.find((e) => e.id === activeRes) || listRes.value[0]
      if (target) {
        setProjectVars(target.variables ?? {})
      }
    }
  }, [environmentService])

  const load = useCallback(async () => {
    const result = await service.listTemplates()
    setTemplates(result.ok ? result.value : [])
    setLoading(false)
  }, [service])

  useEffect(() => {
    setLoading(true)
    void load()
    void loadVariables()
  }, [load, loadVariables])

  useEventBus(bus, 'TEMPLATE_SAVED', () => void load())
  useEventBus(bus, 'TEMPLATE_DELETED', () => void load())
  useEventBus(bus, 'ENVIRONMENT_CHANGED', () => void loadVariables())

  const togglePreview = (templateId: string) => {
    setPreviewIds((prev) => {
      const next = new Set(prev)
      if (next.has(templateId)) {
        next.delete(templateId)
      } else {
        next.add(templateId)
      }
      return next
    })
  }

  // Available endpoints from Swagger spec
  const availableEndpoints = useMemo<EndpointInfo[]>(() => {
    try {
      return service.listEndpoints() || []
    } catch {
      return []
    }
  }, [service])

  // Open requests from Swagger
  const openRequests = useMemo(() => {
    try {
      return service.getOpenRequests() || []
    } catch {
      return []
    }
  }, [service])

  const activeOpenWithBody = openRequests.find((r) => r.body != null && r.body.trim() !== '')

  // Filtered templates
  const filteredTemplates = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return templates.filter((t) => {
      // Method filter
      if (methodFilter !== 'ALL') {
        const method = (t.method || t.endpointId.split(' ')[0] || '').toUpperCase()
        if (method !== methodFilter) return false
      }
      // Text search
      if (!query) return true
      const matchesName = t.name.toLowerCase().includes(query)
      const matchesEndpoint = t.endpointId.toLowerCase().includes(query)
      const matchesBody = t.body ? t.body.toLowerCase().includes(query) : false
      return matchesName || matchesEndpoint || matchesBody
    })
  }, [templates, searchQuery, methodFilter])

  const toggleExpand = (templateId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(templateId)) {
        next.delete(templateId)
      } else {
        next.add(templateId)
      }
      return next
    })
  }

  // --- Actions ---

  const handleApply = async (templateId: string) => {
    const result = await service.applyTemplate(templateId)
    if (!result.ok) {
      bus.publish('NOTIFY', { kind: 'error', message: result.error.message })
    } else {
      bus.publish('NOTIFY', { kind: 'success', message: 'Request preset applied and executed!' })
    }
  }

  const handleLocateAndFill = async (templateId: string) => {
    const result = await service.locateAndFill(templateId)
    if (!result.ok) {
      bus.publish('NOTIFY', { kind: 'error', message: result.error.message })
    } else {
      bus.publish('NOTIFY', {
        kind: 'success',
        message: 'Located endpoint and filled request body.',
      })
    }
  }

  const handleDelete = async (template: RequestTemplate) => {
    const result = await service.deleteTemplate(template.templateId)
    if (!result.ok) {
      bus.publish('NOTIFY', { kind: 'error', message: result.error.message })
    } else {
      bus.publish('NOTIFY', { kind: 'success', message: `Deleted preset "${template.name}".` })
    }
  }

  // --- Quick Capture from Swagger ---

  const handleSaveCapture = async () => {
    const trimmed = captureName.trim()
    if (!trimmed) return
    const result = await service.saveOpenAsTemplate(trimmed, environmentId)
    if (result.ok && result.value === null) {
      setCaptureHint('Open a request and enter a body in Swagger first.')
      return
    }
    if (!result.ok) {
      bus.publish('NOTIFY', { kind: 'error', message: result.error.message })
      return
    }
    setCaptureName('')
    setCaptureHint(null)
    setIsCapturing(false)
    bus.publish('NOTIFY', { kind: 'success', message: `Preset "${trimmed}" saved from Swagger!` })
  }

  // --- Create Custom Preset ---

  const openCreateDialog = () => {
    if (onOpenPresetEditor) {
      onOpenPresetEditor({ initialEndpointId: availableEndpoints[0]?.endpointId })
      return
    }
    setIsCreateOpen(true)
  }

  // --- Edit Preset ---

  const openEditDialog = (template: RequestTemplate) => {
    if (onOpenPresetEditor) {
      onOpenPresetEditor({ template })
      return
    }
    setEditingTemplate(template)
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* ── Top Header Action Buttons ── */}
      <div className="flex items-center gap-2">
        <Button
          variant="primary"
          className="flex flex-1 items-center justify-center gap-1.5 text-xs py-1.5"
          onClick={openCreateDialog}
        >
          <PlusIcon className="h-3.5 w-3.5" />
          <span>New preset</span>
        </Button>

        <Button
          variant="secondary"
          className="flex flex-1 items-center justify-center gap-1.5 text-xs py-1.5"
          onClick={() => {
            setIsCapturing(!isCapturing)
            setCaptureHint(null)
          }}
        >
          <ZapIcon className="h-3.5 w-3.5 text-amber-500" />
          <span>Capture open</span>
        </Button>
      </div>

      {/* ── Quick Capture from Swagger Banner ── */}
      {isCapturing && (
        <div className="flex flex-col gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-text">
              <ZapIcon className="h-3.5 w-3.5 text-amber-500" />
              <span>Capture Live Request Body</span>
            </div>
            <button
              type="button"
              className="text-[11px] text-muted hover:text-text hover:underline"
              onClick={() => {
                setIsCapturing(false)
                setCaptureName('')
                setCaptureHint(null)
              }}
            >
              Cancel
            </button>
          </div>

          {activeOpenWithBody ? (
            <p className="text-[11px] text-muted">
              Found open payload for{' '}
              <span className="font-mono font-medium text-text">
                {activeOpenWithBody.endpointId}
              </span>
            </p>
          ) : (
            <p className="text-[11px] text-muted">
              Captures the request body from whichever Swagger operation is currently open.
            </p>
          )}

          <div className="flex gap-2 mt-1">
            <Input
              id="oac-capture-name"
              autoFocus
              value={captureName}
              onChange={(e) => setCaptureName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSaveCapture()
              }}
              placeholder="Preset name (e.g. Admin Payload)…"
              className="flex-1 text-xs"
            />
            <Button
              variant="primary"
              onClick={() => void handleSaveCapture()}
              disabled={!captureName.trim()}
            >
              Save
            </Button>
          </div>
          {captureHint ? <p className="text-xs text-warning">{captureHint}</p> : null}
        </div>
      )}

      {/* ── Search & Filter Bar ── */}
      <div className="flex flex-col gap-2">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search presets by name, path, or payload…"
            className="w-full rounded-md border border-border bg-bg pl-8 pr-8 py-1.5 text-xs text-text placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
          {searchQuery ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-2 text-muted hover:text-text"
            >
              <CloseIcon className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>

        {/* Method filter pills */}
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-none">
          {METHODS.map((method) => {
            const active = methodFilter === method
            return (
              <button
                key={method}
                type="button"
                onClick={() => setMethodFilter(method)}
                className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-surface/50 text-muted hover:bg-surface hover:text-text'
                }`}
              >
                {method}
              </button>
            )
          })}
        </div>
      </div>

      <hr className="border-border" />

      {/* ── Preset Cards List ── */}
      {loading ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : filteredTemplates.length === 0 ? (
        <EmptyState
          icon={<RequestsIcon className="h-8 w-8 text-muted" />}
          title={templates.length === 0 ? 'No request presets yet' : 'No matching presets'}
          message={
            templates.length === 0
              ? 'Save a custom preset or capture from Swagger to quickly test API scenarios.'
              : 'Try clearing your search or method filter.'
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {filteredTemplates.map((t) => {
            const isExpanded = expandedIds.has(t.templateId)
            const [method = 'get', path = t.endpointId] = t.endpointId.split(' ')
            const formattedBody = formatJsonSafe(t.body)

            return (
              <div
                key={t.templateId}
                className={`flex flex-col rounded-lg border border-border border-l-4 ${
                  METHOD_BORDER_COLORS[method.toLowerCase()] || 'border-l-primary'
                } bg-surface/30 transition-all hover:border-muted hover:shadow-sm`}
              >
                {/* ── Card Header ── */}
                <div
                  className="flex cursor-pointer items-center justify-between gap-2 p-2.5 select-none"
                  onClick={() => toggleExpand(t.templateId)}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-muted hover:text-text">
                      {isExpanded ? (
                        <ChevronDownIcon className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRightIcon className="h-3.5 w-3.5" />
                      )}
                    </span>
                    <MethodTag method={method.toUpperCase()} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-semibold text-text">{t.name}</div>
                      <div className="truncate font-mono text-[11px] text-muted">{path}</div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <IconButton
                      label={`Apply and execute ${t.name}`}
                      onClick={() => void handleApply(t.templateId)}
                      className="text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-400"
                    >
                      <ReplayIcon className="h-3.5 w-3.5" />
                    </IconButton>

                    <IconButton
                      label={`Locate in Swagger ${t.name}`}
                      onClick={() => void handleLocateAndFill(t.templateId)}
                      className="text-sky-500 hover:bg-sky-500/10 hover:text-sky-400"
                    >
                      <LocateIcon className="h-3.5 w-3.5" />
                    </IconButton>

                    <IconButton label={`Edit ${t.name}`} onClick={() => openEditDialog(t)}>
                      <EditIcon className="h-3.5 w-3.5" />
                    </IconButton>

                    <IconButton
                      label={`Delete ${t.name}`}
                      onClick={() => void handleDelete(t)}
                      className="text-muted hover:text-destructive"
                    >
                      <DeleteIcon className="h-3.5 w-3.5" />
                    </IconButton>
                  </div>
                </div>

                {/* ── Card Expanded Details ── */}
                {isExpanded && (
                  <div className="flex flex-col gap-2.5 border-t border-border bg-bg/40 p-3 text-xs animate-in fade-in duration-150">
                    {/* JSON Body Section */}
                    {t.body ? (() => {
                      const isPreview = previewIds.has(t.templateId)
                      const { text: resolvedText, missing } = substitute(t.body, projectVars)
                      const displayBody = isPreview ? formatJsonSafe(resolvedText) : formattedBody
                      return (
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">
                              Request Body (JSON)
                            </span>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => togglePreview(t.templateId)}
                                className={`rounded px-2 py-0.5 text-[10px] font-medium transition ${
                                  isPreview
                                    ? 'bg-primary text-primary-contrast font-semibold'
                                    : 'border border-border bg-surface text-muted hover:text-text'
                                }`}
                              >
                                {isPreview ? 'Show template' : 'Preview resolved'}
                              </button>
                              <CopyButton text={isPreview ? resolvedText : t.body} label="Copy payload" />
                            </div>
                          </div>
                          {isPreview && missing.length > 0 ? (
                            <div className="rounded border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-500 flex items-center gap-1.5">
                              <span>⚠️ Missing in project variables:</span>
                              <span className="font-mono font-medium">{missing.map((m) => `{{${m}}}`).join(', ')}</span>
                            </div>
                          ) : null}
                          <pre className="max-h-48 overflow-auto rounded-md border border-border bg-bg/90 p-2.5 font-mono text-[11px] text-text leading-relaxed select-text">
                            <code>{displayBody}</code>
                          </pre>
                        </div>
                      )
                    })() : (
                      <div className="rounded-md border border-dashed border-border p-2.5 text-center text-[11px] text-muted italic">
                        No request body payload stored for this preset.
                      </div>
                    )}

                    {/* Headers & Query parameters (if present) */}
                    {t.headers && Object.keys(t.headers).length > 0 && (
                      <div className="flex flex-col gap-1">
                        <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">
                          Custom Headers
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(t.headers).map(([k, v]) => (
                            <span
                              key={k}
                              className="rounded bg-surface px-1.5 py-0.5 font-mono text-[10px] text-muted border border-border"
                            >
                              <strong className="text-text">{k}:</strong> {v}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Metadata Footer */}
                    <div className="flex items-center justify-between pt-1 text-[10px] text-muted">
                      <span>
                        Environment: <strong className="text-text">{t.environmentId}</strong>
                      </span>
                      {t.updatedAt ? <span>Saved: {formatDate(t.updatedAt)}</span> : null}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Create Custom Preset Dialog (Local / Fallback) ── */}
      {isCreateOpen && (
        <PresetEditorModal
          service={service}
          environmentService={environmentService}
          bus={bus}
          environmentId={environmentId}
          initialEndpointId={availableEndpoints[0]?.endpointId}
          onClose={() => setIsCreateOpen(false)}
          onSaved={() => void load()}
        />
      )}

      {/* ── Edit Preset Dialog (Local / Fallback) ── */}
      {editingTemplate !== null && (
        <PresetEditorModal
          service={service}
          environmentService={environmentService}
          bus={bus}
          environmentId={environmentId}
          template={editingTemplate}
          onClose={() => setEditingTemplate(null)}
          onSaved={() => void load()}
        />
      )}
    </div>
  )
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { EventBus } from '@/core/events'
import { useEventBus } from '@/hooks'
import {
  Button,
  CopyButton,
  Dialog,
  EmptyState,
  IconButton,
  Input,
  Spinner,
  VariableTextarea,
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
  CopiedIcon,
} from '@/components'
import type { EndpointInfo } from '@/adapters'
import { substitute, type EnvironmentPanelService } from '@/modules/environment'
import type { RequestPanelService, RequestTemplate } from './types'

interface RequestsPanelProps {
  service: RequestPanelService
  bus: EventBus
  environmentId: string
  environmentService?: EnvironmentPanelService
}

const METHODS = ['ALL', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const
type MethodFilter = (typeof METHODS)[number]

const METHOD_STYLES: Record<string, { bg: string; text: string }> = {
  get: { bg: 'bg-[#61affe]/15', text: 'text-[#61affe]' },
  post: { bg: 'bg-[#49cc90]/15', text: 'text-[#49cc90]' },
  put: { bg: 'bg-[#fca130]/15', text: 'text-[#fca130]' },
  delete: { bg: 'bg-[#f93e3e]/15', text: 'text-[#f93e3e]' },
  patch: { bg: 'bg-[#50e3c2]/15', text: 'text-[#50e3c2]' },
}

function MethodTag({ method }: { method: string }) {
  const m = method.toLowerCase()
  const style = METHOD_STYLES[m] ?? { bg: 'bg-surface', text: 'text-muted' }
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase ${style.bg} ${style.text}`}
    >
      {method}
    </span>
  )
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

// ── Searchable Endpoint Picker Component ──
interface EndpointPickerProps {
  endpoints: EndpointInfo[]
  selectedEndpointId: string
  onSelect: (endpointId: string) => void
  disabled?: boolean
}

function EndpointPicker({
  endpoints,
  selectedEndpointId,
  onSelect,
  disabled = false,
}: EndpointPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [methodFilter, setMethodFilter] = useState<MethodFilter>('ALL')
  const dropdownRef = useRef<HTMLDivElement>(null)

  const selectedEndpoint = useMemo(
    () => endpoints.find((ep) => ep.endpointId === selectedEndpointId),
    [endpoints, selectedEndpointId],
  )

  const filteredEndpoints = useMemo(() => {
    const q = query.trim().toLowerCase()
    return endpoints.filter((ep) => {
      if (methodFilter !== 'ALL' && ep.method.toUpperCase() !== methodFilter) {
        return false
      }
      if (!q) return true
      const matchesMethod = ep.method.toLowerCase().includes(q)
      const matchesPath = ep.path.toLowerCase().includes(q)
      const matchesSummary = (ep.summary || '').toLowerCase().includes(q)
      return matchesMethod || matchesPath || matchesSummary
    })
  }, [endpoints, query, methodFilter])

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  return (
    <div className="relative flex flex-col gap-1" ref={dropdownRef}>
      {/* ── Trigger Box ── */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-bg px-2.5 py-2 text-left text-xs transition hover:border-border/80 hover:bg-surface/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
      >
        {selectedEndpoint ? (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <MethodTag method={selectedEndpoint.method} />
            <span className="truncate font-mono font-medium text-text">
              {selectedEndpoint.path}
            </span>
            {selectedEndpoint.summary && (
              <span className="truncate text-muted">— {selectedEndpoint.summary}</span>
            )}
          </div>
        ) : (
          <span className="text-muted">Select an API endpoint…</span>
        )}
        <ChevronDownIcon
          className={`h-4 w-4 shrink-0 text-muted transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* ── Custom Searchable Popover Dropdown (Fully Opaque) ── */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 flex max-h-64 flex-col rounded-lg border border-border bg-surface shadow-2xl animate-in fade-in zoom-in-95 duration-150">
          {/* Search Header */}
          <div className="flex flex-col gap-1.5 border-b border-border p-2 bg-surface">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted" />
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by path, method, or summary…"
                className="w-full rounded-md border border-border bg-bg pl-8 pr-7 py-1.5 text-xs text-text placeholder:text-muted focus:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-2 top-2 text-muted hover:text-text"
                >
                  <CloseIcon className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Quick Method Filters */}
            <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-none">
              {METHODS.map((m) => {
                const active = methodFilter === m
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMethodFilter(m)}
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors ${
                      active
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-bg text-muted hover:bg-surface hover:text-text border border-border'
                    }`}
                  >
                    {m}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Endpoints List */}
          <div className="flex flex-col gap-1.5 overflow-y-auto p-2 max-h-56 bg-surface">
            {filteredEndpoints.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted">
                {endpoints.length === 0
                  ? 'No endpoints detected on this page.'
                  : 'No matching endpoints.'}
              </div>
            ) : (
              filteredEndpoints.map((ep) => {
                const isSelected = ep.endpointId === selectedEndpointId
                return (
                  <div
                    key={ep.endpointId}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      onSelect(ep.endpointId)
                      setIsOpen(false)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        onSelect(ep.endpointId)
                        setIsOpen(false)
                      }
                    }}
                    className={`group flex flex-col gap-1 rounded-md border p-2 text-xs transition cursor-pointer select-none ${
                      isSelected
                        ? 'border-primary bg-primary/10 shadow-sm'
                        : 'border-border bg-bg hover:border-muted hover:bg-surface/80'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <MethodTag method={ep.method} />
                        <span className="font-mono text-[11px] font-medium text-text break-all">
                          {ep.path}
                        </span>
                      </div>
                      {isSelected && (
                        <span className="shrink-0 flex items-center gap-1 text-[10px] font-semibold text-primary">
                          <CopiedIcon className="h-3 w-3" />
                        </span>
                      )}
                    </div>
                    {ep.summary ? (
                      <div className="text-[11px] text-muted pl-0.5 group-hover:text-text/90">
                        {ep.summary}
                      </div>
                    ) : null}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function RequestsPanel({
  service,
  bus,
  environmentId,
  environmentService,
}: RequestsPanelProps) {
  const [templates, setTemplates] = useState<RequestTemplate[]>([])
  const [loading, setLoading] = useState(true)

  // Project variables state for live autocomplete and preview
  const [projectVars, setProjectVars] = useState<Record<string, string>>({})
  const [projectSecrets, setProjectSecrets] = useState<string[]>([])
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

  // Custom Preset Create Modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createEndpointId, setCreateEndpointId] = useState('')
  const [createBody, setCreateBody] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)

  // Edit Preset Modal state
  const [editingTemplate, setEditingTemplate] = useState<RequestTemplate | null>(null)
  const [editName, setEditName] = useState('')
  const [editBody, setEditBody] = useState('')
  const [editError, setEditError] = useState<string | null>(null)

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
        setProjectSecrets(target.secrets ?? [])
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
    setIsCreateOpen(true)
    setCreateName('')
    setCreateError(null)
    const initialEndpoint = availableEndpoints[0]?.endpointId || ''
    setCreateEndpointId(initialEndpoint)
    setCreateBody('{\n  \n}')
  }

  const handleFormatCreateBody = () => {
    try {
      if (!createBody.trim()) return
      const parsed = JSON.parse(createBody)
      setCreateBody(JSON.stringify(parsed, null, 2))
      setCreateError(null)
    } catch {
      setCreateError('Invalid JSON format. Please check syntax.')
    }
  }

  const handleSaveCreate = async () => {
    const trimmedName = createName.trim()
    if (!trimmedName) {
      setCreateError('Preset name is required.')
      return
    }
    if (!createEndpointId) {
      setCreateError('Please select an endpoint.')
      return
    }

    const [method = 'get'] = createEndpointId.split(' ')
    const supportsBody = ['post', 'put', 'patch'].includes(method.toLowerCase())

    const trimmedBody = supportsBody ? createBody.trim() : ''
    if (supportsBody && trimmedBody) {
      try {
        JSON.parse(trimmedBody)
      } catch {
        setCreateError('Invalid JSON body. Please fix or format JSON before saving.')
        return
      }
    }

    const result = await service.createCustomTemplate({
      name: trimmedName,
      endpointId: createEndpointId,
      method: method.toLowerCase(),
      environmentId,
      body: supportsBody && trimmedBody ? trimmedBody : undefined,
    })

    if (!result.ok) {
      setCreateError(result.error.message)
      return
    }

    setIsCreateOpen(false)
    setCreateName('')
    setCreateBody('')
    setCreateError(null)
    bus.publish('NOTIFY', {
      kind: 'success',
      message: `Preset "${trimmedName}" created successfully!`,
    })
  }

  // --- Edit Preset ---

  const openEditDialog = (template: RequestTemplate) => {
    setEditingTemplate(template)
    setEditName(template.name)
    setEditBody(formatJsonSafe(template.body))
    setEditError(null)
  }

  const handleFormatEditBody = () => {
    try {
      if (!editBody.trim()) return
      const parsed = JSON.parse(editBody)
      setEditBody(JSON.stringify(parsed, null, 2))
      setEditError(null)
    } catch {
      setEditError('Invalid JSON format. Please check syntax.')
    }
  }

  const handleSaveEdit = async () => {
    if (!editingTemplate) return
    const trimmedName = editName.trim()
    if (!trimmedName) {
      setEditError('Preset name cannot be empty.')
      return
    }

    const editMethod = (
      editingTemplate.method ||
      editingTemplate.endpointId.split(' ')[0] ||
      'get'
    ).toLowerCase()
    const supportsBody = ['post', 'put', 'patch'].includes(editMethod)

    const trimmedBody = supportsBody ? editBody.trim() : ''
    if (supportsBody && trimmedBody) {
      try {
        JSON.parse(trimmedBody)
      } catch {
        setEditError('Invalid JSON body. Please fix syntax before saving.')
        return
      }
    }

    const result = await service.updateTemplate(editingTemplate.templateId, {
      name: trimmedName,
      body: supportsBody && trimmedBody ? trimmedBody : undefined,
    })

    if (!result.ok) {
      setEditError(result.error.message)
      return
    }

    setEditingTemplate(null)
    bus.publish('NOTIFY', { kind: 'success', message: `Preset "${trimmedName}" updated!` })
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
                className="flex flex-col rounded-lg border border-border bg-surface/30 transition-all hover:border-muted"
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

      {/* ── Create Custom Preset Dialog ── */}
      {isCreateOpen && (
        <Dialog onClose={() => setIsCreateOpen(false)} title="Create Request Preset">
          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted">
              Create a custom reusable request preset for any endpoint in this API.
            </p>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-text" htmlFor="create-tpl-name">
                Preset Name <span className="text-destructive">*</span>
              </label>
              <Input
                id="create-tpl-name"
                value={createName}
                onChange={(e) => {
                  setCreateName(e.target.value)
                  setCreateError(null)
                }}
                placeholder="e.g. Valid Admin User, Empty Name 400..."
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-text">
                Target Endpoint <span className="text-destructive">*</span>
              </span>
              <EndpointPicker
                endpoints={availableEndpoints}
                selectedEndpointId={createEndpointId}
                onSelect={(id) => {
                  setCreateEndpointId(id)
                  setCreateError(null)
                }}
              />
            </div>

            {/* JSON Body (Only for POST, PUT, PATCH) */}
            {(() => {
              const [createMethod = 'get'] = createEndpointId.split(' ')
              const createSupportsBody = ['post', 'put', 'patch'].includes(
                createMethod.toLowerCase(),
              )

              if (!createSupportsBody) {
                return (
                  <div className="rounded-md border border-border bg-surface p-2.5 text-center text-xs text-muted">
                    <span className="font-semibold uppercase text-text">{createMethod}</span>{' '}
                    requests do not require a request body.
                  </div>
                )
              }

              return (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-text" htmlFor="create-tpl-body">
                      JSON Request Body
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-6 text-[11px] px-1.5 text-muted hover:text-text"
                      onClick={handleFormatCreateBody}
                    >
                      {'{ } Format JSON'}
                    </Button>
                  </div>
                  <VariableTextarea
                    id="create-tpl-body"
                    rows={6}
                    value={createBody}
                    onChange={(e) => {
                      setCreateBody(e.target.value)
                      setCreateError(null)
                    }}
                    projectVariables={projectVars}
                    projectSecrets={projectSecrets}
                    placeholder={'{\n  "name": "example"\n}'}
                    className="w-full rounded-md border border-border bg-bg p-2 font-mono text-xs text-text placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary leading-relaxed"
                  />
                </div>
              )
            })()}

            {createError ? <p className="text-xs text-destructive">{createError}</p> : null}

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="secondary" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => void handleSaveCreate()}>
                Create Preset
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {/* ── Edit Preset Dialog ── */}
      {editingTemplate !== null && (
        <Dialog onClose={() => setEditingTemplate(null)} title="Edit Request Preset">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-text" htmlFor="edit-tpl-name">
                Preset Name <span className="text-destructive">*</span>
              </label>
              <Input
                id="edit-tpl-name"
                value={editName}
                onChange={(e) => {
                  setEditName(e.target.value)
                  setEditError(null)
                }}
                placeholder="Preset Name..."
              />
            </div>

            {editingTemplate && (
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-text">Endpoint</span>
                <div className="rounded border border-border bg-surface/50 px-2.5 py-1.5 font-mono text-xs text-muted">
                  {editingTemplate.endpointId}
                </div>
              </div>
            )}

            {/* JSON Body (Only for POST, PUT, PATCH) */}
            {(() => {
              const editMethod = (
                editingTemplate?.method ||
                editingTemplate?.endpointId.split(' ')[0] ||
                'get'
              ).toLowerCase()
              const editSupportsBody = ['post', 'put', 'patch'].includes(editMethod)

              if (!editSupportsBody) {
                return (
                  <div className="rounded-md border border-border bg-surface p-2.5 text-center text-xs text-muted">
                    <span className="font-semibold uppercase text-text">{editMethod}</span> requests
                    do not require a request body.
                  </div>
                )
              }

              return (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-text" htmlFor="edit-tpl-body">
                      JSON Request Body
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-6 text-[11px] px-1.5 text-muted hover:text-text"
                      onClick={handleFormatEditBody}
                    >
                      {'{ } Format JSON'}
                    </Button>
                  </div>
                  <VariableTextarea
                    id="edit-tpl-body"
                    rows={6}
                    value={editBody}
                    onChange={(e) => {
                      setEditBody(e.target.value)
                      setEditError(null)
                    }}
                    projectVariables={projectVars}
                    projectSecrets={projectSecrets}
                    placeholder={'{\n  \n}'}
                    className="w-full rounded-md border border-border bg-bg p-2 font-mono text-xs text-text placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary leading-relaxed"
                  />
                </div>
              )
            })()}

            {editError ? <p className="text-xs text-destructive">{editError}</p> : null}

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="secondary" onClick={() => setEditingTemplate(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => void handleSaveEdit()}>
                Save Changes
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  )
}

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Dialog,
  Input,
  Button,
  IconButton,
  Badge,
  VariableTextarea,
  EyeIcon,
  Spinner,
  PlusIcon,
  DeleteIcon,
  ZapIcon,
} from '@/components'
import type { EventBus } from '@/core/events'
import { substitute, type EnvironmentPanelService } from '@/modules/environment'
import type { RequestPanelService, RequestTemplate } from './types'
import { EndpointPicker } from './EndpointPicker'
import { validateJsonWithVariables, extractPathParams } from './json-utils'

export interface PresetEditorModalProps {
  service: RequestPanelService
  environmentService?: EnvironmentPanelService
  bus?: EventBus
  environmentId: string
  template?: RequestTemplate | null
  initialEndpointId?: string
  initialBody?: string
  initialName?: string
  initialPath?: Record<string, string>
  initialQuery?: Record<string, string>
  onClose: () => void
  onSaved?: (saved: RequestTemplate) => void
}

interface QueryParamRow {
  id: string
  key: string
  value: string
}

function formatJsonSafe(raw: string): { formatted: string; isValid: boolean } {
  if (!raw.trim()) return { formatted: '', isValid: true }
  try {
    const parsed = JSON.parse(raw)
    return { formatted: JSON.stringify(parsed, null, 2), isValid: true }
  } catch {
    return { formatted: raw, isValid: false }
  }
}

export function PresetEditorModal({
  service,
  environmentService,
  bus,
  environmentId,
  template,
  initialEndpointId,
  initialBody,
  initialName,
  initialPath,
  initialQuery,
  onClose,
  onSaved,
}: PresetEditorModalProps) {
  const endpoints = useMemo(() => service.listEndpoints(), [service])

  const [name, setName] = useState(template?.name ?? initialName ?? '')
  const [nameTouched, setNameTouched] = useState(false)
  const [endpointId, setEndpointId] = useState(
    template?.endpointId ?? initialEndpointId ?? endpoints[0]?.endpointId ?? '',
  )
  const [endpointTouched, setEndpointTouched] = useState(false)
  const [body, setBody] = useState(
    template?.body ? formatJsonSafe(template.body).formatted : (initialBody ?? ''),
  )
  const [bodyTouched, setBodyTouched] = useState(false)
  const [previewResolved, setPreviewResolved] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formatFeedback, setFormatFeedback] = useState<string | null>(null)
  const [swaggerFeedback, setSwaggerFeedback] = useState<string | null>(null)

  const [existingTemplates, setExistingTemplates] = useState<RequestTemplate[]>([])
  const [projectVars, setProjectVars] = useState<Record<string, string>>({})
  const [projectSecrets, setProjectSecrets] = useState<string[]>([])

  const selectedEp = endpoints.find(
    (ep) => ep.endpointId.toLowerCase() === (endpointId || '').toLowerCase(),
  )
  const method = (selectedEp?.method || template?.method || 'get').toLowerCase()
  const supportsBody = ['post', 'put', 'patch', 'delete'].includes(method)

  const rawPath =
    selectedEp?.path || (endpointId ? endpointId.split(' ').slice(1).join(' ') : '') || endpointId
  const pathParamNames = useMemo(() => extractPathParams(rawPath), [rawPath])

  const [pathParams, setPathParams] = useState<Record<string, string>>(
    template?.path ?? initialPath ?? {},
  )
  const [pathTouched, setPathTouched] = useState(false)

  const [queryParams, setQueryParams] = useState<QueryParamRow[]>(() => {
    const source = template?.query ?? initialQuery ?? {}
    const entries = Object.entries(source)
    if (entries.length > 0) {
      return entries.map(([key, value], idx) => ({ id: `q_${idx}_${key}`, key, value }))
    }
    return []
  })

  // Keep state in sync if template prop changes
  useEffect(() => {
    if (template) {
      setName(template.name)
      setEndpointId(template.endpointId)
      setBody(template.body ? formatJsonSafe(template.body).formatted : '')
      if (template.path) setPathParams(template.path)
      if (template.query) {
        setQueryParams(
          Object.entries(template.query).map(([key, value], idx) => ({
            id: `q_${idx}_${key}`,
            key,
            value,
          })),
        )
      }
    }
  }, [template])

  useEffect(() => {
    if (!endpointId && endpoints.length > 0) {
      setEndpointId(template?.endpointId ?? initialEndpointId ?? endpoints[0]?.endpointId ?? '')
    }
  }, [endpoints, endpointId, template, initialEndpointId])

  // Load existing presets to calculate counts and duplicate warnings
  useEffect(() => {
    let mounted = true
    const load = async () => {
      const res = await service.listTemplates()
      if (res.ok && mounted) {
        setExistingTemplates(res.value)
      }
    }
    void load()
    return () => {
      mounted = false
    }
  }, [service])

  // Existing presets count map per endpoint
  const existingPresetsCounts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const t of existingTemplates) {
      const k = t.endpointId.toLowerCase()
      map[k] = (map[k] || 0) + 1
    }
    return map
  }, [existingTemplates])

  // Existing presets for currently selected endpoint
  const presetsForSelectedEndpoint = useMemo(() => {
    if (!endpointId) return []
    return existingTemplates.filter((t) => t.endpointId.toLowerCase() === endpointId.toLowerCase())
  }, [existingTemplates, endpointId])

  // Warning if duplicate preset name exists
  const duplicateNameWarning = useMemo(() => {
    const trimmed = name.trim().toLowerCase()
    if (!trimmed) return null
    const exists = existingTemplates.find(
      (t) => t.name.toLowerCase() === trimmed && t.templateId !== template?.templateId,
    )
    if (exists) {
      return `A preset named "${exists.name}" already exists. Saving will create another preset with a unique ID.`
    }
    return null
  }, [existingTemplates, name, template])

  // Load project variables for autocomplete and preview
  useEffect(() => {
    let mounted = true
    if (!environmentService) return

    const load = async () => {
      const res = await environmentService.list()
      if (res.ok && mounted) {
        const active = res.value.find((e) => e.id === 'default') || res.value[0]
        if (active) {
          setProjectVars(active.variables || {})
          setProjectSecrets(active.secrets || [])
        }
      }
    }

    void load()

    const unsub = bus?.subscribe('ENVIRONMENT_CHANGED', () => {
      void load()
    })

    return () => {
      mounted = false
      unsub?.()
    }
  }, [environmentService, bus])

  // Substitute preview computation for body
  const resolved = useMemo(() => {
    return substitute(body, projectVars)
  }, [body, projectVars])

  // Real-time JSON validation
  const jsonValidation = useMemo(() => validateJsonWithVariables(body), [body])

  // Compute live full URL preview
  const liveUrlPreview = useMemo(() => {
    let resolvedPath = rawPath
    for (const [k, v] of Object.entries(pathParams)) {
      const val = v.trim() || `{${k}}`
      resolvedPath = resolvedPath.replace(new RegExp(`\\{${k}\\}`, 'g'), val)
    }
    const validQuery = queryParams.filter((q) => q.key.trim() !== '')
    if (validQuery.length > 0) {
      const qs = validQuery.map((q) => `${q.key.trim()}=${q.value.trim()}`).join('&')
      return `${resolvedPath}?${qs}`
    }
    return resolvedPath
  }, [rawPath, pathParams, queryParams])

  const handleFormatJson = () => {
    if (!jsonValidation.isValid && body.trim()) {
      setFormatFeedback('⚠️ Invalid JSON syntax')
      setTimeout(() => setFormatFeedback(null), 2500)
      return
    }
    const { formatted, isValid } = formatJsonSafe(body)
    setBody(formatted)
    if (isValid && body.trim()) {
      setFormatFeedback('✓ Formatted')
      setTimeout(() => setFormatFeedback(null), 1500)
    }
  }

  const handleLoadFromSwagger = useCallback(
    (targetEpId: string = endpointId, force = false) => {
      if (!targetEpId) return
      const defaults = service.getSwaggerDefaults?.(targetEpId)
      if (!defaults) {
        if (force) {
          setSwaggerFeedback('No Swagger defaults found')
          setTimeout(() => setSwaggerFeedback(null), 2000)
        }
        return
      }

      let loadedSomething = false

      if (defaults.exampleBody && (!body.trim() || force)) {
        const { formatted } = formatJsonSafe(defaults.exampleBody)
        setBody(formatted)
        loadedSomething = true
      }

      if (defaults.path && Object.keys(defaults.path).length > 0) {
        setPathParams((prev) => ({ ...prev, ...defaults.path }))
        loadedSomething = true
      }

      if (defaults.query && Object.keys(defaults.query).length > 0) {
        setQueryParams((prev) => {
          const existingKeys = new Set(prev.map((p) => p.key.toLowerCase()))
          const additions: QueryParamRow[] = []
          for (const [k, v] of Object.entries(defaults.query!)) {
            if (force || !existingKeys.has(k.toLowerCase())) {
              additions.push({ id: `q_${Date.now()}_${k}`, key: k, value: v })
            }
          }
          return force ? additions : [...prev, ...additions]
        })
        loadedSomething = true
      }

      if (loadedSomething) {
        setSwaggerFeedback('✓ Loaded from Swagger')
        setTimeout(() => setSwaggerFeedback(null), 2000)
      } else if (force) {
        setSwaggerFeedback('No Swagger defaults found')
        setTimeout(() => setSwaggerFeedback(null), 2000)
      }
    },
    [endpointId, body, service],
  )

  const handleSelectEndpoint = (id: string) => {
    setEndpointId(id)
    setEndpointTouched(true)
    setError(null)
    if (!template) {
      handleLoadFromSwagger(id, false)
    }
  }

  const handleSave = async (asNew: boolean = false) => {
    setNameTouched(true)
    setEndpointTouched(true)
    setPathTouched(true)
    setBodyTouched(true)

    if (!name.trim()) {
      setError('Please enter a preset name.')
      return
    }

    if (!endpointId) {
      setError('Please select a target API endpoint.')
      return
    }

    // Validate path parameters: required if the endpoint has placeholders
    for (const p of pathParamNames) {
      if (!pathParams[p]?.trim()) {
        setError(`Please provide a value for path parameter "{${p}}".`)
        return
      }
    }

    if (supportsBody && !jsonValidation.isValid && body.trim()) {
      setError('Please fix the JSON syntax error in the request body before saving.')
      return
    }

    // Build final path and query records
    const finalPath: Record<string, string> = {}
    for (const p of pathParamNames) {
      if (pathParams[p]?.trim()) {
        finalPath[p] = pathParams[p].trim()
      }
    }

    const finalQuery: Record<string, string> = {}
    for (const q of queryParams) {
      if (q.key.trim()) {
        finalQuery[q.key.trim()] = q.value.trim()
      }
    }

    setIsSaving(true)
    setError(null)

    try {
      if (template && !asNew) {
        // Edit existing preset
        const res = await service.updateTemplate(template.templateId, {
          name: name.trim(),
          endpointId,
          method: method.toUpperCase(),
          body: supportsBody ? body : undefined,
          path: Object.keys(finalPath).length > 0 ? finalPath : undefined,
          query: Object.keys(finalQuery).length > 0 ? finalQuery : undefined,
        })
        if (!res.ok) {
          setError(res.error.message || 'Failed to update preset')
          setIsSaving(false)
          return
        }
        bus?.publish('TEMPLATE_SAVED', res.value)
        bus?.publish('NOTIFY', {
          kind: 'success',
          message: `Updated preset "${res.value.name}"`,
        })
        onSaved?.(res.value)
      } else {
        // Create new preset (or Save as New Preset from an existing one)
        const res = await service.createCustomTemplate({
          name: name.trim(),
          endpointId,
          method: method.toUpperCase(),
          environmentId,
          body: supportsBody ? body : undefined,
          path: Object.keys(finalPath).length > 0 ? finalPath : undefined,
          query: Object.keys(finalQuery).length > 0 ? finalQuery : undefined,
        })
        if (!res.ok) {
          setError(res.error.message || 'Failed to create preset')
          setIsSaving(false)
          return
        }
        bus?.publish('TEMPLATE_SAVED', res.value)
        bus?.publish('NOTIFY', {
          kind: 'success',
          message: `Created preset "${res.value.name}"`,
        })
        onSaved?.(res.value)
      }
      onClose()
    } catch (err) {
      setError((err as Error).message || 'An unexpected error occurred')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog
      title={template ? 'Edit Request Preset' : 'Create Request Preset'}
      onClose={onClose}
      size="xl"
      align="top"
    >
      <div className="flex flex-col gap-4">
        {/* Warning / Error Alert */}
        {error && (
          <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/20 px-3 py-2 text-xs font-medium text-yellow-900 dark:text-yellow-100 dark:bg-yellow-500/25 dark:border-yellow-400/60 flex items-center gap-2">
            <span className="shrink-0 text-sm">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* ── Preset Name ── */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="preset-modal-name" className="text-xs font-semibold text-text">
            Preset Name
          </label>
          <Input
            id="preset-modal-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setNameTouched(true)
              setError(null)
            }}
            onBlur={() => setNameTouched(true)}
            placeholder="e.g. Promote Team Member to Admin"
            error={nameTouched && !name.trim() ? 'Preset name is required.' : null}
            warning={duplicateNameWarning}
            autoFocus
          />
        </div>

        {/* ── Endpoint Selector with Swagger Action ── */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-text">Target Endpoint</label>
            <button
              type="button"
              onClick={() => handleLoadFromSwagger(endpointId, true)}
              className={`flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                swaggerFeedback
                  ? 'border-yellow-500/50 bg-yellow-500/20 text-yellow-800 dark:text-yellow-200'
                  : 'border-border text-muted hover:border-primary/40 hover:bg-surface hover:text-text'
              }`}
              title="Read example request body and parameter defaults directly from Swagger"
            >
              <ZapIcon className="h-3 w-3 text-yellow-500" />
              <span>{swaggerFeedback || 'Load from Swagger'}</span>
            </button>
          </div>

          <EndpointPicker
            endpoints={endpoints}
            selectedEndpointId={endpointId}
            onSelect={handleSelectEndpoint}
            error={endpointTouched && !endpointId ? 'Please select a target API endpoint.' : null}
            existingPresetsCounts={existingPresetsCounts}
          />

          {presetsForSelectedEndpoint.length > 0 && (
            <div className="rounded-md border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-[11px] text-muted flex items-start gap-1.5">
              <span className="text-primary text-xs">ℹ️</span>
              <span>
                This endpoint has <strong>{presetsForSelectedEndpoint.length}</strong> existing
                preset
                {presetsForSelectedEndpoint.length > 1 ? 's' : ''} (
                {presetsForSelectedEndpoint.map((p) => `"${p.name}"`).join(', ')}). You can create
                multiple presets for the same endpoint with different values.
              </span>
            </div>
          )}
        </div>

        {/* ── Path Parameters Section (auto-detected from path) ── */}
        {pathParamNames.length > 0 && (
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface/30 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-text">Path Parameters</span>
                <Badge kind="warning">{pathParamNames.length} required</Badge>
              </div>
              <span className="text-[10px] text-muted font-mono">
                Replaces &#123;param&#125; placeholders in URL path
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              {pathParamNames.map((paramName) => (
                <div key={paramName} className="flex flex-col gap-1">
                  <label
                    htmlFor={`param-${paramName}`}
                    className="text-[11px] font-mono text-muted flex items-center gap-1"
                  >
                    <span className="font-semibold text-primary">{`{${paramName}}`}</span>
                    <span className="text-danger">*</span>
                  </label>
                  <Input
                    id={`param-${paramName}`}
                    value={pathParams[paramName] ?? ''}
                    onChange={(e) => {
                      const val = e.target.value
                      setPathParams((prev) => ({ ...prev, [paramName]: val }))
                      setError(null)
                    }}
                    placeholder={`e.g. 101 or {{${paramName.toUpperCase()}}}`}
                    error={
                      pathTouched && !pathParams[paramName]?.trim()
                        ? `Parameter {${paramName}} is required.`
                        : null
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Query Parameters Section ── */}
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface/30 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-text">Query Parameters</span>
              {queryParams.filter((q) => q.key.trim()).length > 0 && (
                <Badge kind="info">{queryParams.filter((q) => q.key.trim()).length} set</Badge>
              )}
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setQueryParams((prev) => [
                  ...prev,
                  { id: `q_${Date.now()}_${Math.random()}`, key: '', value: '' },
                ])
              }}
              className="h-6 text-[11px] px-2 py-0.5"
            >
              <PlusIcon className="h-3 w-3 mr-1" />
              <span>Add Query Param</span>
            </Button>
          </div>

          {queryParams.length === 0 ? (
            <p className="text-[11px] text-muted italic">
              No query parameters added. Click &quot;Add Query Param&quot; if this request expects
              URL parameters (e.g. ?limit=10&amp;dry_run=true).
            </p>
          ) : (
            <div className="flex flex-col gap-1.5 pt-1">
              {queryParams.map((qp, idx) => (
                <div key={qp.id} className="flex items-center gap-2">
                  <div className="w-1/3 min-w-[110px]">
                    <Input
                      value={qp.key}
                      onChange={(e) => {
                        const newKey = e.target.value
                        setQueryParams((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, key: newKey } : item)),
                        )
                      }}
                      placeholder="Parameter key (e.g. limit)"
                      aria-label={`Query parameter ${idx + 1} key`}
                    />
                  </div>
                  <div className="flex-1">
                    <Input
                      value={qp.value}
                      onChange={(e) => {
                        const newVal = e.target.value
                        setQueryParams((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, value: newVal } : item)),
                        )
                      }}
                      placeholder="Value or {{VARIABLE}}"
                      aria-label={`Query parameter ${idx + 1} value`}
                    />
                  </div>
                  <IconButton
                    label="Remove parameter"
                    onClick={() => {
                      setQueryParams((prev) => prev.filter((_, i) => i !== idx))
                    }}
                  >
                    <DeleteIcon className="h-3.5 w-3.5 text-muted hover:text-danger" />
                  </IconButton>
                </div>
              ))}
            </div>
          )}

          {/* Live Full URL Preview */}
          <div className="mt-1 rounded border border-border bg-bg px-2.5 py-1.5 font-mono text-[11px] text-text flex items-center gap-1.5 overflow-x-auto">
            <span className="text-muted shrink-0 text-[10px] uppercase font-bold">
              Resolved URL:
            </span>
            <span className="text-primary font-semibold">{liveUrlPreview}</span>
          </div>
        </div>

        {/* ── Request Body Editor / Preview (POST, PUT, PATCH, DELETE) ── */}
        {!supportsBody ? (
          <div className="rounded-md border border-border bg-surface p-3 text-center text-xs text-muted">
            <span className="font-semibold uppercase text-text">{method}</span> requests do not
            typically require a request body.
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <label htmlFor="preset-modal-body" className="text-xs font-semibold text-text">
                  JSON Request Body
                </label>
                <span className="text-[10px] text-muted">
                  (Type <code className="font-mono text-primary font-semibold">{`{{`}</code> for
                  variables)
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleFormatJson}
                  disabled={previewResolved}
                  className={`rounded border px-2 py-0.5 text-[10px] font-medium disabled:opacity-40 transition-colors ${
                    formatFeedback
                      ? 'border-yellow-500/50 bg-yellow-500/20 text-yellow-800 dark:text-yellow-200'
                      : 'border-border text-muted hover:border-primary/40 hover:bg-surface hover:text-text'
                  }`}
                  title="Format JSON with standard 2-space indentation"
                >
                  {formatFeedback || '{ } Format'}
                </button>

                <button
                  type="button"
                  onClick={() => setPreviewResolved(!previewResolved)}
                  className={`flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-medium transition-colors ${
                    previewResolved
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted hover:border-primary/40 hover:bg-surface hover:text-text'
                  }`}
                  title="Preview variables replaced with actual project and dynamic values"
                >
                  <EyeIcon className="h-3 w-3" />
                  <span>{previewResolved ? 'Hide Preview' : 'Preview Resolved'}</span>
                </button>
              </div>
            </div>

            {/* Missing variables alert */}
            {previewResolved && resolved.missing.length > 0 && (
              <div className="rounded-md border border-yellow-500/50 bg-yellow-500/20 px-2.5 py-1.5 text-[11px] text-yellow-900 dark:text-yellow-100 dark:bg-yellow-500/25 dark:border-yellow-400/60 flex items-center gap-1.5">
                <span className="shrink-0">⚠️</span>
                <span>
                  Missing in project variables:{' '}
                  <strong>{resolved.missing.map((m) => `{{${m}}}`).join(', ')}</strong>
                </span>
              </div>
            )}

            {previewResolved ? (
              <div className="max-h-64 min-h-[140px] overflow-auto rounded-md border border-border bg-bg p-3 font-mono text-xs text-text whitespace-pre-wrap select-text">
                {resolved.text || <span className="text-muted italic">Empty body payload</span>}
              </div>
            ) : (
              <>
                <VariableTextarea
                  id="preset-modal-body"
                  rows={8}
                  value={body}
                  onChange={(e) => {
                    setBody(e.target.value)
                    setBodyTouched(true)
                    setError(null)
                  }}
                  onBlur={() => setBodyTouched(true)}
                  projectVariables={projectVars}
                  projectSecrets={projectSecrets}
                  placement="auto"
                  placeholder={`{\n  "key": "value",\n  "token": "{{ACCESS_TOKEN}}"\n}`}
                  className={`w-full rounded-md border bg-bg p-2.5 font-mono text-xs text-text placeholder:text-muted focus:outline-none focus-visible:ring-1 leading-relaxed transition-colors ${
                    (bodyTouched || error) && !jsonValidation.isValid && body.trim()
                      ? 'border-yellow-500/80 bg-yellow-500/5 focus-visible:ring-yellow-500'
                      : 'border-border focus-visible:ring-primary'
                  }`}
                />
                {!jsonValidation.isValid && body.trim() && (
                  <div className="rounded-md border border-yellow-500/50 bg-yellow-500/20 px-2.5 py-1.5 text-[11px] text-yellow-900 dark:text-yellow-100 dark:bg-yellow-500/25 dark:border-yellow-400/60 flex items-start gap-1.5 font-mono">
                    <span className="shrink-0 text-sm">⚠️</span>
                    <span>Invalid JSON syntax: {jsonValidation.error}</span>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Dialog Actions Footer ── */}
        <div className="flex items-center justify-between border-t border-border pt-3">
          <Button variant="ghost" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>

          <div className="flex items-center gap-2">
            {template ? (
              <>
                <Button
                  variant="secondary"
                  onClick={() => void handleSave(true)}
                  disabled={isSaving}
                  title="Save as a new preset with these values for this endpoint instead of overwriting"
                >
                  + Save as New Preset
                </Button>
                <Button
                  variant="primary"
                  onClick={() => void handleSave(false)}
                  disabled={isSaving}
                >
                  {isSaving ? <Spinner className="h-4 w-4" /> : 'Save Changes'}
                </Button>
              </>
            ) : (
              <Button variant="primary" onClick={() => void handleSave(false)} disabled={isSaving}>
                {isSaving ? <Spinner className="h-4 w-4" /> : 'Create Preset'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  )
}

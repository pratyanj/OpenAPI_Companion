import { useState, useEffect, useMemo } from 'react'
import {
  Dialog,
  Input,
  Button,
  VariableTextarea,
  EyeIcon,
  Spinner,
} from '@/components'
import type { EventBus } from '@/core/events'
import { substitute, type EnvironmentPanelService } from '@/modules/environment'
import type { RequestPanelService, RequestTemplate } from './types'
import { EndpointPicker } from './EndpointPicker'

export interface PresetEditorModalProps {
  service: RequestPanelService
  environmentService?: EnvironmentPanelService
  bus?: EventBus
  environmentId: string
  template?: RequestTemplate | null
  initialEndpointId?: string
  initialBody?: string
  initialName?: string
  onClose: () => void
  onSaved?: (saved: RequestTemplate) => void
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

/**
 * Validates JSON structure while tolerating {{VARIABLE}} or {{VARIABLE:default}} syntax.
 */
function validateJsonWithVariables(raw: string): { isValid: boolean; error: string | null } {
  if (!raw.trim()) return { isValid: true, error: null }
  // Replace {{VARIABLE}} occurrences with valid string placeholder for syntax validation
  const normalized = raw.replace(/\{\{[^}]+\}\}/g, '"__VAR_PLACEHOLDER__"')
  try {
    JSON.parse(normalized)
    return { isValid: true, error: null }
  } catch (err) {
    return { isValid: false, error: (err as Error).message }
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
    template?.body ? formatJsonSafe(template.body).formatted : initialBody ?? '',
  )
  const [bodyTouched, setBodyTouched] = useState(false)
  const [previewResolved, setPreviewResolved] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formatFeedback, setFormatFeedback] = useState<string | null>(null)

  const [existingTemplates, setExistingTemplates] = useState<RequestTemplate[]>([])
  const [projectVars, setProjectVars] = useState<Record<string, string>>({})
  const [projectSecrets, setProjectSecrets] = useState<string[]>([])

  // Keep state in sync if props change
  useEffect(() => {
    if (template) {
      setName(template.name)
      setEndpointId(template.endpointId)
      setBody(template.body ? formatJsonSafe(template.body).formatted : '')
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
    return existingTemplates.filter(
      (t) => t.endpointId.toLowerCase() === endpointId.toLowerCase(),
    )
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

  // Substitute preview computation
  const resolved = useMemo(() => {
    return substitute(body, projectVars)
  }, [body, projectVars])

  // Real-time JSON validation
  const jsonValidation = useMemo(() => validateJsonWithVariables(body), [body])

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

  const handleSave = async (asNew: boolean = false) => {
    setNameTouched(true)
    setEndpointTouched(true)
    setBodyTouched(true)

    if (!name.trim()) {
      setError('Please enter a preset name.')
      return
    }

    if (!endpointId) {
      setError('Please select a target API endpoint.')
      return
    }

    const selectedEp = endpoints.find(
      (ep) => ep.endpointId.toLowerCase() === endpointId.toLowerCase(),
    )
    const method = selectedEp?.method.toUpperCase() || template?.method || 'GET'
    const supportsBody = ['POST', 'PUT', 'PATCH'].includes(method)

    if (supportsBody && !jsonValidation.isValid && body.trim()) {
      setError('Please fix the JSON syntax error in the request body before saving.')
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      if (template && !asNew) {
        // Edit existing preset
        const res = await service.updateTemplate(template.templateId, {
          name: name.trim(),
          endpointId,
          method,
          body,
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
          method,
          environmentId,
          body,
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

  const selectedEp = endpoints.find(
    (ep) => ep.endpointId.toLowerCase() === (endpointId || '').toLowerCase(),
  )
  const method = (selectedEp?.method || template?.method || 'get').toLowerCase()
  const supportsBody = ['post', 'put', 'patch'].includes(method)

  return (
    <Dialog
      title={template ? 'Edit Request Preset' : 'Create Request Preset'}
      onClose={onClose}
      size="xl"
      align="top"
    >
      <div className="flex flex-col gap-4">
        {/* Error Alert */}
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive flex items-center gap-2">
            <span>⚠️</span>
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
            placeholder="e.g. Admin User Login"
            error={nameTouched && !name.trim() ? 'Preset name is required.' : null}
            warning={duplicateNameWarning}
            autoFocus
          />
        </div>

        {/* ── Endpoint Selector ── */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-text">Target Endpoint</label>
          <EndpointPicker
            endpoints={endpoints}
            selectedEndpointId={endpointId}
            onSelect={(id) => {
              setEndpointId(id)
              setEndpointTouched(true)
              setError(null)
            }}
            error={endpointTouched && !endpointId ? 'Please select a target API endpoint.' : null}
            existingPresetsCounts={existingPresetsCounts}
          />
          {presetsForSelectedEndpoint.length > 0 && (
            <div className="rounded-md border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-[11px] text-muted flex items-start gap-1.5">
              <span className="text-primary text-xs">ℹ️</span>
              <span>
                This endpoint has{' '}
                <strong>{presetsForSelectedEndpoint.length}</strong> existing preset
                {presetsForSelectedEndpoint.length > 1 ? 's' : ''} (
                {presetsForSelectedEndpoint.map((p) => `"${p.name}"`).join(', ')}). You can create
                multiple presets for the same endpoint with different values.
              </span>
            </div>
          )}
        </div>

        {/* ── Request Body Editor / Preview (POST, PUT, PATCH only) ── */}
        {!supportsBody ? (
          <div className="rounded-md border border-border bg-surface p-3 text-center text-xs text-muted">
            <span className="font-semibold uppercase text-text">{method}</span> requests do not require a request body.
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <label htmlFor="preset-modal-body" className="text-xs font-semibold text-text">
                  JSON Request Body
                </label>
                <span className="text-[10px] text-muted">
                  (Type <code className="font-mono text-primary font-semibold">{`{{`}</code> for variables)
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleFormatJson}
                  disabled={previewResolved}
                  className="rounded border border-border px-2 py-0.5 text-[10px] font-medium text-muted hover:border-primary/40 hover:bg-surface hover:text-text disabled:opacity-40 transition-colors"
                  title="Format JSON with standard 2-space indentation"
                >
                  {formatFeedback || '{ } Format'}
                </button>

                <button
                  type="button"
                  onClick={() => setPreviewResolved(!previewResolved)}
                  className={`flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-medium transition-colors ${
                    previewResolved
                      ? 'border-primary bg-primary/10 text-primary font-semibold'
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
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-500 flex items-center gap-1.5">
                <span>⚠️</span>
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
                  rows={9}
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
                      ? 'border-destructive focus-visible:ring-destructive'
                      : 'border-border focus-visible:ring-primary'
                  }`}
                />
                {!jsonValidation.isValid && body.trim() && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-[11px] text-destructive flex items-start gap-1.5 font-mono">
                    <span className="shrink-0">⚠️</span>
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
              <Button
                variant="primary"
                onClick={() => void handleSave(false)}
                disabled={isSaving}
              >
                {isSaving ? <Spinner className="h-4 w-4" /> : 'Create Preset'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  )
}

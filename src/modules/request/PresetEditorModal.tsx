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
  const [endpointId, setEndpointId] = useState(
    template?.endpointId ?? initialEndpointId ?? endpoints[0]?.endpointId ?? '',
  )
  const [body, setBody] = useState(
    template?.body ? formatJsonSafe(template.body).formatted : initialBody ?? '',
  )
  const [previewResolved, setPreviewResolved] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formatFeedback, setFormatFeedback] = useState(false)

  const [projectVars, setProjectVars] = useState<Record<string, string>>({})
  const [projectSecrets, setProjectSecrets] = useState<string[]>([])

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

  const handleFormatJson = () => {
    const { formatted, isValid } = formatJsonSafe(body)
    setBody(formatted)
    if (isValid && body.trim()) {
      setFormatFeedback(true)
      setTimeout(() => setFormatFeedback(false), 1500)
    }
  }

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Please enter a preset name.')
      return
    }

    const selectedEp = endpoints.find((ep) => ep.endpointId === endpointId)
    const method = selectedEp?.method.toUpperCase() || template?.method || 'GET'

    setIsSaving(true)
    setError(null)

    try {
      if (template) {
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
        // Create new preset
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

  return (
    <Dialog
      title={template ? 'Edit Request Preset' : 'Create Request Preset'}
      onClose={onClose}
      size="xl"
      align="top"
    >
      <div className="flex flex-col gap-4">
        {error && (
          <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            {error}
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
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Admin User Login"
            autoFocus
          />
        </div>

        {/* ── Endpoint Selector ── */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-text">Target Endpoint</label>
          <EndpointPicker
            endpoints={endpoints}
            selectedEndpointId={endpointId}
            onSelect={(id) => setEndpointId(id)}
          />
        </div>

        {/* ── Request Body Editor / Preview (POST, PUT, PATCH only) ── */}
        {(() => {
          const selectedEp = endpoints.find((ep) => ep.endpointId === endpointId)
          const method = (selectedEp?.method || template?.method || 'get').toLowerCase()
          const supportsBody = ['post', 'put', 'patch'].includes(method)

          if (!supportsBody) {
            return (
              <div className="rounded-md border border-border bg-surface p-3 text-center text-xs text-muted">
                <span className="font-semibold uppercase text-text">{method}</span> requests do not require a request body.
              </div>
            )
          }

          return (
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
                    {formatFeedback ? '✓ Formatted' : '{ } Format'}
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
                <VariableTextarea
                  id="preset-modal-body"
                  rows={9}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  projectVariables={projectVars}
                  projectSecrets={projectSecrets}
                  placement="auto"
                  placeholder={`{\n  "key": "value",\n  "token": "{{ACCESS_TOKEN}}"\n}`}
                  className="w-full rounded-md border border-border bg-bg p-2.5 font-mono text-xs text-text placeholder:text-muted focus:outline-none focus-visible:ring-1 focus-visible:ring-primary leading-relaxed"
                />
              )}
            </div>
          )
        })()}

        {/* ── Dialog Actions Footer ── */}
        <div className="flex items-center justify-between border-t border-border pt-3">
          <span className="text-[11px] text-muted">
            Variables resolve automatically when executing requests.
          </span>

          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSave} disabled={isSaving || !name.trim()}>
              {isSaving ? <Spinner className="h-4 w-4" /> : template ? 'Save Changes' : 'Create Preset'}
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  )
}

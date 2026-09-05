import { useState } from 'react'
import { Dialog, Input, Button, LockIcon } from '@/components'
import type { EndpointInfo } from '@/adapters'
import { EndpointPicker } from '@/modules/request/EndpointPicker'
import type { ExtractionRuleInput } from './extraction-rules-types'

export interface ExtractionRuleModalProps {
  endpoints?: EndpointInfo[]
  initialEndpointId?: string
  initialProperty?: string
  initialTargetVariable?: string
  initialIsSecret?: boolean
  onClose: () => void
  onSave: (rule: ExtractionRuleInput) => Promise<void>
}

const COMMON_PROPERTY_PRESETS = [
  { prop: 'access_token', varName: 'ACCESS_TOKEN', isSecret: true },
  { prop: 'token', varName: 'TOKEN', isSecret: true },
  { prop: 'id', varName: 'ID', isSecret: false },
  { prop: 'data.id', varName: 'ITEM_ID', isSecret: false },
  { prop: 'jwt', varName: 'JWT', isSecret: true },
]

export function ExtractionRuleModal({
  endpoints = [],
  initialEndpointId,
  initialProperty = 'access_token',
  initialTargetVariable = 'ACCESS_TOKEN',
  initialIsSecret = true,
  onClose,
  onSave,
}: ExtractionRuleModalProps) {
  const [endpointId, setEndpointId] = useState(initialEndpointId ?? endpoints[0]?.endpointId ?? '')
  const [property, setProperty] = useState(initialProperty || 'access_token')
  const [targetVariable, setTargetVariable] = useState(initialTargetVariable || 'ACCESS_TOKEN')
  const [isSecret, setIsSecret] = useState(initialIsSecret ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleApplyPreset = (preset: (typeof COMMON_PROPERTY_PRESETS)[0]) => {
    setProperty(preset.prop)
    setTargetVariable(preset.varName)
    setIsSecret(preset.isSecret)
  }

  const handleSave = async () => {
    if (!endpointId.trim()) {
      setError('Please select an endpoint.')
      return
    }
    if (!property.trim()) {
      setError('Please provide a property path (e.g. token or data.id).')
      return
    }
    if (!targetVariable.trim()) {
      setError('Please specify a target variable name.')
      return
    }

    setSaving(true)
    setError(null)

    try {
      await onSave({
        endpointId: endpointId.trim(),
        property: property.trim(),
        targetVariable: targetVariable.trim().toUpperCase(),
        isSecret,
        enabled: true,
      })
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to save rule')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog onClose={onClose} title="Add Auto-Extraction Rule" size="lg" align="top">
      <div className="flex flex-col gap-3 p-1">
        {/* Endpoint Selector */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-text">Endpoint</label>
          {endpoints.length > 0 ? (
            <EndpointPicker
              endpoints={endpoints}
              selectedEndpointId={endpointId}
              onSelect={(id) => setEndpointId(id)}
            />
          ) : (
            <Input
              value={endpointId}
              onChange={(e) => setEndpointId(e.target.value)}
              placeholder="post /api/v1/login"
            />
          )}
        </div>

        {/* Quick Presets */}
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold text-muted">Quick Presets:</span>
          <div className="flex flex-wrap gap-1.5">
            {COMMON_PROPERTY_PRESETS.map((p) => (
              <button
                key={p.prop}
                type="button"
                onClick={() => handleApplyPreset(p)}
                className="rounded border border-border bg-surface px-2 py-0.5 font-mono text-[10px] text-text hover:border-primary hover:text-primary transition-colors"
              >
                {p.prop} → {`{{${p.varName}}}`}
              </button>
            ))}
          </div>
        </div>

        {/* Property Path */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-text">Response Property Path</label>
          <Input
            value={property}
            onChange={(e) => setProperty(e.target.value)}
            placeholder="access_token, token, data.id"
          />
          <span className="text-[10px] text-muted">
            Dot-notation in JSON response (e.g. <code>token</code> or <code>data.items[0].id</code>
            ).
          </span>
        </div>

        {/* Target Variable */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-text">Target Variable Name</label>
          <Input
            value={targetVariable}
            onChange={(e) => setTargetVariable(e.target.value.toUpperCase())}
            placeholder="TOKEN, USER_ID"
          />
        </div>

        {/* Secret Checkbox */}
        <label className="flex cursor-pointer items-center gap-2 text-xs text-text select-none">
          <input
            type="checkbox"
            checked={isSecret}
            onChange={(e) => setIsSecret(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary"
          />
          <span className="flex items-center gap-1">
            <LockIcon className="h-3 w-3 text-warning" />
            Mask as secret variable (•••••••• in UI)
          </span>
        </label>

        {error ? <div className="text-xs text-danger">{error}</div> : null}

        {/* Footer buttons */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void handleSave()} disabled={saving}>
            {saving ? 'Saving...' : 'Create Rule'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

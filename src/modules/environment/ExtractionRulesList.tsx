import { useState } from 'react'
import {
  Badge,
  Button,
  Dialog,
  Input,
  DeleteIcon,
  LockIcon,
  PlusIcon,
  ZapIcon,
} from '@/components'
import type { EndpointInfo } from '@/adapters'
import { EndpointPicker, MethodTag } from '@/modules/request/EndpointPicker'
import type { ExtractionRule, ExtractionRuleInput } from './extraction-rules-types'

export interface ExtractionRulesListProps {
  rules: ExtractionRule[]
  endpoints?: EndpointInfo[]
  onToggleRule: (id: string, enabled: boolean) => Promise<void>
  onDeleteRule: (id: string) => Promise<void>
  onAddRule: (rule: ExtractionRuleInput) => Promise<void>
}

const COMMON_PROPERTY_PRESETS = [
  { prop: 'access_token', varName: 'ACCESS_TOKEN', isSecret: true },
  { prop: 'token', varName: 'TOKEN', isSecret: true },
  { prop: 'id', varName: 'ID', isSecret: false },
  { prop: 'data.id', varName: 'ITEM_ID', isSecret: false },
  { prop: 'jwt', varName: 'JWT', isSecret: true },
]

export function ExtractionRulesList({
  rules,
  endpoints = [],
  onToggleRule,
  onDeleteRule,
  onAddRule,
}: ExtractionRulesListProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const [endpointId, setEndpointId] = useState(endpoints[0]?.endpointId ?? '')
  const [property, setProperty] = useState('access_token')
  const [targetVariable, setTargetVariable] = useState('ACCESS_TOKEN')
  const [isSecret, setIsSecret] = useState(true)
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
      await onAddRule({
        endpointId: endpointId.trim(),
        property: property.trim(),
        targetVariable: targetVariable.trim().toUpperCase(),
        isSecret,
        enabled: true,
      })
      setModalOpen(false)
      setProperty('access_token')
      setTargetVariable('ACCESS_TOKEN')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to save rule')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">
            Auto-Extraction Rules
          </span>
          <Badge kind="neutral">{rules.length}</Badge>
        </div>
        <Button
          variant="primary"
          onClick={() => {
            setError(null)
            setModalOpen(true)
          }}
          className="gap-1 text-xs"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          Add Rule
        </Button>
      </div>

      <p className="text-[11px] text-muted leading-relaxed">
        Rules automatically capture JSON values (like access tokens or entity IDs) from successful (2xx) responses and write them directly into your project's .env variables.
      </p>

      {/* Rules list */}
      {rules.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2.5 rounded-lg border border-dashed border-border bg-surface/30 p-6 text-center">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ZapIcon className="h-5 w-5" />
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium text-text">No extraction rules configured</span>
            <span className="text-[11px] text-muted">
              Auto-extract tokens or IDs upon execution, or check "Auto-extract" when saving from History.
            </span>
          </div>
          <Button
            variant="secondary"
            onClick={() => setModalOpen(true)}
            className="mt-1 gap-1 text-xs"
          >
            <PlusIcon className="h-3 w-3" />
            Create First Rule
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {rules.map((rule) => {
            const [rawMethod = 'GET', ...pathParts] = rule.endpointId.split(' ')
            const epPath = pathParts.join(' ') || rule.endpointId

            return (
              <div
                key={rule.id}
                className={`flex items-center justify-between gap-3 rounded-md border p-2.5 transition-colors ${
                  rule.enabled ? 'border-border bg-surface' : 'border-border/60 bg-surface/30 opacity-70'
                }`}
              >
                {/* Left side info */}
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <MethodTag method={rawMethod} />
                    <span className="truncate font-mono text-xs font-medium text-text">
                      {epPath}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="rounded bg-background px-1.5 py-0.5 font-mono text-muted">
                      body.{rule.property}
                    </span>
                    <span className="text-muted">→</span>
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono font-semibold text-primary">
                      {`{{${rule.targetVariable}}}`}
                    </span>
                    {rule.isSecret ? (
                      <span
                        title="Stored as secret"
                        className="inline-flex items-center gap-0.5 text-warning"
                      >
                        <LockIcon className="h-3 w-3" />
                      </span>
                    ) : null}
                  </div>
                </div>

                {/* Right side controls */}
                <div className="flex items-center gap-2">
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted select-none">
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={(e) => void onToggleRule(rule.id, e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary"
                    />
                    <span className="text-[11px]">{rule.enabled ? 'Active' : 'Off'}</span>
                  </label>
                  <button
                    type="button"
                    title="Delete rule"
                    onClick={() => void onDeleteRule(rule.id)}
                    className="rounded p-1 text-muted hover:bg-surface hover:text-danger"
                  >
                    <DeleteIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add Rule Dialog Modal */}
      {modalOpen ? (
        <Dialog title="Add Auto-Extraction Rule" onClose={() => setModalOpen(false)}>
          <div className="flex flex-col gap-3.5 p-1">
            {/* Endpoint Selector (reused EndpointPicker) */}
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
                Dot-notation in JSON response (e.g. <code>token</code> or <code>data.items[0].id</code>).
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
              <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => void handleSave()} disabled={saving}>
                {saving ? 'Saving...' : 'Create Rule'}
              </Button>
            </div>
          </div>
        </Dialog>
      ) : null}
    </div>
  )
}

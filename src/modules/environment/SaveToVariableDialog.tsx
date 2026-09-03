import { useEffect, useMemo, useState } from 'react'
import { Button, Dialog, Input, LockIcon, Spinner } from '@/components'
import type { EventBus } from '@/core/events'
import type { Environment } from '@/core/project'
import type { EnvironmentPanelService } from './EnvironmentsPanel'
import { extractJsonCandidates, type JsonCandidate } from './json-candidates'

export interface SaveToVariableDialogProps {
  responseBody: string
  service: EnvironmentPanelService
  bus?: EventBus
  onClose: () => void
  onSaved?: (variableName: string, value: string) => void
}

export function SaveToVariableDialog({
  responseBody,
  service,
  bus,
  onClose,
  onSaved,
}: SaveToVariableDialogProps) {
  const candidates = useMemo(() => extractJsonCandidates(responseBody), [responseBody])

  const [activeEnv, setActiveEnv] = useState<Environment | null>(null)
  const [activeId, setActiveId] = useState('default')
  const [existingVars, setExistingVars] = useState<Record<string, string>>({})
  const [existingSecrets, setExistingSecrets] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  const [selectedCandidate, setSelectedCandidate] = useState<JsonCandidate | null>(
    candidates[0] ?? null,
  )
  const [name, setName] = useState(candidates[0]?.suggestedName ?? '')
  const [value, setValue] = useState(candidates[0]?.value ?? '')
  const [isSecret, setIsSecret] = useState(candidates[0]?.isLikelySecret ?? false)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    async function load() {
      const [listRes, activeRes] = await Promise.all([service.list(), service.getActiveId()])
      if (!active) return
      const envs = listRes.ok ? listRes.value : []
      const target = envs.find((e) => e.id === activeRes) || envs[0] || null
      setActiveEnv(target)
      setActiveId(target?.id ?? activeRes ?? 'default')
      if (target) {
        setExistingVars(target.variables ?? {})
        setExistingSecrets(target.secrets ?? [])
      }
      setLoading(false)
    }
    void load()
    return () => {
      active = false
    }
  }, [service])

  const handleSelectCandidate = (c: JsonCandidate) => {
    setSelectedCandidate(c)
    setName(c.suggestedName)
    setValue(c.value)
    setIsSecret(c.isLikelySecret)
    setError(null)
  }

  const handleSave = async () => {
    const trimmedName = name.trim().toUpperCase()
    if (!trimmedName) {
      setError('Variable name cannot be empty.')
      return
    }

    setSaving(true)
    setError(null)

    const updatedVars = { ...existingVars, [trimmedName]: value }
    const secretSet = new Set(existingSecrets)
    if (isSecret) {
      secretSet.add(trimmedName)
    } else {
      secretSet.delete(trimmedName)
    }

    const patch = {
      name: activeEnv?.name ?? 'Default',
      variables: updatedVars,
      secrets: Array.from(secretSet),
      ...(activeEnv?.baseUrl ? { baseUrl: activeEnv.baseUrl } : {}),
    }

    const res = await service.update(activeId, patch)
    setSaving(false)

    if (!res.ok) {
      setError(res.error.message)
      return
    }

    setSuccessMsg(`Saved {{${trimmedName}}} to project variables!`)
    bus?.publish('NOTIFY', {
      kind: 'success',
      message: `Saved {{${trimmedName}}} to project variables!`,
    })
    onSaved?.(trimmedName, value)

    setTimeout(() => {
      onClose()
    }, 900)
  }

  return (
    <Dialog title="Save Response Value to Variable" onClose={onClose}>
      <div className="flex flex-col gap-3 p-1">
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <>
            {/* Detected Candidate Chips */}
            {candidates.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold text-muted">
                  Detected from response ({candidates.length}):
                </span>
                <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto rounded-md border border-border bg-surface p-2">
                  {candidates.map((c, i) => {
                    const isSelected = selectedCandidate === c || name === c.suggestedName
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleSelectCandidate(c)}
                        className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[11px] transition-colors ${
                          isSelected
                            ? 'bg-primary text-primary-contrast'
                            : 'border border-border bg-bg text-muted hover:border-text hover:text-text'
                        }`}
                        title={`${c.path}: ${c.value}`}
                      >
                        {c.isLikelySecret ? <LockIcon className="h-2.5 w-2.5" /> : null}
                        <span>{c.path}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : null}

            {/* Variable Name Input */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-text" htmlFor="save-var-name">
                Variable Name
              </label>
              <Input
                id="save-var-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value.toUpperCase())
                  setError(null)
                }}
                placeholder="e.g. TOKEN, USER_ID, ORDER_ID"
                className="font-mono text-xs"
              />
              {existingVars[name.trim().toUpperCase()] !== undefined ? (
                <span className="text-[10px] text-amber-500">
                  ⚠️ This will overwrite existing variable value.
                </span>
              ) : null}
            </div>

            {/* Variable Value Input */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-text" htmlFor="save-var-value">
                Value
              </label>
              <textarea
                id="save-var-value"
                rows={3}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Value..."
                className="w-full rounded-md border border-border bg-surface p-2 font-mono text-xs text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
            </div>

            {/* Secret Toggle */}
            <label className="flex items-center gap-2 text-xs text-text cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isSecret}
                onChange={(e) => setIsSecret(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary"
              />
              <span className="flex items-center gap-1">
                <LockIcon className="h-3 w-3 text-warning" />
                Mark as secret (mask with •••••••• in UI)
              </span>
            </label>

            {error ? <div className="text-xs text-danger">{error}</div> : null}
            {successMsg ? <div className="text-xs text-success font-medium">{successMsg}</div> : null}

            {/* Dialog Footer Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <Button variant="secondary" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => void handleSave()}
                disabled={saving || !name.trim()}
              >
                {saving ? 'Saving...' : 'Save to Variables'}
              </Button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  )
}

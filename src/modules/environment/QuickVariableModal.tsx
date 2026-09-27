import { useState, useEffect, useMemo, useRef, type ChangeEvent } from 'react'
import {
  Dialog,
  Button,
  IconButton,
  Input,
  Badge,
  Spinner,
  CopyButton,
  SearchIcon,
  PlusIcon,
  DeleteIcon,
  EyeIcon,
  HideIcon,
  LockIcon,
  UnlockIcon,
  CheckIcon,
  CloseIcon,
} from '@/components'
import type { EnvironmentPanelService } from './EnvironmentsPanel'
import type { Environment } from '@/core/project'
import type { EventBus } from '@/core/events'

export interface QuickVariableModalProps {
  service: EnvironmentPanelService
  bus?: EventBus
  onClose: () => void
  initialEnvId?: string
}

interface VariableRowProps {
  varKey: string
  value: string
  isSecret: boolean
  onSave: (oldKey: string, newKey: string, newValue: string, isSecret: boolean) => Promise<boolean>
  onToggleSecret: (key: string, isSecret: boolean) => Promise<void>
  onDelete: (key: string) => Promise<void>
}

function VariableRow({
  varKey,
  value,
  isSecret,
  onSave,
  onToggleSecret,
  onDelete,
}: VariableRowProps) {
  const [editingKey, setEditingKey] = useState(varKey)
  const [editingValue, setEditingValue] = useState(value)
  const [revealed, setRevealed] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [copiedKey, setCopiedKey] = useState(false)

  // Sync if prop values change from outside
  useEffect(() => {
    setEditingKey(varKey)
  }, [varKey])

  useEffect(() => {
    setEditingValue(value)
  }, [value])

  const commit = async () => {
    const success = await onSave(varKey, editingKey, editingValue, isSecret)
    if (success && (editingKey !== varKey || editingValue !== value)) {
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 1200)
    }
  }

  const copyPlaceholder = () => {
    const text = `{{${varKey}}}`
    void navigator.clipboard?.writeText(text)
    setCopiedKey(true)
    setTimeout(() => setCopiedKey(false), 1200)
  }

  return (
    <div
      role="row"
      className="group relative flex items-center gap-2 border-b border-border/60 bg-surface/20 px-3 py-2 transition-colors hover:bg-surface/50"
    >
      {/* Variable Key */}
      <div className="relative w-2/5 min-w-[130px]">
        <input
          type="text"
          value={editingKey}
          onChange={(e) => setEditingKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
          title="Click to edit key (Enter or blur to save)"
          className="w-full rounded border border-transparent bg-transparent px-2 py-1 font-mono text-xs font-semibold text-text placeholder:text-muted/60 transition-colors hover:border-border/80 focus:border-primary focus:bg-surface focus:outline-none"
          placeholder="KEY_NAME"
        />
      </div>

      {/* Variable Value */}
      <div className="relative flex flex-1 items-center gap-1.5">
        <input
          type={isSecret && !revealed ? 'password' : 'text'}
          value={editingValue}
          onChange={(e) => setEditingValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
          title="Click to edit value (Enter or blur to save)"
          className="w-full rounded border border-transparent bg-transparent px-2 py-1 font-mono text-xs text-text placeholder:text-muted/60 transition-colors hover:border-border/80 focus:border-primary focus:bg-surface focus:outline-none"
          placeholder="value"
        />
        {isSecret && (
          <IconButton
            label={revealed ? 'Hide secret value' : 'Reveal secret value'}
            onClick={() => setRevealed(!revealed)}
            className="h-6 w-6 shrink-0 text-muted hover:text-text"
          >
            {revealed ? <HideIcon className="h-3.5 w-3.5" /> : <EyeIcon className="h-3.5 w-3.5" />}
          </IconButton>
        )}
      </div>

      {/* Row Actions */}
      <div className="flex shrink-0 items-center gap-1">
        {justSaved && (
          <span
            aria-live="polite"
            className="flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-500"
          >
            <CheckIcon className="h-3 w-3" /> Saved
          </span>
        )}

        {/* Copy {{KEY}} tag */}
        <button
          type="button"
          onClick={copyPlaceholder}
          title={`Copy {{${varKey}}} to clipboard`}
          className="flex h-6 items-center gap-1 rounded px-1.5 font-mono text-[10px] text-muted transition-colors hover:bg-surface hover:text-primary active:scale-95"
        >
          {copiedKey ? (
            <span className="text-emerald-500 font-semibold">Copied!</span>
          ) : (
            <span>&#123;&#123;{varKey}&#125;&#125;</span>
          )}
        </button>

        {/* Copy raw value */}
        <CopyButton text={editingValue} label="Copy raw value" />

        {/* Secret Toggle */}
        <IconButton
          label={isSecret ? 'Mark as public variable' : 'Mark as secret variable'}
          onClick={() => onToggleSecret(varKey, !isSecret)}
          className={`h-6 w-6 ${isSecret ? 'text-amber-500' : 'text-muted/60 hover:text-text'}`}
        >
          {isSecret ? <LockIcon className="h-3.5 w-3.5" /> : <UnlockIcon className="h-3.5 w-3.5" />}
        </IconButton>

        {/* Delete button */}
        <IconButton
          label={`Delete ${varKey}`}
          onClick={() => onDelete(varKey)}
          className="h-6 w-6 text-muted/60 hover:text-rose-500"
        >
          <DeleteIcon className="h-3.5 w-3.5" />
        </IconButton>
      </div>
    </div>
  )
}

export function QuickVariableModal({
  service,
  bus,
  onClose,
  initialEnvId,
}: QuickVariableModalProps) {
  const [currentEnv, setCurrentEnv] = useState<Environment | null>(null)
  const [loading, setLoading] = useState(true)
  const [filterText, setFilterText] = useState('')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Quick Add Row state
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [newIsSecret, setNewIsSecret] = useState(false)
  const [secretManuallySet, setSecretManuallySet] = useState(false)
  const keyInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      const [listRes, activeId] = await Promise.all([service.list(), service.getActiveId()])
      if (!active) return

      const envs = listRes.ok ? listRes.value : []
      const targetId = initialEnvId || activeId || envs[0]?.id || 'default'
      const matched = envs.find((e) => e.id === targetId) ?? envs[0] ?? null
      setCurrentEnv(matched)
      setLoading(false)
    }

    void load()
    return () => {
      active = false
    }
  }, [service, initialEnvId])

  useEffect(() => {
    if (!bus) return
    const unsub = bus.subscribe('ENVIRONMENT_CHANGED', () => {
      void (async () => {
        const [listRes, activeId] = await Promise.all([service.list(), service.getActiveId()])
        if (listRes.ok) {
          const targetId = initialEnvId || activeId || listRes.value[0]?.id || 'default'
          const matched = listRes.value.find((e) => e.id === targetId) ?? listRes.value[0] ?? null
          setCurrentEnv(matched)
        }
      })()
    })
    return unsub
  }, [bus, service, initialEnvId])

  const handleNewKeyChange = (e: ChangeEvent<HTMLInputElement>) => {
    const formatted = e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_')
    setNewKey(formatted)
    if (!secretManuallySet) {
      setNewIsSecret(/(TOKEN|SECRET|PASSWORD|KEY|AUTH)/i.test(formatted))
    }
  }

  const handleAddVariable = async () => {
    if (!currentEnv) return
    const trimmedKey = newKey.trim()
    if (!trimmedKey) return

    setSaveStatus('saving')
    setErrorMessage(null)

    const nextVars = { ...(currentEnv.variables ?? {}), [trimmedKey]: newValue }
    const nextSecrets = newIsSecret
      ? Array.from(new Set([...(currentEnv.secrets ?? []), trimmedKey]))
      : (currentEnv.secrets ?? []).filter((k) => k !== trimmedKey)

    const res = await service.update(currentEnv.id, {
      variables: nextVars,
      secrets: nextSecrets,
    })

    if (!res.ok) {
      setSaveStatus('error')
      setErrorMessage(res.error.message)
      return
    }

    setCurrentEnv(res.value)

    setNewKey('')
    setNewValue('')
    setNewIsSecret(false)
    setSecretManuallySet(false)
    setSaveStatus('saved')
    setTimeout(() => setSaveStatus('idle'), 1800)
    keyInputRef.current?.focus()
  }

  const handleUpdateVariable = async (
    oldKey: string,
    nextKey: string,
    nextVal: string,
    isSec: boolean,
  ): Promise<boolean> => {
    if (!currentEnv) return false
    const trimmedKey = nextKey
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, '_')
    if (!trimmedKey) return false

    const keyChanged = trimmedKey !== oldKey
    const valChanged = nextVal !== (currentEnv.variables?.[oldKey] ?? '')
    if (!keyChanged && !valChanged) return true

    setSaveStatus('saving')
    setErrorMessage(null)

    const nextVars = { ...(currentEnv.variables ?? {}) }
    if (keyChanged) {
      delete nextVars[oldKey]
    }
    nextVars[trimmedKey] = nextVal

    let nextSecrets = [...(currentEnv.secrets ?? [])]
    if (keyChanged) {
      nextSecrets = nextSecrets.filter((k) => k !== oldKey)
    }
    if (isSec && !nextSecrets.includes(trimmedKey)) {
      nextSecrets.push(trimmedKey)
    } else if (!isSec) {
      nextSecrets = nextSecrets.filter((k) => k !== trimmedKey)
    }

    const res = await service.update(currentEnv.id, {
      variables: nextVars,
      secrets: nextSecrets,
    })

    if (!res.ok) {
      setSaveStatus('error')
      setErrorMessage(res.error.message)
      return false
    }

    setCurrentEnv(res.value)
    setSaveStatus('saved')
    setTimeout(() => setSaveStatus('idle'), 1800)
    return true
  }

  const handleDeleteVariable = async (key: string) => {
    if (!currentEnv) return
    setSaveStatus('saving')
    setErrorMessage(null)

    const nextVars = { ...(currentEnv.variables ?? {}) }
    delete nextVars[key]
    const nextSecrets = (currentEnv.secrets ?? []).filter((k) => k !== key)

    const res = await service.update(currentEnv.id, {
      variables: nextVars,
      secrets: nextSecrets,
    })

    if (!res.ok) {
      setSaveStatus('error')
      setErrorMessage(res.error.message)
      return
    }

    setCurrentEnv(res.value)
    setSaveStatus('saved')
    setTimeout(() => setSaveStatus('idle'), 1800)
  }

  const handleToggleSecret = async (key: string, makeSecret: boolean) => {
    if (!currentEnv) return
    setSaveStatus('saving')
    setErrorMessage(null)

    const currentSecrets = new Set(currentEnv.secrets ?? [])
    if (makeSecret) {
      currentSecrets.add(key)
    } else {
      currentSecrets.delete(key)
    }
    const nextSecrets = Array.from(currentSecrets)

    const res = await service.update(currentEnv.id, {
      secrets: nextSecrets,
    })

    if (!res.ok) {
      setSaveStatus('error')
      setErrorMessage(res.error.message)
      return
    }

    setCurrentEnv(res.value)
    setSaveStatus('saved')
    setTimeout(() => setSaveStatus('idle'), 1800)
  }

  // Filter variable rows
  const variableEntries = useMemo(() => {
    if (!currentEnv?.variables) return []
    const secretsSet = new Set(currentEnv.secrets ?? [])
    const entries = Object.entries(currentEnv.variables).map(([k, v]) => ({
      key: k,
      value: v,
      isSecret: secretsSet.has(k),
    }))

    if (!filterText.trim()) return entries
    const q = filterText.toLowerCase()
    return entries.filter(
      (e) => e.key.toLowerCase().includes(q) || e.value.toLowerCase().includes(q),
    )
  }, [currentEnv, filterText])

  const totalCount = Object.keys(currentEnv?.variables ?? {}).length

  return (
    <Dialog
      title="Project Variables"
      onClose={onClose}
      size="xl"
      actions={
        <div className="flex items-center gap-3">
          {/* Save Status Badge */}
          {saveStatus === 'saving' && (
            <span className="flex items-center gap-1.5 text-xs text-muted">
              <Spinner className="h-3 w-3" /> Saving...
            </span>
          )}
          {saveStatus === 'saved' && (
            <span className="flex items-center gap-1 text-xs font-medium text-emerald-500">
              <CheckIcon className="h-3.5 w-3.5" /> Saved
            </span>
          )}
          {saveStatus === 'error' && (
            <span className="flex items-center gap-1 text-xs font-medium text-rose-500">
              Save failed
            </span>
          )}
          {saveStatus === 'idle' && (
            <span className="text-[11px] text-muted">Instant auto-save</span>
          )}

          {/* Shortcut badge */}
          <Badge className="font-mono text-[10px]">Alt+V</Badge>
        </div>
      }
    >
      <div className="flex flex-col gap-3 p-1">
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <>
            {/* Top Toolbar: Variable Count & Search Filter */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted">
                  {totalCount} variable{totalCount === 1 ? '' : 's'} stored for this project
                </span>
              </div>

              {/* Search filter */}
              <div className="relative w-64">
                <Input
                  type="text"
                  placeholder="Filter variables..."
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  className="h-8 pl-8 pr-7 text-xs"
                />
                <SearchIcon className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted" />
                {filterText && (
                  <button
                    type="button"
                    onClick={() => setFilterText('')}
                    className="absolute right-2 top-2 text-muted hover:text-text"
                    title="Clear filter"
                  >
                    <CloseIcon className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Quick Add Row */}
            <div className="rounded-lg border border-border bg-surface/40 p-2.5 shadow-sm">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                  Quick Add Variable
                </span>
                <span className="text-[10px] text-muted">Press Enter to add</span>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  void handleAddVariable()
                }}
                className="flex items-center gap-2"
              >
                <input
                  ref={keyInputRef}
                  type="text"
                  value={newKey}
                  onChange={handleNewKeyChange}
                  placeholder="VARIABLE_NAME"
                  className="h-8 w-2/5 min-w-[130px] rounded-md border border-border bg-bg px-2.5 font-mono text-xs font-semibold text-text placeholder:font-sans placeholder:text-muted/60 focus:border-primary focus:outline-none"
                  required
                />
                <input
                  type={newIsSecret ? 'password' : 'text'}
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  placeholder="Value"
                  className="h-8 flex-1 rounded-md border border-border bg-bg px-2.5 font-mono text-xs text-text placeholder:font-sans placeholder:text-muted/60 focus:border-primary focus:outline-none"
                />
                <IconButton
                  type="button"
                  label={newIsSecret ? 'Secret variable (masked)' : 'Public variable'}
                  onClick={() => {
                    setSecretManuallySet(true)
                    setNewIsSecret(!newIsSecret)
                  }}
                  className={`h-8 w-8 rounded-md border border-border bg-bg ${
                    newIsSecret ? 'text-amber-500' : 'text-muted hover:text-text'
                  }`}
                >
                  {newIsSecret ? (
                    <LockIcon className="h-4 w-4" />
                  ) : (
                    <UnlockIcon className="h-4 w-4" />
                  )}
                </IconButton>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={!newKey.trim()}
                  className="h-8 px-3 text-xs font-medium"
                >
                  <PlusIcon className="mr-1 h-3.5 w-3.5" /> Add
                </Button>
              </form>
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-500">
                {errorMessage}
              </div>
            )}

            {/* Variables Table */}
            <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-bg shadow-inner">
              {/* Table Column Headers */}
              <div className="flex items-center gap-2 border-b border-border bg-surface/70 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                <span className="w-2/5 min-w-[130px]">Variable Name</span>
                <span className="flex-1">Value</span>
                <span className="w-24 text-right">Actions</span>
              </div>

              {/* Table Rows */}
              <div className="max-h-[46vh] divide-y divide-border/40 overflow-y-auto">
                {variableEntries.length === 0 ? (
                  <div className="flex h-32 flex-col items-center justify-center gap-1.5 p-4 text-center">
                    <span className="text-xs text-muted">
                      {filterText
                        ? `No variables matching "${filterText}"`
                        : 'No variables configured for this environment.'}
                    </span>
                    {filterText && (
                      <button
                        type="button"
                        onClick={() => setFilterText('')}
                        className="text-xs text-primary hover:underline"
                      >
                        Clear search filter
                      </button>
                    )}
                  </div>
                ) : (
                  variableEntries.map((row) => (
                    <VariableRow
                      key={row.key}
                      varKey={row.key}
                      value={row.value}
                      isSecret={row.isSecret}
                      onSave={handleUpdateVariable}
                      onToggleSecret={handleToggleSecret}
                      onDelete={handleDeleteVariable}
                    />
                  ))
                )}
              </div>
            </div>

            {/* Helpful footer tips */}
            <div className="flex items-center justify-between text-[11px] text-muted">
              <span>
                Tip: Use{' '}
                <code className="rounded bg-surface px-1 py-0.5 text-text">
                  &#123;&#123;VARIABLE&#125;&#125;
                </code>{' '}
                in Swagger UI headers, paths, or JSON body.
              </span>
              <span>
                Press{' '}
                <kbd className="rounded border border-border bg-surface px-1 py-0.5 font-mono text-[10px] text-text">
                  Esc
                </kbd>{' '}
                to close
              </span>
            </div>
          </>
        )}
      </div>
    </Dialog>
  )
}

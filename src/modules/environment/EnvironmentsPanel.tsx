import { useCallback, useEffect, useRef, useState } from 'react'
import type { Result } from '@/types'
import type { EventBus } from '@/core/events'
import { useEventBus } from '@/hooks'
import {
  Badge,
  Button,
  Spinner,
  Dialog,
  DeleteIcon,
  EditIcon,
  LockIcon,
  UnlockIcon,
  RevealIcon,
  HideIcon,
  CopyIcon,
  CopiedIcon,
  UploadIcon,
  DownloadIcon,
  Menu,
  ZapIcon,
} from '@/components'
import { copyText } from '@/utils'
import type { EndpointInfo } from '@/adapters'
import type { Environment } from '@/core/project'
import type { EnvironmentInput } from './env-service'
import {
  parseDotEnv,
  serializeDotEnv,
  parsePostmanEnv,
  exportPostmanEnv,
} from './env-parser'
import type { ExtractionRule, ExtractionRuleInput } from './extraction-rules-types'
import { ExtractionRulesList } from './ExtractionRulesList'

/** Surface EnvironmentsPanel needs from EnvironmentService (eases testing). */
export interface EnvironmentPanelService {
  list(): Promise<Result<Environment[]>>
  getActiveId(): Promise<string>
  switch?(id: string): Promise<Result<Environment>>
  create?(input: EnvironmentInput): Promise<Result<Environment>>
  update(id: string, patch: Partial<EnvironmentInput>): Promise<Result<Environment>>
  delete?(id: string): Promise<Result<void>>
  listBuiltins?(): ReadonlyArray<{ id: string; name: string }>
  listRules?(): Promise<Result<ExtractionRule[]>>
  saveRule?(rule: ExtractionRuleInput): Promise<Result<ExtractionRule>>
  updateRule?(id: string, patch: Partial<ExtractionRule>): Promise<Result<ExtractionRule>>
  deleteRule?(id: string): Promise<Result<void>>
}

export interface EnvironmentsPanelProps {
  service: EnvironmentPanelService
  bus: EventBus
  endpoints?: EndpointInfo[]
  requestService?: {
    listTemplates?: () => Promise<Result<Array<{
      endpointId: string
      body?: string
      query?: Record<string, string>
      path?: Record<string, string>
      headers?: Record<string, string>
    }>>>
  }
  onOpenExtractionRuleModal?: (options?: {
    endpointId?: string
    property?: string
    targetVariable?: string
    isSecret?: boolean
  }) => Promise<Result<void>> | Result<void> | void
}

interface VarRow {
  key: string
  value: string
  isSecret: boolean
  revealed: boolean
}

function toRows(variables: Record<string, string> = {}, secrets: string[] = []): VarRow[] {
  const secretSet = new Set(secrets)
  return Object.entries(variables).map(([key, value]) => ({
    key,
    value,
    isSecret: secretSet.has(key),
    revealed: false,
  }))
}

function triggerDownload(filename: string, content: string, mimeType = 'application/octet-stream') {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function EnvironmentsPanel({
  service,
  bus,
  endpoints = [],
  requestService,
  onOpenExtractionRuleModal,
}: EnvironmentsPanelProps) {
  const [activeEnv, setActiveEnv] = useState<Environment | null>(null)
  const [activeId, setActiveId] = useState('default')
  const [loading, setLoading] = useState(true)
  const [vars, setVars] = useState<VarRow[]>([])
  const [editorMode, setEditorMode] = useState<'table' | 'rules' | 'raw'>('table')
  const [rules, setRules] = useState<ExtractionRule[]>([])
  const [templateRefs, setTemplateRefs] = useState<Record<string, string[]>>({})
  const [rawText, setRawText] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedSuccess, setSavedSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Modals
  const [importOpen, setImportOpen] = useState(false)
  const [importInput, setImportInput] = useState('')
  const [importStatus, setImportStatus] = useState<string | null>(null)

  const [exportOpen, setExportOpen] = useState(false)
  const [maskSecretsInExport, setMaskSecretsInExport] = useState(false)
  const [copiedExport, setCopiedExport] = useState(false)
  const [copiedVarIndex, setCopiedVarIndex] = useState<number | null>(null)

  const isLoadedRef = useRef(false)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeEnvRef = useRef(activeEnv)
  activeEnvRef.current = activeEnv
  const activeIdRef = useRef(activeId)
  activeIdRef.current = activeId

  const performSave = useCallback(
    async (currentVars: VarRow[], mode: 'table' | 'raw', currentRaw: string) => {
      if (!isLoadedRef.current) return
      setSaving(true)
      setError(null)

      let variables: Record<string, string>
      let secrets: string[]

      if (mode === 'raw') {
        const parsed = parseDotEnv(currentRaw)
        variables = parsed.variables
        secrets = parsed.secrets
      } else {
        variables = Object.fromEntries(
          currentVars.filter((v) => v.key.trim()).map((v) => [v.key.trim(), v.value]),
        )
        secrets = currentVars.filter((v) => v.isSecret && v.key.trim()).map((v) => v.key.trim())
      }

      const env = activeEnvRef.current
      const id = activeIdRef.current

      const patch: Partial<EnvironmentInput> = {
        name: env?.name ?? 'Default',
        variables,
        secrets,
        ...(env?.baseUrl ? { baseUrl: env.baseUrl } : {}),
      }

      const result = await service.update(id, patch)
      setSaving(false)
      if (!result.ok) {
        setError(result.error.message)
        return
      }

      setSavedSuccess(true)
      setTimeout(() => setSavedSuccess(false), 2000)
    },
    [service],
  )

  const scheduleSave = useCallback(
    (nextVars: VarRow[], mode: 'table' | 'raw', nextRaw: string, immediate = false) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
      }
      if (immediate) {
        void performSave(nextVars, mode, nextRaw)
      } else {
        setSaving(true)
        debounceTimerRef.current = setTimeout(() => {
          debounceTimerRef.current = null
          void performSave(nextVars, mode, nextRaw)
        }, 350)
      }
    },
    [performSave],
  )

  const load = useCallback(async () => {
    const [list, active] = await Promise.all([service.list(), service.getActiveId()])
    const envs = list.ok ? list.value : []
    const target = envs.find((e) => e.id === active) || envs[0] || null
    setActiveEnv(target)
    const targetId = target?.id ?? active ?? 'default'
    setActiveId(targetId)
    if (target) {
      setVars(toRows(target.variables, target.secrets))
      setRawText(serializeDotEnv(target.variables, target.secrets))
    }
    setLoading(false)
    isLoadedRef.current = true
  }, [service])

  useEffect(() => {
    setLoading(true)
    void load()
  }, [load])

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

  useEventBus(bus, 'ENVIRONMENT_CHANGED', () => void load())
  useEventBus(bus, 'ENVIRONMENT_CREATED', () => void load())
  useEventBus(bus, 'ENVIRONMENT_DELETED', () => void load())

  const loadRules = useCallback(async () => {
    if (service.listRules) {
      const res = await service.listRules()
      if (res.ok) setRules(res.value)
    }
  }, [service])

  const scanVariableUsage = useCallback(async () => {
    if (!requestService?.listTemplates) return
    const res = await requestService.listTemplates()
    if (!res.ok) return
    const refs: Record<string, string[]> = {}

    const scanText = (text: string | undefined, endpointId: string) => {
      if (!text) return
      const matches = text.match(/\{\{\s*([$A-Za-z0-9_]+)\s*\}\}/g)
      if (!matches) return
      for (const m of matches) {
        const key = m.replace(/[{}$\s]/g, '').toUpperCase()
        if (!key) continue
        if (!refs[key]) refs[key] = []
        if (!refs[key].includes(endpointId)) refs[key].push(endpointId)
      }
    }

    for (const t of res.value) {
      scanText(t.body, t.endpointId)
      if (t.query) Object.values(t.query).forEach((v) => scanText(v, t.endpointId))
      if (t.path) Object.values(t.path).forEach((v) => scanText(v, t.endpointId))
      if (t.headers) Object.values(t.headers).forEach((v) => scanText(v, t.endpointId))
    }

    setTemplateRefs(refs)
  }, [requestService])

  useEffect(() => {
    void loadRules()
    void scanVariableUsage()
  }, [loadRules, scanVariableUsage])

  useEventBus(bus, 'EXTRACTION_RULE_SAVED', () => void loadRules())
  useEventBus(bus, 'EXTRACTION_RULE_DELETED', () => void loadRules())
  useEventBus(bus, 'VARIABLE_AUTO_EXTRACTED', () => void load())
  useEventBus(bus, 'TEMPLATE_SAVED', () => void scanVariableUsage())
  useEventBus(bus, 'TEMPLATE_DELETED', () => void scanVariableUsage())

  const handleToggleRule = async (id: string, enabled: boolean) => {
    if (service.updateRule) {
      await service.updateRule(id, { enabled })
      await loadRules()
    }
  }

  const handleDeleteRule = async (id: string) => {
    if (service.deleteRule) {
      await service.deleteRule(id)
      await loadRules()
    }
  }

  const handleAddRule = async (ruleInput: ExtractionRuleInput) => {
    if (service.saveRule) {
      const res = await service.saveRule(ruleInput)
      if (!res.ok) throw new Error(res.error.message)
      await loadRules()
    }
  }

  const handleOpenAddRuleModal = async () => {
    if (onOpenExtractionRuleModal) {
      try {
        const res = await onOpenExtractionRuleModal()
        if (res && typeof res === 'object' && 'ok' in res && !res.ok) {
          return false
        }
        return true
      } catch {
        return false
      }
    }
    return false
  }

  const handleBlur = () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
      void performSave(vars, editorMode === 'raw' ? 'raw' : 'table', rawText)
    }
  }

  const handleModeSwitch = (targetMode: 'table' | 'rules' | 'raw') => {
    if (targetMode === editorMode) return
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
      void performSave(vars, editorMode === 'raw' ? 'raw' : 'table', rawText)
    }
    if (targetMode === 'raw') {
      const currentVars = Object.fromEntries(
        vars.filter((v) => v.key.trim()).map((v) => [v.key.trim(), v.value]),
      )
      const currentSecrets = vars.filter((v) => v.isSecret && v.key.trim()).map((v) => v.key.trim())
      const serialized = serializeDotEnv(currentVars, currentSecrets)
      setRawText(serialized)
      setEditorMode('raw')
      void performSave(vars, 'table', serialized)
    } else if (targetMode === 'table') {
      if (editorMode === 'raw') {
        const parsed = parseDotEnv(rawText)
        const existingSecrets = new Set(vars.filter((v) => v.isSecret).map((v) => v.key))
        const combinedSecrets = new Set([...existingSecrets, ...parsed.secrets])
        const nextRows = Object.entries(parsed.variables).map(([k, v]) => ({
          key: k,
          value: v,
          isSecret: combinedSecrets.has(k),
          revealed: false,
        }))
        setVars(nextRows)
        void performSave(nextRows, 'raw', rawText)
      }
      setEditorMode('table')
    } else {
      setEditorMode('rules')
    }
  }

  const handleImportParse = async () => {
    const trimmed = importInput.trim()
    if (!trimmed) {
      setImportStatus('Please paste content to import.')
      return
    }

    try {
      let importedVars: Record<string, string>
      let importedSecrets: string[]

      if (trimmed.startsWith('{') && trimmed.includes('"values"')) {
        // Postman JSON format
        const postman = parsePostmanEnv(trimmed)
        importedVars = postman.variables
        importedSecrets = postman.secrets
      } else {
        // Standard .env format
        const parsed = parseDotEnv(trimmed)
        importedVars = parsed.variables
        importedSecrets = parsed.secrets
      }

      // Merge with existing variables
      const existingVars = Object.fromEntries(
        vars.filter((v) => v.key.trim()).map((v) => [v.key.trim(), v.value]),
      )
      const existingSecrets = new Set(vars.filter((v) => v.isSecret && v.key.trim()).map((v) => v.key.trim()))
      const mergedVars = { ...existingVars, ...importedVars }
      const mergedSecrets = Array.from(new Set([...existingSecrets, ...importedSecrets]))

      const patch: Partial<EnvironmentInput> = {
        name: activeEnv?.name ?? 'Default',
        variables: mergedVars,
        secrets: mergedSecrets,
      }
      await service.update(activeId, patch)
      await load()

      setImportOpen(false)
      setImportInput('')
      setImportStatus(null)
      setSavedSuccess(true)
      setTimeout(() => setSavedSuccess(false), 2000)
    } catch {
      setImportStatus('Failed to parse content. Check format.')
    }
  }

  const handleRawChange = (newText: string) => {
    setRawText(newText)
    scheduleSave(vars, 'raw', newText, false)
  }

  const addVar = () => {
    setVars((prev) => [...prev, { key: '', value: '', isSecret: false, revealed: false }])
  }

  const updateVar = (index: number, patch: Partial<VarRow>) => {
    setVars((prev) => {
      const next = prev.map((row, i) => (i === index ? { ...row, ...patch } : row))
      if (patch.key !== undefined || patch.value !== undefined || patch.isSecret !== undefined) {
        scheduleSave(next, 'table', rawText, patch.isSecret !== undefined)
      }
      return next
    })
  }

  const removeVar = (index: number) => {
    setVars((prev) => {
      const next = prev.filter((_, i) => i !== index)
      scheduleSave(next, 'table', rawText, true)
      return next
    })
  }

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Spinner />
      </div>
    )
  }

  const varCount = editorMode === 'table' ? vars.filter((v) => v.key.trim()).length : Object.keys(parseDotEnv(rawText).variables).length
  const secretCount = editorMode === 'table' ? vars.filter((v) => v.isSecret && v.key.trim()).length : parseDotEnv(rawText).secrets.length

  const currentVariables =
    editorMode === 'table'
      ? Object.fromEntries(vars.filter((v) => v.key.trim()).map((v) => [v.key.trim(), v.value]))
      : parseDotEnv(rawText).variables

  const currentSecrets =
    editorMode === 'table'
      ? vars.filter((v) => v.isSecret && v.key.trim()).map((v) => v.key.trim())
      : parseDotEnv(rawText).secrets

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* Header bar */}
      <div className="flex flex-col gap-2.5 border-b border-border pb-3">
        {/* Top line: Title & Badges */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-text">Project Variables</h2>
            {varCount > 0 ? <Badge kind="info">{varCount} vars</Badge> : null}
            {secretCount > 0 ? (
              <Badge kind="warning">
                {secretCount} secret{secretCount === 1 ? '' : 's'}
              </Badge>
            ) : null}
          </div>
        </div>

        {/* Subtitle */}
        <p className="text-[11px] text-muted leading-tight">
          Scoped to this project. Injected into requests via{' '}
          <code className="rounded bg-surface px-1 py-0.5 font-mono text-[10px] text-primary">
            {`{{KEY}}`}
          </code>.
        </p>

        {/* Dedicated Toolbar Row */}
        <div className="flex items-center justify-between pt-1">
          {/* View Mode Switcher + Auto-save status */}
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-md border border-border bg-surface p-0.5 shadow-sm">
              <button
                type="button"
                aria-label="Table mode"
                onClick={() => handleModeSwitch('table')}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  editorMode === 'table'
                    ? 'bg-primary text-primary-contrast'
                    : 'text-muted hover:text-text'
                }`}
              >
                Table
              </button>
              <button
                type="button"
                aria-label="Rules mode"
                onClick={() => handleModeSwitch('rules')}
                className={`flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  editorMode === 'rules'
                    ? 'bg-primary text-primary-contrast'
                    : 'text-muted hover:text-text'
                }`}
              >
                <ZapIcon className="h-3 w-3" />
                Rules {rules.length > 0 ? `(${rules.length})` : ''}
              </button>
              <button
                type="button"
                aria-label="Raw .env mode"
                onClick={() => handleModeSwitch('raw')}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  editorMode === 'raw'
                    ? 'bg-primary text-primary-contrast'
                    : 'text-muted hover:text-text'
                }`}
              >
                Raw .env
              </button>
            </div>

            {/* Auto-save status feedback */}
            <div className="flex items-center text-[11px] h-5 min-w-[60px]" aria-live="polite">
              {saving ? (
                <span className="flex items-center gap-1 text-muted">
                  <Spinner className="h-3 w-3" /> Saving...
                </span>
              ) : savedSuccess ? (
                <span className="flex items-center gap-1 text-success font-medium">
                  Saved ✓
                </span>
              ) : null}
            </div>
          </div>

          {/* Action Buttons with clear spacing */}
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => setImportOpen(true)}
              aria-label="Import .env"
              className="flex items-center gap-1.5 text-xs"
            >
              <UploadIcon className="h-3 w-3" />
              Import
            </Button>
            <Button
              variant="secondary"
              onClick={() => setExportOpen(true)}
              aria-label="Export .env"
              className="flex items-center gap-1.5 text-xs"
            >
              <DownloadIcon className="h-3 w-3" />
              Export
            </Button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-danger/30 bg-danger/10 px-2.5 py-1.5 text-xs text-danger flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-danger hover:underline text-[10px]"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {/* Editor Body */}
      {editorMode === 'rules' ? (
        <ExtractionRulesList
          rules={rules}
          endpoints={endpoints}
          onToggleRule={handleToggleRule}
          onDeleteRule={handleDeleteRule}
          onAddRule={handleAddRule}
          onOpenAddModal={handleOpenAddRuleModal}
        />
      ) : editorMode === 'table' ? (
        <div className="flex flex-col gap-2">
          {vars.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-5 text-center">
              <p className="text-xs text-muted mb-2.5">No variables stored for this project yet.</p>
              <div className="flex items-center justify-center gap-2">
                <Button variant="secondary" onClick={addVar}>
                  + Add variable
                </Button>
                <Button variant="secondary" onClick={() => setImportOpen(true)}>
                  <UploadIcon className="h-3 w-3 mr-1" />
                  Import .env
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {vars.map((v, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="flex w-2/5 items-center gap-1.5">
                    <input
                      value={v.key}
                      onChange={(e) => updateVar(i, { key: e.target.value })}
                      onBlur={handleBlur}
                      placeholder="KEY"
                      aria-label={`Variable ${i + 1} name`}
                      className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2.5 py-1 font-mono text-xs text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    />
                    {(() => {
                      const trimmedKey = v.key.trim().toUpperCase()
                      if (!trimmedKey) return null
                      const refs = templateRefs[trimmedKey]
                      if (refs && refs.length > 0) {
                        return (
                          <span
                            title={`Used in ${refs.length} preset(s): ${refs.join(', ')}`}
                            className="shrink-0 rounded bg-success/15 px-1 py-0.5 font-mono text-[9px] font-medium text-success"
                          >
                            ✓{refs.length}
                          </span>
                        )
                      }
                      return (
                        <span
                          title="Not referenced in any presets"
                          className="shrink-0 rounded bg-surface px-1 py-0.5 font-mono text-[9px] text-muted"
                        >
                          unused
                        </span>
                      )
                    })()}
                  </div>
                  <div className="relative flex-1">
                    <input
                      type={v.isSecret && !v.revealed ? 'password' : 'text'}
                      value={v.value}
                      onChange={(e) => updateVar(i, { value: e.target.value })}
                      onBlur={handleBlur}
                      placeholder="value"
                      aria-label={`Variable ${i + 1} value`}
                      className={`w-full rounded-md border border-border bg-surface px-2.5 py-1 font-mono text-xs text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                        v.isSecret ? 'pr-7' : ''
                      }`}
                    />
                    {v.isSecret ? (
                      <button
                        type="button"
                        aria-label={v.revealed ? `Hide variable ${i + 1}` : `Reveal variable ${i + 1}`}
                        title={v.revealed ? 'Hide secret' : 'Reveal secret'}
                        onClick={() => updateVar(i, { revealed: !v.revealed })}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-text transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        {v.revealed ? (
                          <HideIcon className="h-3.5 w-3.5" />
                        ) : (
                          <RevealIcon className="h-3.5 w-3.5" />
                        )}
                      </button>
                    ) : null}
                  </div>

                  {/* Single Edit / Actions Menu Button at the end */}
                  <Menu
                    label={`Edit ${v.key || `Variable ${i + 1}`}`}
                    trigger={<EditIcon className="h-3.5 w-3.5 text-muted hover:text-text" />}
                    items={[
                      {
                        label: v.isSecret ? 'Mark as plain text' : 'Mark as secret',
                        icon: v.isSecret ? (
                          <UnlockIcon className="h-3.5 w-3.5 text-muted" />
                        ) : (
                          <LockIcon className="h-3.5 w-3.5 text-warning" />
                        ),
                        onSelect: () => updateVar(i, { isSecret: !v.isSecret }),
                      },
                      {
                        label: copiedVarIndex === i ? 'Copied!' : 'Copy value',
                        icon: (
                          <CopyIcon
                            className={`h-3.5 w-3.5 ${
                              copiedVarIndex === i ? 'text-success' : ''
                            }`}
                          />
                        ),
                        onSelect: () => {
                          copyText(v.value)
                          setCopiedVarIndex(i)
                          setTimeout(() => setCopiedVarIndex(null), 1500)
                        },
                      },
                      {
                        label: 'Delete variable',
                        icon: <DeleteIcon className="h-3.5 w-3.5 text-danger" />,
                        danger: true,
                        onSelect: () => removeVar(i),
                      },
                    ]}
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={addVar}
                className="self-start text-xs text-primary hover:underline pt-1"
              >
                + Add variable
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <textarea
            value={rawText}
            onChange={(e) => handleRawChange(e.target.value)}
            onBlur={handleBlur}
            rows={8}
            placeholder="KEY=value&#10;API_KEY=your_secret_token&#10;# Comments start with #"
            aria-label="Raw environment content"
            className="w-full rounded-md border border-border bg-surface p-2 font-mono text-xs text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
          <span className="text-[10px] text-muted">
            Keys containing TOKEN, SECRET, KEY, PASSWORD are automatically designated as secrets.
          </span>
        </div>
      )}

      {/* Import Modal */}
      {importOpen ? (
        <Dialog title="Import Environment Variables" onClose={() => setImportOpen(false)}>
          <div className="flex flex-col gap-3 p-3">
            <p className="text-xs text-muted">
              Paste standard <code className="font-mono text-primary">.env</code> format or Postman environment JSON:
            </p>
            <textarea
              rows={8}
              value={importInput}
              onChange={(e) => setImportInput(e.target.value)}
              placeholder="API_KEY=secret123&#10;BASE_URL=https://api.example.com"
              aria-label="Import text"
              className="w-full rounded-md border border-border bg-surface p-2 font-mono text-xs text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            {importStatus ? <span className="text-xs text-warning">{importStatus}</span> : null}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setImportOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => void handleImportParse()}>
                Import Variables
              </Button>
            </div>
          </div>
        </Dialog>
      ) : null}

      {/* Export Modal */}
      {exportOpen ? (
        <Dialog title="Export Environment Variables" onClose={() => setExportOpen(false)}>
          <div className="flex flex-col gap-3 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-text">Export Format</span>
              <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={maskSecretsInExport}
                  onChange={(e) => setMaskSecretsInExport(e.target.checked)}
                  className="rounded border-border"
                />
                Mask secret values
              </label>
            </div>

            <pre className="max-h-48 overflow-auto rounded border border-border bg-surface p-2 font-mono text-xs text-text">
              {serializeDotEnv(currentVariables, currentSecrets, {
                maskSecrets: maskSecretsInExport,
              }) || '# No variables defined'}
            </pre>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border">
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    const text = serializeDotEnv(currentVariables, currentSecrets, {
                      maskSecrets: maskSecretsInExport,
                    })
                    if (copyText(text)) {
                      setCopiedExport(true)
                      setTimeout(() => setCopiedExport(false), 1500)
                    }
                  }}
                >
                  {copiedExport ? <CopiedIcon className="h-3.5 w-3.5 text-success" /> : <CopyIcon className="h-3.5 w-3.5" />}
                  {copiedExport ? 'Copied' : 'Copy .env'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    const content = serializeDotEnv(currentVariables, currentSecrets, {
                      maskSecrets: maskSecretsInExport,
                    })
                    triggerDownload('.env', content, 'application/octet-stream')
                  }}
                >
                  <DownloadIcon className="h-3.5 w-3.5" />
                  .env file
                </Button>
              </div>

              <Button
                variant="secondary"
                onClick={() => {
                  const content = exportPostmanEnv(
                    activeEnv?.name ?? 'Project Variables',
                    currentVariables,
                    currentSecrets,
                    { maskSecrets: maskSecretsInExport },
                  )
                  triggerDownload(
                    'project.postman_environment.json',
                    content,
                    'application/json',
                  )
                }}
              >
                Postman JSON
              </Button>
            </div>
          </div>
        </Dialog>
      ) : null}
    </div>
  )
}

export const VariablesPanel = EnvironmentsPanel

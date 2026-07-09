import { useCallback, useEffect, useState } from 'react'
import type { Result } from '@/types'
import type { EventBus } from '@/core/events'
import { useEventBus } from '@/hooks'
import { Badge, Button, IconButton, Spinner, EditIcon, DeleteIcon } from '@/components'
import type { Environment } from '@/core/project'
import type { EnvironmentInput } from './env-service'

/** Surface EnvironmentsPanel needs from EnvironmentService (eases testing). */
export interface EnvironmentPanelService {
  list(): Promise<Result<Environment[]>>
  getActiveId(): Promise<string>
  switch(id: string): Promise<Result<Environment>>
  create(input: EnvironmentInput): Promise<Result<Environment>>
  update(id: string, patch: Partial<EnvironmentInput>): Promise<Result<Environment>>
  delete(id: string): Promise<Result<void>>
  listBuiltins(): ReadonlyArray<{ id: string; name: string }>
}

interface EnvironmentsPanelProps {
  service: EnvironmentPanelService
  bus: EventBus
}

interface VarRow {
  key: string
  value: string
}

function toRows(variables: Record<string, string>): VarRow[] {
  return Object.entries(variables).map(([key, value]) => ({ key, value }))
}

export function EnvironmentsPanel({ service, bus }: EnvironmentsPanelProps) {
  const [environments, setEnvironments] = useState<Environment[]>([])
  const [activeId, setActiveId] = useState('default')
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [vars, setVars] = useState<VarRow[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [list, active] = await Promise.all([service.list(), service.getActiveId()])
    setEnvironments(list.ok ? list.value : [])
    setActiveId(active)
    setLoading(false)
  }, [service])

  useEffect(() => {
    setLoading(true)
    void load()
  }, [load])

  useEventBus(bus, 'ENVIRONMENT_CHANGED', () => void load())
  useEventBus(bus, 'ENVIRONMENT_CREATED', () => void load())
  useEventBus(bus, 'ENVIRONMENT_DELETED', () => void load())

  const existingNames = new Set(environments.map((e) => e.name.toLowerCase()))
  const suggestions = service.listBuiltins().filter((b) => !existingNames.has(b.name.toLowerCase()))

  const resetForm = () => {
    setEditingId(null)
    setName('')
    setBaseUrl('')
    setVars([])
    setError(null)
  }

  const startEdit = (env: Environment) => {
    setEditingId(env.id)
    setName(env.name)
    setBaseUrl(env.baseUrl)
    setVars(toRows(env.variables))
    setError(null)
  }

  const submit = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    const variables = Object.fromEntries(
      vars.filter((v) => v.key.trim()).map((v) => [v.key.trim(), v.value]),
    )
    const patch = { name: trimmed, baseUrl: baseUrl.trim(), variables }
    const result = editingId ? await service.update(editingId, patch) : await service.create(patch)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    resetForm()
    await load()
  }

  if (loading) {
    return (
      <div className="flex justify-center p-6">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <ul className="flex flex-col gap-1">
        {environments.map((env) => {
          const isActive = env.id === activeId
          return (
            <li
              key={env.id}
              className="flex items-center gap-2 rounded-md border border-border px-2 py-1"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-xs font-medium text-text">{env.name}</span>
                  {isActive ? <Badge kind="success">active</Badge> : null}
                  {Object.keys(env.variables).length > 0 ? (
                    <Badge kind="info">{Object.keys(env.variables).length} vars</Badge>
                  ) : null}
                </div>
                {env.baseUrl ? (
                  <div className="truncate font-mono text-[11px] text-muted">{env.baseUrl}</div>
                ) : null}
              </div>
              {!isActive ? (
                <Button variant="secondary" onClick={() => void service.switch(env.id)}>
                  Switch
                </Button>
              ) : null}
              <IconButton label={`Edit ${env.name}`} onClick={() => startEdit(env)}>
                <EditIcon />
              </IconButton>
              {env.id !== 'default' ? (
                <IconButton
                  label={`Delete ${env.name}`}
                  onClick={() => void service.delete(env.id)}
                >
                  <DeleteIcon />
                </IconButton>
              ) : null}
            </li>
          )
        })}
      </ul>

      {suggestions.length > 0 && !editingId ? (
        <div className="flex flex-wrap gap-1">
          {suggestions.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => void service.create({ name: b.name })}
              className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted hover:bg-surface hover:text-text"
            >
              + {b.name}
            </button>
          ))}
        </div>
      ) : null}

      <hr className="border-border" />

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-text">
            {editingId ? `Edit environment` : 'New environment'}
          </span>
          {editingId ? (
            <button
              type="button"
              onClick={resetForm}
              className="text-[11px] text-muted hover:underline"
            >
              Cancel
            </button>
          ) : null}
        </div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (e.g. Staging)"
          aria-label="Environment name"
          className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
        <input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="Base URL (optional)"
          aria-label="Base URL"
          className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
        {vars.map((row, i) => (
          <div key={i} className="flex gap-1">
            <input
              value={row.key}
              onChange={(e) =>
                setVars(vars.map((v, j) => (j === i ? { ...v, key: e.target.value } : v)))
              }
              placeholder="VAR_NAME"
              aria-label={`Variable ${i + 1} name`}
              className="w-1/2 rounded-md border border-border bg-surface px-2 py-1 font-mono text-[11px] text-text"
            />
            <input
              value={row.value}
              onChange={(e) =>
                setVars(vars.map((v, j) => (j === i ? { ...v, value: e.target.value } : v)))
              }
              placeholder="value"
              aria-label={`Variable ${i + 1} value`}
              className="w-1/2 rounded-md border border-border bg-surface px-2 py-1 font-mono text-[11px] text-text"
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() => setVars([...vars, { key: '', value: '' }])}
          className="self-start text-[11px] text-primary hover:underline"
        >
          + Add variable
        </button>
        {error ? <p className="text-xs text-danger">{error}</p> : null}
        <Button variant="primary" onClick={() => void submit()} disabled={!name.trim()}>
          {editingId ? 'Save changes' : 'Create environment'}
        </Button>
      </div>
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import type { EventBus } from '@/core/events'
import { useEventBus } from '@/hooks'
import type { Environment } from '@/core/project'
import type { EnvironmentPanelService } from '@/modules/environment'
import { EnvIcon } from './icons'

export interface EnvironmentSwitcherProps {
  service: EnvironmentPanelService
  bus: EventBus
  activeId: string
  className?: string
}

export function EnvironmentSwitcher({
  service,
  bus,
  activeId,
  className = '',
}: EnvironmentSwitcherProps) {
  const [environments, setEnvironments] = useState<Environment[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const list = await service.list()
    if (list.ok) {
      setEnvironments(list.value)
    }
    setLoading(false)
  }, [service])

  useEffect(() => {
    void load()
  }, [load])

  useEventBus(bus, 'ENVIRONMENT_CHANGED', () => void load())
  useEventBus(bus, 'ENVIRONMENT_CREATED', () => void load())
  useEventBus(bus, 'ENVIRONMENT_DELETED', () => void load())

  const handleSwitch = (id: string) => {
    if (id && id !== activeId) {
      void service.switch?.(id)
    }
  }

  if (loading && environments.length === 0) {
    return null
  }

  return (
    <div
      className={`flex items-center gap-1 rounded-md border border-border bg-surface px-1.5 py-0.5 text-text shadow-sm ${className}`}
      title="Active Environment"
    >
      <EnvIcon className="h-3.5 w-3.5 text-muted shrink-0" />
      <select
        aria-label="Select environment"
        value={activeId}
        onChange={(e) => handleSwitch(e.target.value)}
        className="bg-transparent text-[11px] font-medium text-text outline-none cursor-pointer max-w-[120px] truncate"
      >
        {environments.length === 0 ? (
          <option value={activeId}>{activeId}</option>
        ) : (
          environments.map((env) => (
            <option key={env.id} value={env.id} className="bg-bg text-text">
              {env.name}
            </option>
          ))
        )}
      </select>
    </div>
  )
}

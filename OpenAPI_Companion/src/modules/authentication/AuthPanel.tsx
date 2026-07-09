import { useCallback, useEffect, useState } from 'react'
import type { Result } from '@/types'
import type { EventBus } from '@/core/events'
import { useEventBus } from '@/hooks'
import {
  Badge,
  Button,
  EmptyState,
  IconButton,
  Spinner,
  AuthIcon,
  RevealIcon,
  HideIcon,
} from '@/components'
import type { AuthRecord, AuthStatus } from './types'

/** Just the surface AuthPanel needs from AuthenticationService (eases testing). */
export interface AuthPanelService {
  current(environmentId: string): Promise<Result<AuthRecord | null>>
  clear(environmentId: string): Promise<Result<void>>
}

interface AuthPanelProps {
  service: AuthPanelService
  bus: EventBus
  environmentId: string
}

function statusOf(record: AuthRecord | null): AuthStatus {
  if (!record) return 'none'
  if (record.expiresAt != null && record.expiresAt <= Date.now()) return 'expired'
  return 'authorized'
}

function mask(token: string): string {
  const tail = token.slice(-4)
  return `${'•'.repeat(Math.min(12, Math.max(4, token.length - 4)))}${tail}`
}

export function AuthPanel({ service, bus, environmentId }: AuthPanelProps) {
  const [record, setRecord] = useState<AuthRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [revealed, setRevealed] = useState(false)

  const load = useCallback(async () => {
    const result = await service.current(environmentId)
    setRecord(result.ok ? result.value : null)
    setLoading(false)
  }, [service, environmentId])

  useEffect(() => {
    setLoading(true)
    void load()
  }, [load])

  useEventBus(bus, 'AUTH_UPDATED', () => void load())
  useEventBus(bus, 'AUTH_RESTORED', () => void load())
  useEventBus(bus, 'AUTH_CLEARED', () => void load())
  useEventBus(bus, 'AUTH_EXPIRED', () => void load())

  const status = statusOf(record)

  if (loading) {
    return (
      <div className="flex justify-center p-6">
        <Spinner />
      </div>
    )
  }

  if (!record) {
    return (
      <EmptyState
        icon={<AuthIcon className="h-8 w-8 text-muted" />}
        title="Not authorized"
        message="Use Swagger's Authorize button — your credential is saved and restored automatically on refresh."
      />
    )
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-text">Authentication</span>
        {status === 'expired' ? (
          <Badge kind="warning">Expired</Badge>
        ) : (
          <Badge kind="success">Authorized</Badge>
        )}
      </div>

      <div className="flex items-center gap-2 text-xs text-muted">
        <Badge kind="info">{record.type}</Badge>
        {record.schemeName ? <span className="font-mono">{record.schemeName}</span> : null}
      </div>

      <div className="flex items-center gap-2 rounded-md border border-border bg-surface px-2 py-1">
        <code
          className="flex-1 truncate font-mono text-[11px] text-text"
          aria-label="Stored credential"
        >
          {revealed ? record.token : mask(record.token)}
        </code>
        <IconButton
          label={revealed ? 'Hide credential' : 'Show credential'}
          onClick={() => setRevealed((v) => !v)}
        >
          {revealed ? <HideIcon /> : <RevealIcon />}
        </IconButton>
      </div>

      {status === 'expired' ? (
        <p className="text-xs text-warning">
          Token expired — re-authorize in Swagger to refresh it.
        </p>
      ) : null}

      <Button
        variant="danger"
        onClick={() => {
          void service.clear(environmentId)
        }}
      >
        Clear authentication
      </Button>
    </div>
  )
}

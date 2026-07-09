import type { ReactNode } from 'react'
import { Button } from './Button'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  message?: string
  actionLabel?: string
  onAction?: () => void
}

/** Always offers the next action when there's nothing to show (planning/09 §Cross-Screen). */
export function EmptyState({ icon, title, message, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
      {icon ? <div className="text-2xl">{icon}</div> : null}
      <p className="text-sm font-medium text-text">{title}</p>
      {message ? <p className="text-xs text-muted">{message}</p> : null}
      {actionLabel && onAction ? (
        <Button variant="primary" onClick={onAction} className="mt-1">
          {actionLabel}
        </Button>
      ) : null}
    </div>
  )
}

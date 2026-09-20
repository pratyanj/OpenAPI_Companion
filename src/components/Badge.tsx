import type { ReactNode } from 'react'
import { cn } from '@/utils'

export type BadgeKind = 'success' | 'warning' | 'error' | 'info' | 'neutral'

const kinds: Record<BadgeKind, string> = {
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  error: 'bg-danger/15 text-danger',
  info: 'bg-primary/15 text-primary',
  neutral: 'bg-surface text-muted',
}

export function Badge({
  kind = 'neutral',
  className,
  children,
}: {
  kind?: BadgeKind
  className?: string
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium',
        kinds[kind],
        className,
      )}
    >
      {children}
    </span>
  )
}

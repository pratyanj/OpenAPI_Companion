import type { ComponentType } from 'react'
import { cn } from '@/utils'
import { IconButton } from './IconButton'
import { CloseIcon, ToastSuccessIcon, ToastWarningIcon, ToastErrorIcon } from './icons'
import type { ToastKind } from '@/services'

export interface ToastItem {
  id: number
  kind: ToastKind
  message: string
}

const icons: Record<ToastKind, ComponentType<{ className?: string }>> = {
  success: ToastSuccessIcon,
  warning: ToastWarningIcon,
  error: ToastErrorIcon,
}
const iconColor: Record<ToastKind, string> = {
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-danger',
}
const accents: Record<ToastKind, string> = {
  success: 'border-l-success',
  warning: 'border-l-warning',
  error: 'border-l-danger',
}

export function Toast({ kind, message, onDismiss }: ToastItem & { onDismiss: () => void }) {
  const KindIcon = icons[kind]
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-md border border-border border-l-4 bg-surface px-3 py-2 shadow-lg',
        accents[kind],
      )}
    >
      <KindIcon className={cn('mt-0.5 h-4 w-4 shrink-0', iconColor[kind])} />
      <p className="flex-1 text-xs text-text">{message}</p>
      <IconButton label="Dismiss" onClick={onDismiss} className="h-5 w-5">
        <CloseIcon className="h-3.5 w-3.5" />
      </IconButton>
    </div>
  )
}

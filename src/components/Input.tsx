import type { ComponentProps } from 'react'
import { cn } from '@/utils'

/**
 * Reusable input component with consistent styling, supporting error/warning states.
 * Matches the styling used in RequestsPanel, PresetEditorModal, HistoryPanel, and AuthPanel.
 */
export type InputProps = ComponentProps<'input'> & {
  /** Optional label for accessibility */
  label?: string
  /** Error state: true for red border, or string for error message rendered below */
  error?: string | boolean | null
  /** Warning state: true for amber border, or string for warning message rendered below */
  warning?: string | boolean | null
}

export function Input({ label, error, warning, className, ...props }: InputProps) {
  const hasError = Boolean(error)
  const hasWarning = !hasError && Boolean(warning)

  const inputEl = (
    <input
      {...props}
      className={cn(
        'flex-1 rounded-md border bg-surface px-2.5 py-1.5 text-xs text-text transition-colors focus:outline-none focus-visible:ring-1',
        hasError
          ? 'border-destructive focus-visible:ring-destructive text-destructive'
          : hasWarning
            ? 'border-amber-500/80 focus-visible:ring-amber-500'
            : 'border-border focus-visible:ring-primary',
        className,
      )}
    />
  )

  if (!label && !error && !warning) {
    return inputEl
  }

  return (
    <div className="flex flex-col gap-1 w-full">
      {label && (
        <label htmlFor={props.id} className="text-[11px] font-medium text-text">
          {label}
        </label>
      )}
      {inputEl}
      {typeof error === 'string' && error && (
        <span className="text-[11px] text-destructive flex items-center gap-1 font-medium">
          <span>⚠️</span>
          <span>{error}</span>
        </span>
      )}
      {typeof warning === 'string' && warning && (
        <span className="text-[11px] text-amber-500 flex items-center gap-1">
          <span>⚠️</span>
          <span>{warning}</span>
        </span>
      )}
    </div>
  )
}

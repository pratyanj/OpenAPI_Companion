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
          ? 'border-danger focus-visible:ring-danger text-danger'
          : hasWarning
            ? 'border-yellow-500/80 bg-yellow-500/5 focus-visible:ring-yellow-500'
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
        <span className="text-[11px] text-danger dark:text-red-300 bg-red-500/10 border border-red-500/30 px-2 py-1 rounded flex items-center gap-1.5 font-medium">
          <span className="shrink-0">⚠️</span>
          <span>{error}</span>
        </span>
      )}
      {typeof warning === 'string' && warning && (
        <span className="text-[11px] text-yellow-900 dark:text-yellow-100 bg-yellow-500/20 border border-yellow-500/40 px-2 py-1 rounded flex items-center gap-1.5">
          <span className="shrink-0">⚠️</span>
          <span>{warning}</span>
        </span>
      )}
    </div>
  )
}

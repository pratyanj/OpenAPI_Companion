import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/utils'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required — icon-only buttons must be labelled for accessibility (WCAG 2.1 AA). */
  label: string
  children: ReactNode
}

export function IconButton({ label, className, children, ...rest }: IconButtonProps) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded-md text-muted transition',
        'hover:bg-surface hover:text-text',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

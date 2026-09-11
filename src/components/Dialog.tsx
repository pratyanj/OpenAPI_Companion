import { useEffect, useRef, type ReactNode } from 'react'
import { IconButton } from './IconButton'
import { CloseIcon } from './icons'
import { cn } from '@/utils/cn'

/**
 * Panel max-width: `lg` (default) for confirms, `xl` for endpoint search, `full`
 * for content that should use every pixel available (e.g. JSON bodies in the
 * side panel — which the user can widen by dragging the panel edge).
 */
export type DialogSize = 'lg' | 'xl' | 'full'
/** Vertical placement: `center` (default) for detail/confirm, `top` for palettes. */
export type DialogAlign = 'center' | 'top'

interface DialogProps {
  title: string
  onClose: () => void
  children: ReactNode
  size?: DialogSize
  align?: DialogAlign
  /** Controls placed in the header, left of Close — for per-dialog actions. */
  actions?: ReactNode
  contentClassName?: string
}

const SIZE_CLASS: Record<DialogSize, string> = {
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
  full: 'max-w-none',
}

const ALIGN_CLASS: Record<DialogAlign, string> = {
  center: 'items-center',
  top: 'items-start pt-[8vh]',
}

/**
 * Modal overlay (fixed, covers the viewport above the sidebar). Backdrop click
 * and Escape close it; content click is contained (planning/09 §11). Rendered
 * inside the content-script Shadow DOM but escapes to the viewport via `fixed`.
 *
 * Focus management (WCAG 2.1 §2.4.3): on open, focus moves into the dialog
 * (unless a child — e.g. the palette's autoFocus input — already claimed it);
 * on close, focus returns to the element that opened it.
 */
export function Dialog({
  title,
  onClose,
  children,
  size = 'lg',
  align = 'center',
  actions,
  contentClassName,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    // Resolve the focus context through the Shadow DOM boundary.
    const root = panel.getRootNode() as Document | ShadowRoot
    const opener = root.activeElement
    // Respect a child's autoFocus; otherwise take focus so Escape/Tab work.
    if (!panel.contains(root.activeElement)) panel.focus()
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      className={`fixed inset-0 z-[2147483647] flex ${ALIGN_CLASS[align]} justify-center bg-black/60 backdrop-blur-[1px] p-3 sm:p-4`}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`flex max-h-[85vh] w-full ${SIZE_CLASS[size]} flex-col overflow-hidden rounded-xl border border-border bg-bg text-text shadow-2xl focus:outline-none`}
      >
        <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5 bg-surface/30">
          <strong className="shrink-0 text-sm font-semibold">{title}</strong>
          <div className="flex min-w-0 items-center gap-1">
            {actions}
            <IconButton label="Close" onClick={onClose}>
              <CloseIcon />
            </IconButton>
          </div>
        </header>
        <div className={cn('overflow-auto p-4', contentClassName)}>{children}</div>
      </div>
    </div>
  )
}

import { useEffect, useRef, type ReactNode } from 'react'
import { IconButton } from './IconButton'
import { CloseIcon } from './icons'

interface DialogProps {
  title: string
  onClose: () => void
  children: ReactNode
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
export function Dialog({ title, onClose, children }: DialogProps) {
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
      className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/50 p-4"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-bg text-text shadow-2xl focus:outline-none"
      >
        <header className="flex items-center justify-between border-b border-border px-4 py-2">
          <strong className="text-sm">{title}</strong>
          <IconButton label="Close" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </header>
        <div className="overflow-auto p-4">{children}</div>
      </div>
    </div>
  )
}

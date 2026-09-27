/**
 * In-page "Share Feedback & Suggestions" Modal Overlay.
 *
 * Renders FeedbackModal directly in the page DOM inside a Shadow DOM host
 * (#oac-feedback-modal-host) as a spacious, viewport-centered modal overlay with
 * backdrop blur over the Swagger page, instead of being constrained inside the
 * narrow sidepanel column.
 */
import { StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import shadowCss from '@/styles/index.css?inline'
import { FeedbackModal } from '@/components/FeedbackModal'
import type { EventBus } from '@/core/events'

const HOST_ID = 'oac-feedback-modal-host'

export interface FeedbackModalOpenOptions {
  initialCategory?: 'feature' | 'bug' | 'general'
}

export interface FeedbackModalHandle {
  open(options?: FeedbackModalOpenOptions): void
  close(): void
  toggle(options?: FeedbackModalOpenOptions): void
  isOpen(): boolean
  themeRoot: HTMLElement
  destroy(): void
}

/** Inject the in-page Feedback overlay (closed). Renders nothing until opened. */
export function mountFeedbackModal(
  bus: EventBus,
  doc: Document = document,
): FeedbackModalHandle {
  doc.getElementById(HOST_ID)?.remove() // drop any stale host

  const host = doc.createElement('div')
  host.id = HOST_ID
  const shadow = host.attachShadow({ mode: 'open' })

  const style = doc.createElement('style')
  style.textContent = shadowCss
  const mount = doc.createElement('div')
  shadow.append(style, mount)
  ;(doc.body ?? doc.documentElement).append(host)

  const root: Root = createRoot(mount)
  let open = false
  let openCount = 0
  let currentCategory: 'feature' | 'bug' | 'general' = 'feature'

  function paint(): void {
    root.render(
      open ? (
        <StrictMode>
          <FeedbackModal
            key={`feedback-modal-${openCount}`}
            isOpen={open}
            initialCategory={currentCategory}
            onClose={closeModal}
            onToast={(message, kind) =>
              bus.publish('NOTIFY', { message, kind: kind ?? 'success' })
            }
          />
        </StrictMode>
      ) : null,
    )
  }

  function closeModal(): void {
    if (!open) return
    open = false
    paint()
  }

  return {
    open: (options?: FeedbackModalOpenOptions) => {
      openCount++
      if (options?.initialCategory) {
        currentCategory = options.initialCategory
      }
      open = true
      paint()
    },
    close: closeModal,
    toggle: (options?: FeedbackModalOpenOptions) => {
      if (open) {
        closeModal()
      } else {
        openCount++
        if (options?.initialCategory) {
          currentCategory = options.initialCategory
        }
        open = true
        paint()
      }
    },
    isOpen: () => open,
    themeRoot: mount,
    destroy: () => {
      closeModal()
      root.unmount()
      host.remove()
    },
  }
}

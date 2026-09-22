/**
 * In-page Keyboard Shortcuts Modal Overlay.
 *
 * Renders the Keyboard Shortcuts modal in the PAGE as a top-centered overlay
 * inside a Shadow DOM (#oac-shortcuts-host) so our styles and Swagger UI's
 * cannot collide.
 */
import { StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import shadowCss from '@/styles/index.css?inline'
import { KeyboardShortcutsModal } from '@/modules/shortcuts'
import type { SettingsApi } from '@/modules/settings/settings-service'
import type { EventBus } from '@/core/events'

const HOST_ID = 'oac-shortcuts-host'

export interface ShortcutsModalHandle {
  open(): void
  close(): void
  toggle(): void
  isOpen(): boolean
  themeRoot: HTMLElement
  destroy(): void
}

/** Inject the in-page keyboard shortcuts overlay (closed). Renders nothing until opened. */
export function mountShortcutsModal(
  settings: SettingsApi,
  bus: EventBus,
  doc: Document = document,
): ShortcutsModalHandle {
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

  function paint(): void {
    root.render(
      open ? (
        <StrictMode>
          <KeyboardShortcutsModal
            key={`shortcuts-modal-${openCount}`}
            isOpen={open}
            settings={settings}
            bus={bus}
            onClose={closeModal}
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
    open: () => {
      openCount++
      open = true
      paint()
    },
    close: closeModal,
    toggle: () => {
      if (open) {
        closeModal()
      } else {
        openCount++
        open = true
        paint()
      }
    },
    isOpen: () => open,
    themeRoot: mount,
    destroy: () => {
      root.unmount()
      host.remove()
    },
  }
}

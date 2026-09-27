/**
 * In-page Quick Variable Modal Overlay.
 *
 * Renders the QuickVariableModal directly in the page DOM inside a Shadow DOM host
 * (#oac-variables-host) so that developers testing inside native Swagger UI can press
 * Alt+V (or ⌥V on macOS) to instantly inspect, search, add, and edit project variables
 * with immediate auto-save.
 */
import { StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import shadowCss from '@/styles/index.css?inline'
import { QuickVariableModal, type EnvironmentPanelService } from '@/modules/environment'
import type { EventBus } from '@/core/events'

const HOST_ID = 'oac-variables-host'

export interface VariablesModalOpenOptions {
  envId?: string
}

export interface VariablesModalHandle {
  open(options?: VariablesModalOpenOptions): void
  close(): void
  toggle(options?: VariablesModalOpenOptions): void
  isOpen(): boolean
  themeRoot: HTMLElement
  destroy(): void
}

/** Inject the in-page Quick Variables overlay (closed). Renders nothing until opened. */
export function mountVariablesModal(
  envService: EnvironmentPanelService,
  bus: EventBus,
  doc: Document = document,
): VariablesModalHandle {
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
  let currentEnvId: string | undefined = undefined

  function paint(): void {
    root.render(
      open ? (
        <StrictMode>
          <QuickVariableModal
            key={`variables-modal-${openCount}`}
            service={envService}
            bus={bus}
            initialEnvId={currentEnvId}
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
    open(options?: VariablesModalOpenOptions): void {
      if (options?.envId) {
        currentEnvId = options.envId
      }
      openCount++
      open = true
      paint()
    },
    close: closeModal,
    toggle(options?: VariablesModalOpenOptions): void {
      if (open) {
        closeModal()
      } else {
        if (options?.envId) {
          currentEnvId = options.envId
        }
        openCount++
        open = true
        paint()
      }
    },
    isOpen: () => open,
    themeRoot: mount,
    destroy(): void {
      closeModal()
      root.unmount()
      host.remove()
    },
  }
}

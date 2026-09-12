/**
 * In-page "Save Response to Variable" Modal Overlay.
 *
 * Renders the SaveToVariableDialog directly in the page DOM inside a Shadow DOM host
 * (#oac-save-variable-host) so that developers testing inside native Swagger UI can click
 * "Save to Variable" on any response without having to navigate to the narrow side panel.
 */
import { StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import shadowCss from '@/styles/index.css?inline'
import { SaveToVariableDialog, type EnvironmentPanelService } from '@/modules/environment'
import type { EventBus } from '@/core/events'

const HOST_ID = 'oac-save-variable-host'

export interface SaveVariableModalOpenOptions {
  responseBody: string
  endpointId?: string
  initialProperty?: string
  initialValue?: string
  onSaved?: (variableName: string, value: string) => void
}

export interface SaveVariableModalHandle {
  open(options: SaveVariableModalOpenOptions): void
  close(): void
  isOpen(): boolean
  themeRoot: HTMLElement
  destroy(): void
}

/** Inject the in-page Save Variable overlay (closed). Renders nothing until opened. */
export function mountSaveVariableModal(
  envService: EnvironmentPanelService,
  bus: EventBus,
  doc: Document = document,
): SaveVariableModalHandle {
  doc.getElementById(HOST_ID)?.remove()

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
  let currentOptions: SaveVariableModalOpenOptions = { responseBody: '' }

  function paint(): void {
    root.render(
      open ? (
        <StrictMode>
          <SaveToVariableDialog
            key={`save-var-${openCount}`}
            responseBody={currentOptions.responseBody}
            service={envService}
            endpointId={currentOptions.endpointId}
            initialProperty={currentOptions.initialProperty}
            initialValue={currentOptions.initialValue}
            bus={bus}
            onClose={closeModal}
            onSaved={(varName, val) => {
              currentOptions.onSaved?.(varName, val)
              closeModal()
            }}
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
    open(options: SaveVariableModalOpenOptions): void {
      currentOptions = options
      openCount++
      open = true
      paint()
    },
    close: closeModal,
    isOpen: () => open,
    themeRoot: mount,
    destroy(): void {
      closeModal()
      root.unmount()
      host.remove()
    },
  }
}

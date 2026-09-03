/**
 * In-page Request Preset Editor.
 *
 * Like the command palette, the side panel is physically constrained to a narrow
 * ~380px column. Editing complex JSON request bodies with variable autocompletion
 * requires ample horizontal and vertical room.
 *
 * This content script module renders the Preset Editor in the PAGE as a top-centered
 * overlay inside a Shadow DOM (#oac-preset-editor-host) so our styles and Swagger UI's
 * cannot collide.
 */
import { StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import shadowCss from '@/styles/index.css?inline'
import { PresetEditorModal } from '@/modules/request'
import type { RequestPanelService, RequestTemplate } from '@/modules/request'
import type { EnvironmentPanelService } from '@/modules/environment'
import type { EventBus } from '@/core/events'

const HOST_ID = 'oac-preset-editor-host'

export interface PresetEditorOpenOptions {
  template?: RequestTemplate | null
  initialEndpointId?: string
  initialBody?: string
  initialName?: string
}

export interface PresetEditorHandle {
  open(options?: PresetEditorOpenOptions): void
  close(): void
  isOpen(): boolean
  themeRoot: HTMLElement
  destroy(): void
}

/** Inject the in-page preset editor overlay (closed). Renders nothing until opened. */
export function mountPresetEditor(
  requestService: RequestPanelService,
  envService: EnvironmentPanelService | undefined,
  bus: EventBus,
  environmentId: string,
  doc: Document = document,
): PresetEditorHandle {
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
  let currentOptions: PresetEditorOpenOptions = {}

  function paint(): void {
    root.render(
      open ? (
        <StrictMode>
          <PresetEditorModal
            service={requestService}
            environmentService={envService}
            bus={bus}
            environmentId={environmentId}
            template={currentOptions.template}
            initialEndpointId={currentOptions.initialEndpointId}
            initialBody={currentOptions.initialBody}
            initialName={currentOptions.initialName}
            onClose={closeEditor}
            onSaved={() => {
              closeEditor()
            }}
          />
        </StrictMode>
      ) : null,
    )
  }

  function closeEditor(): void {
    if (!open) return
    open = false
    paint()
  }

  return {
    open: (options: PresetEditorOpenOptions = {}) => {
      currentOptions = options
      open = true
      paint()
    },
    close: closeEditor,
    isOpen: () => open,
    themeRoot: mount,
    destroy: () => {
      root.unmount()
      host.remove()
    },
  }
}

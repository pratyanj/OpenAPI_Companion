/**
 * In-page Auto-Extraction Rule Modal Overlay.
 *
 * Like the command palette, preset editor, and history detail, the side panel is physically
 * constrained to a narrow ~380px column. Configuring endpoints, property paths, variable
 * names, and quick presets requires ample horizontal room.
 *
 * This content script module renders the Auto-Extraction Rule modal in the PAGE as a top-centered
 * overlay inside a Shadow DOM (#oac-extraction-rule-host) so our styles and Swagger UI's
 * cannot collide.
 */
import { StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import shadowCss from '@/styles/index.css?inline'
import { ExtractionRuleModal, type EnvironmentPanelService } from '@/modules/environment'
import type { EndpointInfo } from '@/adapters'
import type { EventBus } from '@/core/events'

const HOST_ID = 'oac-extraction-rule-host'

export interface ExtractionRuleModalOpenOptions {
  endpointId?: string
  property?: string
  targetVariable?: string
  isSecret?: boolean
}

export interface ExtractionRuleModalHandle {
  open(options?: ExtractionRuleModalOpenOptions): void
  close(): void
  isOpen(): boolean
  themeRoot: HTMLElement
  destroy(): void
}

/** Inject the in-page extraction rule overlay (closed). Renders nothing until opened. */
export function mountExtractionRuleModal(
  envService: EnvironmentPanelService,
  getEndpoints: () => EndpointInfo[],
  bus: EventBus,
  doc: Document = document,
): ExtractionRuleModalHandle {
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
  let currentOptions: ExtractionRuleModalOpenOptions = {}

  function paint(): void {
    const opts = currentOptions ?? {}
    let endpointsList: EndpointInfo[] = []
    try {
      endpointsList = (getEndpoints && getEndpoints()) || []
    } catch {
      endpointsList = []
    }

    root.render(
      open ? (
        <StrictMode>
          <ExtractionRuleModal
            key={`extraction-rule-${openCount}`}
            endpoints={endpointsList}
            initialEndpointId={opts.endpointId}
            initialProperty={opts.property}
            initialTargetVariable={opts.targetVariable}
            initialIsSecret={opts.isSecret}
            onClose={closeModal}
            onSave={async (rule) => {
              if (envService.saveRule) {
                const res = await envService.saveRule(rule)
                if (!res.ok) {
                  throw new Error(res.error.message || 'Failed to save rule')
                }
                bus.publish('NOTIFY', {
                  message: `⚡ Auto-extraction rule added for ${rule.endpointId}`,
                  kind: 'success',
                })
              }
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
    open: (options?: ExtractionRuleModalOpenOptions) => {
      openCount++
      currentOptions = options ?? {}
      open = true
      paint()
    },
    close: closeModal,
    isOpen: () => open,
    themeRoot: mount,
    destroy: () => {
      root.unmount()
      host.remove()
    },
  }
}

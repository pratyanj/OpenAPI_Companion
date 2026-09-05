/**
 * In-page History Request Detail Overlay.
 *
 * Like the command palette and preset editor, the side panel is physically
 * constrained to a narrow ~380px column. Inspecting large JSON requests, responses,
 * headers, and code snippets requires ample room.
 *
 * This content script module renders the Request Detail in the PAGE as a top-centered
 * overlay inside a Shadow DOM (#oac-history-detail-host) so our styles and Swagger UI's
 * cannot collide.
 */
import { StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import shadowCss from '@/styles/index.css?inline'
import { HistoryDetailModal } from '@/modules/history'
import type { HistoryPanelService } from '@/modules/history'
import type { EnvironmentPanelService } from '@/modules/environment'
import type { EventBus } from '@/core/events'

const HOST_ID = 'oac-history-detail-host'

export interface HistoryDetailHandle {
  open(historyId: string): void
  close(): void
  isOpen(): boolean
  themeRoot: HTMLElement
  destroy(): void
}

/** Inject the in-page history request detail overlay (closed). Renders nothing until opened. */
export function mountHistoryDetail(
  historyService: HistoryPanelService,
  envService: EnvironmentPanelService | undefined,
  bus: EventBus,
  baseUrl?: string,
  doc: Document = document,
): HistoryDetailHandle {
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
  let currentHistoryId: string | undefined

  function paint(): void {
    root.render(
      open && currentHistoryId ? (
        <StrictMode>
          <HistoryDetailModal
            key={`history-detail-${openCount}`}
            initialHistoryId={currentHistoryId}
            service={historyService}
            environmentService={envService}
            bus={bus}
            baseUrl={baseUrl}
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
    open: (historyId: string) => {
      openCount++
      currentHistoryId = historyId
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

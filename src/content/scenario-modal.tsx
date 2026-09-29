/**
 * In-page "Review Recorded Scenario" Modal Overlay.
 *
 * Renders ScenarioReviewModal directly in the page DOM inside a Shadow DOM host
 * (#oac-scenario-modal-host) as a spacious, viewport-centered modal overlay over
 * the Swagger page.
 */

import { StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import shadowCss from '@/styles/index.css?inline'
import { ScenarioReviewModal } from '@/components/ScenarioReviewModal'
import type { Scenario } from '@/modules/workflows/recorder/types'
import type { WorkflowsPanelService } from '@/modules/workflows/types'
import type { EventBus } from '@/core/events'

const HOST_ID = 'oac-scenario-modal-host'

export interface ScenarioModalHandle {
  open(scenario: Scenario): void
  close(): void
  isOpen(): boolean
  themeRoot: HTMLElement
  destroy(): void
}

export function mountScenarioModal(
  workflowsService: WorkflowsPanelService,
  bus: EventBus,
  doc: Document = document,
): ScenarioModalHandle {
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
  let currentScenario: Scenario | null = null

  function paint(): void {
    root.render(
      open && currentScenario ? (
        <StrictMode>
          <ScenarioReviewModal
            key={`scenario-modal-${openCount}`}
            isOpen={open}
            scenario={currentScenario}
            onClose={closeModal}
            onConvertToWorkflow={async (workflowInput) => {
              const res = await workflowsService.create(workflowInput)
              if (res.ok) {
                bus.publish('NOTIFY', {
                  message: `Workflow "${res.value.name}" created from recorded scenario!`,
                  kind: 'success',
                })
              } else {
                bus.publish('NOTIFY', {
                  message: `Failed to create workflow: ${res.error.message}`,
                  kind: 'error',
                })
              }
            }}
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
    open: (scenario: Scenario) => {
      openCount++
      currentScenario = scenario
      open = true
      paint()
    },
    close: closeModal,
    isOpen: () => open,
    themeRoot: mount,
    destroy: () => {
      closeModal()
      root.unmount()
      host.remove()
    },
  }
}

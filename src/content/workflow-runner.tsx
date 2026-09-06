/**
 * In-page Workflow Runner Overlay.
 *
 * Renders the live Scenario Runner timeline and execution progress directly in the PAGE
 * as a spacious, top-centered overlay inside a Shadow DOM (#oac-workflow-runner-host)
 * on top of Swagger UI.
 */
import { StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import shadowCss from '@/styles/index.css?inline'
import { WorkflowRunnerModal, type WorkflowsPanelService, type Workflow } from '@/modules/workflows'
import type { EventBus } from '@/core/events'

const HOST_ID = 'oac-workflow-runner-host'

export interface WorkflowRunnerOpenOptions {
  workflow: Workflow
  environmentId?: string
}

export interface WorkflowRunnerHandle {
  open(options: WorkflowRunnerOpenOptions): void
  close(): void
  isOpen(): boolean
  themeRoot: HTMLElement
  destroy(): void
}

/** Inject the in-page workflow runner overlay (closed). Renders nothing until opened. */
export function mountWorkflowRunner(
  workflowsService: WorkflowsPanelService,
  _bus: EventBus,
  doc: Document = document,
): WorkflowRunnerHandle {
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
  let currentOptions: WorkflowRunnerOpenOptions | null = null

  function paint(): void {
    root.render(
      open && currentOptions ? (
        <StrictMode>
          <WorkflowRunnerModal
            key={`wf-runner-${openCount}`}
            isOpen={open}
            workflow={currentOptions.workflow}
            environmentId={currentOptions.environmentId}
            onClose={closeRunner}
            onRun={(workflowId, options) => workflowsService.execute(workflowId, options)}
            onCancel={() => {
              workflowsService.cancelActiveExecution?.()
            }}
            bus={_bus}
          />
        </StrictMode>
      ) : null,
    )
  }

  function closeRunner(): void {
    if (!open) return
    open = false
    paint()
  }

  return {
    open: (options: WorkflowRunnerOpenOptions) => {
      openCount++
      currentOptions = options
      open = true
      paint()
    },
    close: closeRunner,
    isOpen: () => open,
    themeRoot: mount,
    destroy: () => {
      root.unmount()
      host.remove()
    },
  }
}

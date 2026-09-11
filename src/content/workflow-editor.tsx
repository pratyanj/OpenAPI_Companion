/**
 * In-page Workflow Editor Overlay.
 *
 * Like the command palette, preset editor, and history detail, the side panel is physically
 * constrained to a narrow ~380px column. Editing multi-step scenarios, request payloads,
 * parameters, and delays requires ample horizontal and vertical room.
 *
 * This content script module renders the Workflow Editor in the PAGE as a top-centered
 * overlay inside a Shadow DOM (#oac-workflow-editor-host) so our styles and Swagger UI's
 * cannot collide.
 */
import { StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import shadowCss from '@/styles/index.css?inline'
import { WorkflowEditorModal, type WorkflowsPanelService, type Workflow } from '@/modules/workflows'
import type { RequestPanelService, RequestTemplate } from '@/modules/request'
import type { EnvironmentPanelService } from '@/modules/environment'
import type { EndpointInfo } from '@/adapters'
import type { EventBus } from '@/core/events'

const HOST_ID = 'oac-workflow-editor-host'

export interface WorkflowEditorOpenOptions {
  workflow?: Workflow | null
}

export interface WorkflowEditorHandle {
  open(options?: WorkflowEditorOpenOptions): void
  close(): void
  isOpen(): boolean
  themeRoot: HTMLElement
  destroy(): void
}

/** Inject the in-page workflow editor overlay (closed). Renders nothing until opened. */
export function mountWorkflowEditor(
  workflowsService: WorkflowsPanelService,
  requestService: RequestPanelService | undefined,
  envService: EnvironmentPanelService | undefined,
  getEndpoints: () => EndpointInfo[],
  bus: EventBus,
  doc: Document = document,
): WorkflowEditorHandle {
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
  let currentOptions: WorkflowEditorOpenOptions = {}
  let cachedTemplates: RequestTemplate[] = []
  let cachedVars: Record<string, string> = {}

  async function loadData(): Promise<void> {
    try {
      if (requestService) {
        const tRes = await requestService.listTemplates()
        if (tRes.ok) cachedTemplates = tRes.value
      }
      if (envService) {
        const activeId = await envService.getActiveId()
        const envsRes = await envService.list()
        if (envsRes.ok) {
          const found = envsRes.value.find((e) => e.id === activeId) ?? envsRes.value[0]
          if (found) cachedVars = found.variables
        }
      }
    } catch {
      // ignore data load errors
    }
  }

  function paint(): void {
    let endpointsList: EndpointInfo[] = []
    try {
      endpointsList = (getEndpoints && getEndpoints()) || []
    } catch {
      endpointsList = []
    }

    root.render(
      open ? (
        <StrictMode>
          <WorkflowEditorModal
            key={`wf-editor-${openCount}`}
            isOpen={open}
            workflow={currentOptions.workflow}
            endpoints={endpointsList}
            variables={cachedVars}
            templates={cachedTemplates}
            requestService={requestService}
            getSwaggerDefaults={(epId) => requestService?.getSwaggerDefaults?.(epId)}
            getSwaggerDefaultsAsync={(epId) => requestService?.getSwaggerDefaultsAsync?.(epId)}
            onClose={closeEditor}
            onSave={async (input) => {
              if (currentOptions.workflow) {
                const res = await workflowsService.update(currentOptions.workflow.id, input)
                if (!res.ok) throw new Error(res.error.message)
                bus.publish('NOTIFY', {
                  message: `Workflow "${input.name}" updated`,
                  kind: 'success',
                })
              } else {
                const res = await workflowsService.create(input)
                if (!res.ok) throw new Error(res.error.message)
                bus.publish('NOTIFY', {
                  message: `Workflow "${input.name}" created`,
                  kind: 'success',
                })
              }
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
    open: (options: WorkflowEditorOpenOptions = {}) => {
      openCount++
      currentOptions = options
      open = true
      void loadData().then(() => paint())
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

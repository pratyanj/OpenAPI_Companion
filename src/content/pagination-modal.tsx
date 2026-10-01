import { StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import shadowCss from '@/styles/index.css?inline'
import { PaginationTesterModal } from '@/components/PaginationTesterModal'
import type { PaginationConfig, DetectedPagination } from '@/modules/pagination/types'
import type { PaginationRequestExecutor } from '@/modules/pagination/runner'
import type { WorkflowsPanelService } from '@/modules/workflows/types'
import type { EventBus } from '@/core/events'

const HOST_ID = 'oac-pagination-modal-host'

export interface OpenPaginationModalOptions {
  endpointId: string
  initialConfig?: Partial<PaginationConfig>
  detected?: DetectedPagination | null
  executor?: PaginationRequestExecutor
}

export interface PaginationModalHandle {
  open(options: OpenPaginationModalOptions): void
  close(): void
  isOpen(): boolean
  themeRoot: HTMLElement
  destroy(): void
}

export function mountPaginationModal(
  workflowsService?: WorkflowsPanelService,
  defaultExecutor?: PaginationRequestExecutor,
  bus?: EventBus,
  doc: Document = document,
): PaginationModalHandle {
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
  let currentOptions: OpenPaginationModalOptions | null = null

  function paint(): void {
    root.render(
      open && currentOptions ? (
        <StrictMode>
          <PaginationTesterModal
            key={`pagination-modal-${openCount}`}
            isOpen={open}
            endpointId={currentOptions.endpointId}
            initialConfig={currentOptions.initialConfig}
            detected={currentOptions.detected}
            executor={currentOptions.executor ?? defaultExecutor}
            onClose={closeModal}
            onSaveToWorkflow={
              workflowsService
                ? async (workflowInput) => {
                    const res = await workflowsService.create(workflowInput)
                    if (res.ok) {
                      bus?.publish('NOTIFY', {
                        message: `Workflow "${res.value.name}" created from pagination test!`,
                        kind: 'success',
                      })
                    } else {
                      bus?.publish('NOTIFY', {
                        message: `Failed to create workflow: ${res.error.message}`,
                        kind: 'error',
                      })
                    }
                  }
                : undefined
            }
            onToast={(message, kind) =>
              bus?.publish('NOTIFY', { message, kind: kind ?? 'success' })
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
    open: (options: OpenPaginationModalOptions) => {
      openCount++
      currentOptions = options
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

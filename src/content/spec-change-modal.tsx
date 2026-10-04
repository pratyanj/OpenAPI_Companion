import { StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import shadowCss from '@/styles/index.css?inline'
import { SpecChangeModal } from '@/components/SpecChangeModal'
import type { SpecDiffResult, NormalizedSpec } from '@/modules/spec-detector/types'
import type { SpecService } from '@/modules/spec-detector/spec-service'
import type { EventBus } from '@/core/events'

const HOST_ID = 'oac-spec-modal-host'

export interface OpenSpecChangeModalOptions {
  diff: SpecDiffResult
  newSpec: NormalizedSpec
  onAccept?: (newSpec: NormalizedSpec) => Promise<void> | void
}

export interface SpecChangeModalHandle {
  open(options: OpenSpecChangeModalOptions): void
  close(): void
  isOpen(): boolean
  themeRoot: HTMLElement
  destroy(): void
}

export function mountSpecChangeModal(
  specService?: SpecService,
  bus?: EventBus,
  onBaselineAccepted?: () => void,
  doc: Document = document,
): SpecChangeModalHandle {
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
  let currentOptions: OpenSpecChangeModalOptions | null = null

  function paint(): void {
    root.render(
      open && currentOptions ? (
        <StrictMode>
          <SpecChangeModal
            key={`spec-change-modal-${openCount}`}
            diff={currentOptions.diff}
            newSpec={currentOptions.newSpec}
            onClose={closeModal}
            onAccept={async (newSpec) => {
              if (currentOptions?.onAccept) {
                await currentOptions.onAccept(newSpec)
              } else if (specService) {
                await specService.acceptNewBaseline(newSpec)
              }
              bus?.publish('NOTIFY', {
                message: 'OpenAPI specification baseline updated successfully.',
                kind: 'success',
              })
              onBaselineAccepted?.()
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

  function openModal(options: OpenSpecChangeModalOptions): void {
    currentOptions = options
    open = true
    openCount++
    paint()
  }

  return {
    open: openModal,
    close: closeModal,
    isOpen: () => open,
    themeRoot: mount,
    destroy: () => {
      open = false
      try {
        root.unmount()
      } catch {
        // ignore
      }
      host.remove()
    },
  }
}

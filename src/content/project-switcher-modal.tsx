/**
 * In-page "Switch or Link Projects" Modal Overlay.
 *
 * Renders ProjectSwitcherModal directly in the page DOM inside a Shadow DOM host
 * (#oac-project-switcher-host) as a spacious, top-centered modal overlay instead of
 * being constrained inside the narrow sidepanel column.
 */
import { StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import shadowCss from '@/styles/index.css?inline'
import { ProjectSwitcherModal } from '@/components/ProjectSwitcherModal'
import type { ProjectMeta } from '@/core/project/types'
import type { RemoteProjectApi } from '@/sidepanel/bridge'
import type { EventBus } from '@/core/events'

const HOST_ID = 'oac-project-switcher-host'

export interface ProjectSwitcherModalHandle {
  open(): void
  close(): void
  toggle(): void
  isOpen(): boolean
  themeRoot: HTMLElement
  destroy(): void
}

/** Inject the in-page Project Switcher overlay (closed). Renders nothing until opened. */
export function mountProjectSwitcherModal(
  projectService: RemoteProjectApi,
  currentProject: ProjectMeta,
  bus: EventBus,
  doc: Document = document,
): ProjectSwitcherModalHandle {
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

  function paint(): void {
    root.render(
      open ? (
        <StrictMode>
          <ProjectSwitcherModal
            key={`project-switcher-${openCount}`}
            isOpen={open}
            onClose={closeModal}
            currentProject={currentProject}
            projectService={projectService}
            onProjectRenamed={(name) => {
              currentProject.name = name
              bus.publish('PROJECT_UPDATED', { projectId: currentProject.id, name })
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
    open: () => {
      openCount++
      open = true
      paint()
    },
    close: closeModal,
    toggle: () => {
      if (open) {
        closeModal()
      } else {
        openCount++
        open = true
        paint()
      }
    },
    isOpen: () => open,
    themeRoot: mount,
    destroy: () => {
      closeModal()
      root.unmount()
      host.remove()
    },
  }
}

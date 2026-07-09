/**
 * Toolbar popup entry. Minimal by design (DD-024, sidebar-first): shows status
 * and — later — a button to open/focus the sidebar. Uses Tailwind to exercise
 * the styling pipeline end-to-end during the bootstrap.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/styles/index.css'
import packageJson from '../../package.json'

function Popup() {
  return (
    <main className="min-w-[280px] bg-bg p-4 text-text">
      <h1 className="text-sm font-semibold">OpenAPI Companion</h1>
      <p className="mt-1 text-xs text-muted">v{packageJson.version} · foundation build</p>
      <p className="mt-3 text-xs text-muted">
        Open a Swagger UI page to activate the companion sidebar.
      </p>
    </main>
  )
}

const rootEl = document.getElementById('root')
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <Popup />
    </StrictMode>,
  )
}

import { defineManifest } from '@crxjs/vite-plugin'
import pkg from './package.json'

// MV3 manifest. Version is injected from package.json so the two never drift
// (planning/15_CI_CD.md §5). Permission set is fixed by DD-035:
// storage + activeTab + scripting + unlimitedStorage + downloads.
//
// NOTE (Phase 1 follow-up): auto-detecting Swagger on arbitrary sites needs a
// content-script host match. We start broad (http/https) and self-detect in
// code; whether this needs an explicit host permission beyond activeTab is a
// foundation decision to confirm during the SwaggerAdapter spike (T-01.11).
//
// NOTE (Side Panel Phase 2): the UI now lives in the side panel (a separate
// extension page) and reaches the in-page agent via `chrome.tabs.sendMessage`,
// which REQUIRES host permission for the target tab. `activeTab` only grants
// that transiently for the tab the user just invoked and does NOT survive tab
// switches — so the persistent panel needs standing `host_permissions`. These
// match the content-script patterns already declared below, so they add no new
// install warning ("read and change data on all sites" already applies).
export default defineManifest({
  manifest_version: 3,
  name: 'OpenAPI Companion',
  version: pkg.version,
  description: pkg.description,
  // Side Panel API needs Chrome 114+; programmatic `sidePanel.open()` (used by
  // the keyboard shortcut + in-page launcher) needs 116+.
  minimum_chrome_version: '116',
  permissions: ['storage', 'activeTab', 'unlimitedStorage', 'sidePanel'],
  host_permissions: ['http://*/*', 'https://*/*'],
  // Keyboard shortcut to open the side panel (rebindable at
  // chrome://extensions/shortcuts). Handled in the background worker.
  commands: {
    'open-side-panel': {
      suggested_key: { default: 'Ctrl+Shift+O', mac: 'Command+Shift+O' },
      description: 'Open the OpenAPI Companion side panel',
    },
  },
  // Compass logo (source: public/icons/icon.svg; regenerate via
  // `node scripts/generate-icons.mjs`). public/ is copied to the dist root.
  icons: {
    16: 'icons/icon-16.png',
    32: 'icons/icon-32.png',
    48: 'icons/icon-48.png',
    128: 'icons/icon-128.png',
  },
  action: {
    default_title: 'OpenAPI Companion',
    default_icon: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
  },
  // Native browser side panel; the toolbar icon opens it (see background worker).
  side_panel: {
    default_path: 'src/sidepanel/index.html',
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  // The in-page launcher button renders the app icon, so it must be reachable
  // from the page. (crxjs merges its own JS-chunk entries with this one.)
  web_accessible_resources: [
    {
      resources: ['icons/*.png'],
      matches: ['http://*/*', 'https://*/*'],
    },
  ],
  content_scripts: [
    {
      matches: ['http://*/*', 'https://*/*'],
      js: ['src/content/index.tsx'],
      run_at: 'document_idle',
    },
    {
      // Runs in the PAGE's world so it can read/write Swagger's `window.ui`,
      // relaying to the isolated script via postMessage (world isolation fix).
      matches: ['http://*/*', 'https://*/*'],
      js: ['src/content/main-world.ts'],
      run_at: 'document_idle',
      world: 'MAIN',
    },
  ],
})

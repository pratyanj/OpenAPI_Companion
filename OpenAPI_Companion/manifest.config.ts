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
export default defineManifest({
  manifest_version: 3,
  name: 'OpenAPI Companion',
  version: pkg.version,
  description: pkg.description,
  minimum_chrome_version: '110',
  permissions: ['storage', 'activeTab', 'scripting', 'unlimitedStorage', 'downloads'],
  // Compass logo (source: public/icons/icon.svg; regenerate via
  // `node scripts/generate-icons.mjs`). public/ is copied to the dist root.
  icons: {
    16: 'icons/icon-16.png',
    32: 'icons/icon-32.png',
    48: 'icons/icon-48.png',
    128: 'icons/icon-128.png',
  },
  action: {
    default_popup: 'src/popup/index.html',
    default_title: 'OpenAPI Companion',
    default_icon: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
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

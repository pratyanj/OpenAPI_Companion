import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import path from 'node:path'
import manifest from './manifest.config'

// MV3 build via CRXJS (T-00.1 spike outcome): handles manifest, multi-entry
// (background / content / popup) bundling, and HMR for the injected UI.
// Stamped into every build so a page running a STALE content script can be
// identified instantly: the agent logs its build id, and the panel compares the
// id the agent reports against its own. Reloading the extension does not replace
// content scripts in already-open tabs, which has repeatedly looked like "the
// feature is broken" when the tab simply needed a refresh.
const BUILD_ID = Date.now().toString(36)

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const feedbackEndpoint =
    env.VITE_FEEDBACK_ENDPOINT ||
    process.env.VITE_FEEDBACK_ENDPOINT ||
    'https://script.google.com/macros/s/AKfycbw8dcDzROWaN1ynzHtXl6nq8fl9MfOF-rPsfNHN10BQbOyC2Pt7kGlDKCl0NHlhfJ8/exec'

  return {
    define: {
      __BUILD_ID__: JSON.stringify(BUILD_ID),
      'process.env.VITE_FEEDBACK_ENDPOINT': JSON.stringify(feedbackEndpoint),
    },
    resolve: {
      alias: { '@': path.resolve(__dirname, 'src') },
    },
    plugins: [react(), crx({ manifest })],
    server: {
      port: 5173,
      strictPort: true,
      // CRXJS uses a websocket for content-script HMR
      hmr: { port: 5173 },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
  }
})

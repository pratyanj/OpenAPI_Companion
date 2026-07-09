import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import path from 'node:path'
import manifest from './manifest.config'

// MV3 build via CRXJS (T-00.1 spike outcome): handles manifest, multi-entry
// (background / content / popup) bundling, and HMR for the injected UI.
export default defineConfig({
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
})

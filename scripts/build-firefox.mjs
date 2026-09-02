#!/usr/bin/env node
/**
 * Produce a Firefox-loadable build from the Chrome `dist/`.
 *
 * The extension is built for Chrome with @crxjs/vite-plugin (`npm run build`).
 * Firefox needs a different manifest — no `chrome.sidePanel`, a `sidebar_action`
 * instead of `side_panel`, an event-page background instead of a service worker,
 * and `browser_specific_settings`. This copies `dist/` to `dist-firefox/` and
 * rewrites only the manifest; all built assets are reused as-is.
 *
 * Load it via Firefox → about:debugging → This Firefox → Load Temporary Add-on →
 * pick `dist-firefox/manifest.json`.
 *
 * ⚠️ Runtime behaviour on Firefox is NOT verified in CI (no Firefox). See
 * FIREFOX.md for what to check and the known crxjs caveats.
 */
import { readFileSync, writeFileSync, rmSync, cpSync, existsSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import esbuild from 'esbuild'
import { createZip } from './zip.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const src = resolve(root, 'dist')
const out = resolve(root, 'dist-firefox')

if (!existsSync(resolve(src, 'manifest.json'))) {
  console.error('dist/manifest.json not found — run `npm run build` first.')
  process.exit(1)
}

// Fresh copy of the Chrome build.
rmSync(out, { recursive: true, force: true })
cpSync(src, out, { recursive: true })

// The MAIN-world content script (writes into Swagger's window.ui) can't use
// crxjs's dynamic-import loader on Firefox: the page context is not allowed to
// `import()` a moz-extension:// resource, so the script never runs and auth is
// never written. Bundle it into ONE self-contained IIFE and reference it
// directly (no import()), which runs inline in Firefox's MAIN world.
const MAIN_WORLD_FILE = 'firefox-main-world.js'
await esbuild.build({
  entryPoints: [resolve(root, 'src/content/main-world.ts')],
  bundle: true,
  format: 'iife',
  target: ['firefox128'],
  alias: { '@': resolve(root, 'src') },
  outfile: resolve(out, MAIN_WORLD_FILE),
  legalComments: 'none',
  logLevel: 'warning',
})

const manifest = JSON.parse(readFileSync(resolve(src, 'manifest.json'), 'utf8'))

// Point the world:"MAIN" content script at the self-contained bundle.
for (const cs of manifest.content_scripts ?? []) {
  if (cs.world === 'MAIN') cs.js = [MAIN_WORLD_FILE]
}

// 1. Chrome-only keys.
delete manifest.minimum_chrome_version
manifest.permissions = (manifest.permissions ?? []).filter((p) => p !== 'sidePanel')
// contextMenus is needed on Firefox so the right-click menu can open the sidebar
// (sidebarAction.open() requires a direct user gesture; contextMenus.onClicked qualifies).
if (!manifest.permissions.includes('contextMenus')) {
  manifest.permissions.push('contextMenus')
}

// 2. side_panel → sidebar_action (Firefox's docked panel).
if (manifest.side_panel?.default_path) {
  manifest.sidebar_action = {
    default_panel: manifest.side_panel.default_path,
    default_title: manifest.name,
    default_icon: manifest.icons,
  }
}
delete manifest.side_panel

// 3. background service worker → event-page scripts (Firefox MV3).
if (manifest.background?.service_worker) {
  manifest.background = {
    scripts: [manifest.background.service_worker],
    type: manifest.background.type ?? 'module',
  }
}

// 4. Firefox add-on identity + minimum version (world:"MAIN" needs 128+)
//    + data_collection_permissions required for AMO submission.
manifest.browser_specific_settings = {
  gecko: {
    id: 'openapi-companion@pratyanj',
    strict_min_version: '128.0',
    data_collection_permissions: {
      required: ['none'],
    },
  },
}

// 5. Keyboard shortcut — Chrome's Ctrl+Shift+O conflicts with Firefox's
//    built-in "Bookmarks sidebar" shortcut. Replace it with Firefox's native
//    _execute_sidebar_action command, which the browser handles automatically
//    to toggle the sidebar_action without any background-script handler needed.
//    Ctrl+Alt+O is safe in Firefox (not reserved by any default browser action).
delete manifest.commands?.['open-side-panel']
manifest.commands = manifest.commands ?? {}
manifest.commands['_execute_sidebar_action'] = {
  suggested_key: { default: 'Ctrl+Alt+O', mac: 'Command+Alt+O' },
  description: 'Toggle OpenAPI Companion sidebar',
}

// 6. Remove Chrome-specific properties from web_accessible_resources.
for (const war of manifest.web_accessible_resources ?? []) {
  delete war.use_dynamic_url
}

writeFileSync(resolve(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')

console.log('Firefox build written to dist-firefox/')
console.log('  permissions   :', JSON.stringify(manifest.permissions))
console.log('  sidebar_action:', JSON.stringify(manifest.sidebar_action?.default_panel))
console.log('  background    :', JSON.stringify(manifest.background))
console.log('  gecko         :', JSON.stringify(manifest.browser_specific_settings.gecko))

// Package for AMO upload (zip files directly at the root of the archive with forward slashes).
const shareDir = resolve(root, 'share')
mkdirSync(shareDir, { recursive: true })
const firefoxZip = resolve(shareDir, `openapi-companion-${manifest.version}-firefox.zip`)
createZip(out, firefoxZip, (rel) => !rel.endsWith('.map'))

console.log(`\n✓ Firefox AMO release zip: ${firefoxZip}`)
console.log(
  '  Upload this zip file to https://addons.mozilla.org/developers/addon/submit/upload-listed'
)
console.log(
  '\nLoad: Firefox → about:debugging → Load Temporary Add-on → dist-firefox/manifest.json',
)

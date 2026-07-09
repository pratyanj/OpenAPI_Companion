/**
 * Package the built extension into a shareable zip for teammates to load
 * unpacked (no Chrome Web Store needed). Run `npm run package` — it builds
 * first, stages dist/ (minus source maps), drops an INSTALL.md for recipients,
 * and writes share/openapi-companion-<version>.zip.
 */
import { execSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync, statSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
const version = pkg.version

const shareDir = path.join(root, 'share')
const folderName = `openapi-companion-${version}`
const stageDir = path.join(shareDir, folderName)
const zipPath = path.join(shareDir, `${folderName}.zip`)

const INSTALL = `# OpenAPI Companion — team preview build v${version}

An unpacked Chrome extension. Works in any Chromium browser: Chrome, Edge,
Brave, Arc, Opera.

## Install (one time, ~30 seconds)

1. Unzip this file. You'll get a folder named "${folderName}".
   Keep it somewhere permanent (e.g. Documents) — the browser loads the
   extension straight from this folder, so don't delete or move it afterward.
2. Open your browser's extensions page:
     Chrome  -> chrome://extensions
     Edge    -> edge://extensions
     Brave   -> brave://extensions
3. Turn ON "Developer mode" (top-right toggle).
4. Click "Load unpacked" and select the "${folderName}" folder.
5. (Optional) Pin the OpenAPI Companion icon from the toolbar's puzzle menu.

## Try it

Open any Swagger UI / OpenAPI docs page — for example:
    https://petstore.swagger.io/
A sidebar appears on the right (Auth, Requests, Environments, History,
Fake Data, Settings). Press Cmd+K / Ctrl+K to search endpoints.

## Good to know

- It's a developer build, so the browser may show a "Disable developer mode
  extensions" prompt now and then — that's expected for unpacked extensions,
  just close it.
- It does NOT auto-update. To update to a newer build: replace this folder with
  the new one, then click the refresh/reload icon on the extension's card.
- Everything stays on your machine (local storage). Nothing is uploaded.
`

console.log(`Packaging ${folderName}…`)
rmSync(shareDir, { recursive: true, force: true })
mkdirSync(stageDir, { recursive: true })

// Stage the built extension, excluding source maps (smaller, cleaner share).
execSync(`rsync -a --exclude='*.map' "${path.join(root, 'dist')}/" "${stageDir}/"`)
writeFileSync(path.join(stageDir, 'INSTALL.md'), INSTALL)

// Zip so unzipping yields the "${folderName}" folder.
execSync(`cd "${shareDir}" && zip -r -q "${folderName}.zip" "${folderName}"`)

const mb = (statSync(zipPath).size / 1024 / 1024).toFixed(2)
console.log(`\n✓ ${path.relative(root, zipPath)}  (${mb} MB)`)
console.log('  Send that .zip to your team; they follow the steps in INSTALL.md.')

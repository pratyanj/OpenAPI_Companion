/**
 * Generate the MV3 PNG icon set (16/32/48/128) into public/icons/ using the
 * Playwright Chromium already installed for E2E.
 *
 * Source of truth: branding/logo-final.png (the PO-approved logo). Falls back
 * to public/icons/icon.svg if the PNG master is absent. Re-run after changing
 * the master:  node scripts/generate-icons.mjs
 */
import { chromium } from '@playwright/test'
import { readFile, access } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const pngMaster = path.join(root, 'branding/logo-final.png')
const svgMaster = path.join(root, 'public/icons/icon.svg')
const outDir = path.join(root, 'public/icons')
const SIZES = [16, 32, 48, 128]

const exists = (p) =>
  access(p).then(
    () => true,
    () => false,
  )

let content
if (await exists(pngMaster)) {
  const b64 = (await readFile(pngMaster)).toString('base64')
  content = (size) =>
    `<img src="data:image/png;base64,${b64}" style="display:block;width:${size}px;height:${size}px"/>`
  console.log('source: branding/logo-final.png')
} else {
  const svg = await readFile(svgMaster, 'utf8')
  content = (size) => `<style>svg{display:block;width:${size}px;height:${size}px}</style>${svg}`
  console.log('source: public/icons/icon.svg')
}

const browser = await chromium.launch()
const page = await browser.newPage()

for (const size of SIZES) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}img,svg{image-rendering:auto}</style>${content(size)}`,
  )
  const out = path.join(outDir, `icon-${size}.png`)
  await page.locator('img, svg').first().screenshot({ path: out, omitBackground: true })
  console.log(`wrote ${path.relative(root, out)}`)
}

await browser.close()

/**
 * Render every SVG in branding/logo-variants/ to preview PNGs (128 px + a
 * 16 px toolbar-size check). The shipped icon set in public/icons/ is NOT
 * touched — this is only for comparing logo candidates.
 *   node scripts/generate-logo-variants.mjs
 */
import { chromium } from '@playwright/test'
import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const dir = path.join(root, 'branding/logo-variants')
const SIZES = [128, 16]

const files = (await readdir(dir)).filter((f) => f.endsWith('.svg'))
const browser = await chromium.launch()
const page = await browser.newPage()

for (const file of files) {
  const svg = await readFile(path.join(dir, file), 'utf8')
  const base = file.replace(/\.svg$/, '')
  for (const size of SIZES) {
    await page.setViewportSize({ width: size, height: size })
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
    )
    const out = path.join(dir, `${base}-${size}.png`)
    await page.locator('svg').screenshot({ path: out, omitBackground: true })
    console.log(`wrote ${path.relative(root, out)}`)
  }
}

await browser.close()

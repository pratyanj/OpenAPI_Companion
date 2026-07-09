import { test as base, chromium, type BrowserContext } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pathToExtension = path.resolve(__dirname, '../../dist')

// Loads the BUILT unpacked extension into a persistent Chromium context.
// Run `npm run build` before `npm run test:e2e`.
export const test = base.extend<{
  context: BrowserContext
  extensionId: string
}>({
  context: async ({}, use) => {
    // `channel: 'chromium'` uses the full browser (new headless) which supports
    // MV3 extensions; the default headless-shell does not.
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
      ],
    })
    await use(context)
    await context.close()
  },
  extensionId: async ({ context }, use) => {
    let [sw] = context.serviceWorkers()
    if (!sw) sw = await context.waitForEvent('serviceworker')
    const extensionId = sw.url().split('/')[2] ?? ''
    await use(extensionId)
  },
})

export const expect = test.expect

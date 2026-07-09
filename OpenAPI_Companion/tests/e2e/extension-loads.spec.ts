import { test, expect } from './fixtures'

// Sprint 1 smoke (E2E-01/02, planning/13_TEST_PLAN.md §4): the built extension
// loads with a background service worker and the popup renders.
test('registers a background service worker', async ({ extensionId }) => {
  expect(extensionId).toBeTruthy()
})

test('popup renders the app name', async ({ context, extensionId }) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/src/popup/index.html`)
  await expect(page.getByRole('heading', { name: 'OpenAPI Companion' })).toBeVisible()
  await page.close()
})

import { test, expect } from './fixtures'

// Smoke (E2E-01/02, planning/13_TEST_PLAN.md §4): the built extension loads with
// a background service worker, and its UI page boots. The UI is the native side
// panel now — the toolbar popup was removed when the panel took over, so this
// used to 404 on a page the build no longer emits.
test('registers a background service worker', async ({ extensionId }) => {
  expect(extensionId).toBeTruthy()
})

test('side panel page boots', async ({ context, extensionId }) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`)

  // No Swagger tab is active here, so the panel shows its onboarding / connect prompt — text
  // that only renders after the React app boots, so it proves the page works.
  await expect(page.getByText('OpenAPI Companion').first()).toBeVisible()
  await page.close()
})

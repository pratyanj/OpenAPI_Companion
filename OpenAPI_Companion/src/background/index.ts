/**
 * Background service worker (MV3).
 *
 * Runs the storage migration pipeline on install/update, then stays lightweight.
 * It must remain STATELESS — MV3 terminates the worker aggressively, so durable
 * state is rehydrated from storage on wake (planning/07 §9, risk R-03).
 */
import { APP_NAME } from '@/constants'
import { bus } from '@/core/events'
import { MigrationService, chromeLocalArea } from '@/core/storage'

async function runMigrations(reason: string): Promise<void> {
  const migrations = new MigrationService({ area: chromeLocalArea(), bus })
  // Register schema migrations here as SCHEMA_VERSION increases, e.g.:
  //   migrations.register({ from: 1, to: 2, migrate: async (store) => { ... } })
  const result = await migrations.migrateIfNeeded()
  if (result.ok) {
    console.info(
      `[${APP_NAME}] onInstalled (${reason}); schema ${result.value.from} → ${result.value.to}`,
    )
  } else {
    console.error(`[${APP_NAME}] migration failed (${reason}):`, result.error)
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  void runMigrations(details.reason)
})

chrome.runtime.onStartup?.addListener(() => {
  console.info(`[${APP_NAME}] service worker started`)
})

// Message bridge stub (content <-> background). Full routing lands with the
// content-script integration (T-01.9).
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'PING') {
    sendResponse({ type: 'PONG', app: APP_NAME })
  }
  return false
})

export {}

import { ok, type Result } from '@/types'
import { APP_VERSION } from '@/constants'

export interface FeedbackMetadata {
  version: string
  browser: string
  os: string
  timestamp: number
  userAgent: string
}

export interface FeedbackPayload {
  type: 'install_lead' | 'user_feedback'
  email?: string
  rating?: number
  category?: 'feature' | 'bug' | 'general'
  message?: string
  metadata?: FeedbackMetadata
}

export const FEEDBACK_STORAGE_KEY = 'oac_user_email'
export const ONBOARDING_COMPLETED_KEY = 'oac_onboarding_completed'
export const PENDING_FEEDBACK_KEY = 'oac_pending_feedback'

/**
 * Default public submission endpoint.
 * Accepts standard form post payloads or webhooks (Google Apps Script / Discord / Formspree / FormSubmit).
 * Can be configured via VITE_FEEDBACK_ENDPOINT in .env.local or chrome.storage.local.
 */
export const DEFAULT_FEEDBACK_ENDPOINT =
  (typeof process !== 'undefined' && process.env?.VITE_FEEDBACK_ENDPOINT) ||
  'https://formsubmit.co/ajax/your-email-placeholder'

/** Gathers platform & runtime metadata for diagnostics. */
export function getRuntimeMetadata(): FeedbackMetadata {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  let browser = 'Unknown'
  if (ua.includes('Firefox/')) browser = 'Firefox'
  else if (ua.includes('Edg/')) browser = 'Edge'
  else if (ua.includes('Chrome/')) browser = 'Chrome'
  else if (ua.includes('Safari/')) browser = 'Safari'

  let os = 'Unknown'
  if (ua.includes('Win')) os = 'Windows'
  else if (ua.includes('Mac')) os = 'macOS'
  else if (ua.includes('Linux')) os = 'Linux'
  else if (ua.includes('Android')) os = 'Android'
  else if (ua.includes('like Mac')) os = 'iOS'

  return {
    version: APP_VERSION ?? '1.2.0',
    browser,
    os,
    timestamp: Date.now(),
    userAgent: ua,
  }
}

/**
 * Sends feedback or install lead submission to the endpoint.
 * Saves draft to local storage on network failure.
 */
export async function sendFeedback(
  payload: FeedbackPayload,
  endpoint?: string,
): Promise<Result<{ savedLocally: boolean }>> {
  let targetEndpoint = endpoint || DEFAULT_FEEDBACK_ENDPOINT
  if (!endpoint) {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        const stored = await chrome.storage.local.get('oac_feedback_endpoint')
        if (
          typeof stored.oac_feedback_endpoint === 'string' &&
          stored.oac_feedback_endpoint.trim()
        ) {
          targetEndpoint = stored.oac_feedback_endpoint.trim()
        }
      }
    } catch {
      // ignore
    }
  }

  const fullPayload = {
    ...payload,
    metadata: payload.metadata ?? getRuntimeMetadata(),
  }

  // 1. In browser extension context, delegate submission to the Background Service Worker.
  // The service worker has full host_permissions and is exempt from webpage CORS/CSP restrictions.
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    try {
      const bgResult = await new Promise<{ ok: boolean; status?: number; error?: string }>(
        (resolve) => {
          chrome.runtime.sendMessage(
            {
              type: 'SUBMIT_FEEDBACK',
              targetEndpoint,
              payload: fullPayload,
            },
            (response) => {
              if (chrome.runtime?.lastError) {
                resolve({ ok: false, error: chrome.runtime.lastError.message })
              } else {
                resolve(response ?? { ok: false })
              }
            },
          )
        },
      )

      if (bgResult.ok) {
        return ok({ savedLocally: false })
      }
    } catch {
      // Fall through to direct fetch fallback
    }
  }

  // 2. Direct fetch fallback (for test environments or when runtime is unavailable)
  try {
    const isGoogleScript =
      typeof targetEndpoint === 'string' && targetEndpoint.includes('script.google.com')
    const res = await fetch(targetEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': isGoogleScript ? 'text/plain;charset=utf-8' : 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(fullPayload),
    })

    if (!res.ok) {
      throw new Error(`Server returned HTTP ${res.status}`)
    }

    return ok({ savedLocally: false })
  } catch {
    // If offline or network error, persist to pending feedback storage so user input is safe
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        const stored = await chrome.storage.local.get(PENDING_FEEDBACK_KEY)
        const pending = Array.isArray(stored[PENDING_FEEDBACK_KEY])
          ? stored[PENDING_FEEDBACK_KEY]
          : []
        pending.push(fullPayload)
        await chrome.storage.local.set({ [PENDING_FEEDBACK_KEY]: pending })
      }
    } catch {
      // storage write fallback
    }

    // Return ok with savedLocally: true so UI can show friendly confirmation
    return ok({ savedLocally: true })
  }
}

/** Checks whether the user has completed or skipped the onboarding flow. */
export async function isOnboardingCompleted(): Promise<boolean> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const res = await chrome.storage.local.get(ONBOARDING_COMPLETED_KEY)
      return Boolean(res[ONBOARDING_COMPLETED_KEY])
    }
  } catch {
    // ignore
  }
  return false
}

/** Marks onboarding as completed and optionally saves the user's email. */
export async function completeOnboarding(email?: string): Promise<void> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const updates: Record<string, unknown> = {
        [ONBOARDING_COMPLETED_KEY]: true,
      }
      if (email && email.trim()) {
        updates[FEEDBACK_STORAGE_KEY] = email.trim()
      }
      await chrome.storage.local.set(updates)
    }
  } catch {
    // ignore
  }
}

/** Retrieves the saved user email if previously entered. */
export async function getSavedUserEmail(): Promise<string> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const res = await chrome.storage.local.get(FEEDBACK_STORAGE_KEY)
      return typeof res[FEEDBACK_STORAGE_KEY] === 'string' ? res[FEEDBACK_STORAGE_KEY] : ''
    }
  } catch {
    // ignore
  }
  return ''
}

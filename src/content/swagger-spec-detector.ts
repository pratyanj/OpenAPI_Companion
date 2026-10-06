/**
 * In-Page Swagger Spec Change Detector Banner Integration.
 *
 * Injects an accessible, prominent banner at the top of Swagger UI when OpenAPI
 * specification changes or breaking modifications are detected against the stored baseline snapshot.
 */

import type { SpecDiffResult, NormalizedSpec } from '@/modules/spec-detector/types'
import type { SpecChangeModalHandle } from './spec-change-modal'
import type { SpecService } from '@/modules/spec-detector/spec-service'
import type { EventBus } from '@/core/events'

export interface SwaggerSpecDetectorHandle {
  showBanner(diff: SpecDiffResult, newSpec: NormalizedSpec): void
  hideBanner(): void
  dispose(): void
}

const BANNER_ID = 'oac-spec-detector-banner'
const STYLE_ID = 'oac-spec-detector-styles'

const SVG_ICONS = {
  alert: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
  info: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`,
  compare: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="18" r="3"></circle><circle cx="6" cy="6" r="3"></circle><path d="M13 6h3a2 2 0 0 1 2 2v7"></path><path d="M11 18H8a2 2 0 0 1-2-2V9"></path></svg>`,
  check: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
  close: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
}

const CSS_STYLES = `
/* Feature toggle in Config */
body.oac-disable-spec-change-detector #${BANNER_ID} {
  display: none !important;
}

#${BANNER_ID} {
  margin: 12px 0 16px 0 !important;
  padding: 12px 16px !important;
  border-radius: 8px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  gap: 16px !important;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08) !important;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
  transition: all 0.2s ease !important;
  z-index: 100 !important;
}

#${BANNER_ID}.is-breaking {
  background: #fef2f2 !important;
  border: 1px solid #fecaca !important;
  color: #991b1b !important;
}

#${BANNER_ID}.is-non-breaking {
  background: #eff6ff !important;
  border: 1px solid #bfdbfe !important;
  color: #1e40af !important;
}

.oac-spec-banner-left {
  display: flex !important;
  align-items: center !important;
  gap: 12px !important;
  min-width: 0 !important;
}

.oac-spec-banner-icon {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  flex-shrink: 0 !important;
}

.oac-spec-banner-content {
  display: flex !important;
  flex-direction: column !important;
  gap: 2px !important;
}

.oac-spec-banner-title {
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
  font-size: 13px !important;
  font-weight: 600 !important;
  line-height: 1.3 !important;
}

.oac-spec-banner-badge {
  font-size: 10px !important;
  font-weight: 700 !important;
  padding: 2px 6px !important;
  border-radius: 4px !important;
  text-transform: uppercase !important;
  letter-spacing: 0.03em !important;
  line-height: 1 !important;
}

.oac-spec-banner-badge.badge-breaking {
  background: #ef4444 !important;
  color: #ffffff !important;
}

.oac-spec-banner-badge.badge-changes {
  background: #3b82f6 !important;
  color: #ffffff !important;
}

.oac-spec-banner-desc {
  font-size: 12px !important;
  color: #4b5563 !important;
  line-height: 1.4 !important;
}

.oac-spec-banner-actions {
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
  flex-shrink: 0 !important;
}

.oac-spec-btn-review {
  display: inline-flex !important;
  align-items: center !important;
  gap: 6px !important;
  padding: 6px 12px !important;
  border-radius: 6px !important;
  font-size: 12px !important;
  font-weight: 600 !important;
  color: #ffffff !important;
  background: #2563eb !important;
  border: 1px solid #1d4ed8 !important;
  cursor: pointer !important;
  transition: all 0.15s ease !important;
}

.oac-spec-btn-review:hover {
  background: #1d4ed8 !important;
}

.oac-spec-btn-accept {
  display: inline-flex !important;
  align-items: center !important;
  gap: 6px !important;
  padding: 6px 12px !important;
  border-radius: 6px !important;
  font-size: 12px !important;
  font-weight: 500 !important;
  color: #374151 !important;
  background: #ffffff !important;
  border: 1px solid #d1d5db !important;
  cursor: pointer !important;
  transition: all 0.15s ease !important;
}

.oac-spec-btn-accept:hover {
  background: #f3f4f6 !important;
  color: #111827 !important;
}

.oac-spec-btn-close {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 26px !important;
  height: 26px !important;
  border-radius: 4px !important;
  background: transparent !important;
  border: none !important;
  color: #6b7280 !important;
  cursor: pointer !important;
  transition: all 0.15s ease !important;
  padding: 0 !important;
}

.oac-spec-btn-close:hover {
  background: rgba(0, 0, 0, 0.05) !important;
  color: #111827 !important;
}
`

function ensureStyles(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return
  const style = doc.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS_STYLES
  doc.head.appendChild(style)
}

export function createSwaggerSpecDetector(
  modalHandle: SpecChangeModalHandle,
  specService?: SpecService,
  bus?: EventBus,
  doc: Document = document,
): SwaggerSpecDetectorHandle {
  ensureStyles(doc)

  let dismissedHash: string | null = null

  function hideBanner(): void {
    const banner = doc.getElementById(BANNER_ID)
    if (banner) {
      banner.remove()
    }
  }

  function showBanner(diff: SpecDiffResult, newSpec: NormalizedSpec): void {
    if (!diff.hasChanges) {
      hideBanner()
      return
    }

    if (dismissedHash === diff.newHash) {
      return
    }

    hideBanner()

    const infoContainer = doc.querySelector('.swagger-ui .information-container')
    const wrapper = doc.querySelector('.swagger-ui .wrapper')
    const schemeContainer = doc.querySelector('.swagger-ui .scheme-container')
    const mainSwagger = doc.querySelector('.swagger-ui')

    const mountTarget = infoContainer ?? wrapper ?? schemeContainer ?? mainSwagger
    if (!mountTarget) return

    const banner = doc.createElement('div')
    banner.id = BANNER_ID
    banner.className = diff.hasBreakingChanges ? 'is-breaking' : 'is-non-breaking'

    const iconHtml = diff.hasBreakingChanges ? SVG_ICONS.alert : SVG_ICONS.info
    const breakingBadge = diff.hasBreakingChanges
      ? `<span class="oac-spec-banner-badge badge-breaking">Breaking Changes</span>`
      : ''
    const countBadge = `<span class="oac-spec-banner-badge badge-changes">${diff.totalChanges} Changes</span>`

    const descText = diff.hasBreakingChanges
      ? `${diff.totalChanges} contract change(s) found (${diff.breakingCount} breaking). Saved workflows or presets may fail.`
      : `${diff.totalChanges} non-breaking contract change(s) detected in the active specification.`

    banner.innerHTML = `
      <div class="oac-spec-banner-left">
        <div class="oac-spec-banner-icon">${iconHtml}</div>
        <div class="oac-spec-banner-content">
          <div class="oac-spec-banner-title">
            <span>OpenAPI Specification Changes</span>
            ${countBadge}
            ${breakingBadge}
          </div>
          <div class="oac-spec-banner-desc">${descText}</div>
        </div>
      </div>
      <div class="oac-spec-banner-actions">
        <button type="button" class="oac-spec-btn-review" id="oac-spec-btn-review" title="Review specification contract changes">
          ${SVG_ICONS.compare}
          <span>Review Changes</span>
        </button>
        <button type="button" class="oac-spec-btn-accept" id="oac-spec-btn-accept" title="Accept new specification as baseline snapshot">
          ${SVG_ICONS.check}
          <span>Accept Baseline</span>
        </button>
        <button type="button" class="oac-spec-btn-close" id="oac-spec-btn-close" title="Dismiss notification">
          ${SVG_ICONS.close}
        </button>
      </div>
    `

    // Wire up events
    const reviewBtn = banner.querySelector('#oac-spec-btn-review')
    reviewBtn?.addEventListener('click', (e) => {
      e.stopPropagation()
      modalHandle.open({ diff, newSpec })
    })

    const acceptBtn = banner.querySelector('#oac-spec-btn-accept')
    acceptBtn?.addEventListener('click', async (e) => {
      e.stopPropagation()
      if (specService) {
        await specService.acceptNewBaseline(newSpec)
      }
      bus?.publish('NOTIFY', {
        message: 'OpenAPI specification baseline accepted successfully.',
        kind: 'success',
      })
      hideBanner()
    })

    const closeBtn = banner.querySelector('#oac-spec-btn-close')
    closeBtn?.addEventListener('click', (e) => {
      e.stopPropagation()
      dismissedHash = diff.newHash
      hideBanner()
    })

    // Mount banner at top of container
    mountTarget.prepend(banner)
  }

  return {
    showBanner,
    hideBanner,
    dispose: () => {
      hideBanner()
      doc.getElementById(STYLE_ID)?.remove()
    },
  }
}

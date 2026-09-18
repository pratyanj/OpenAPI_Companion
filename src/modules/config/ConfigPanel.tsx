import { useState, useEffect, useCallback } from 'react'
import type { EventBus } from '@/core/events'
import { Badge, Button } from '@/components'
import type { SettingsApi } from '@/modules/settings/settings-service'
import {
  DEFAULT_SWAGGER_FEATURES,
  type Preferences,
  type SwaggerFeaturePreferences,
} from '@/modules/settings/types'

export interface ConfigPanelProps {
  settings: SettingsApi
  bus?: EventBus
}

interface FeatureItem {
  id: keyof SwaggerFeaturePreferences
  title: string
  shortcut?: string
  description: string
}

const FEATURES: FeatureItem[] = [
  {
    id: 'mockData',
    title: '1-Click Realistic Mock Data',
    shortcut: 'Alt+M',
    description:
      'Floating toolbar button and mode dropdown (Realistic, Minimal, Boundary, Fuzzing) above request body textareas to synthesize and insert realistic test data.',
  },
  {
    id: 'jsonFormat',
    title: 'JSON Formatter & Auto-Repair Validator',
    shortcut: 'Alt+Shift+F',
    description:
      '1-click request body prettification with smart syntax auto-repair and non-truncating error banner showing line and column numbers.',
  },
  {
    id: 'endpointHistory',
    title: 'Re-fill Last Sent Payload (Quick History)',
    shortcut: 'Alt+L',
    description:
      '1-click refill button above request bodies and next to Execute to instantly re-populate previous parameters and JSON body from last run.',
  },
  {
    id: 'responseVariables',
    title: 'Save Response Property to Variable',
    description:
      'In-page button in Swagger response bodies to capture JSON fields, auth tokens, or IDs directly into active project variables.',
  },
  {
    id: 'authBadge',
    title: 'Active Account & Token Expiry Badge',
    description:
      'Compact status pill below Swagger Authorize showing active user/account name, live countdown timer, and 1-click token renewal.',
  },
  {
    id: 'variableResolution',
    title: 'Direct Variable Resolution ({{variable}})',
    description:
      'Live autocomplete popup when typing {{ in Swagger inputs and automatic variable replacement before request execution.',
  },
  {
    id: 'accountSwitcher',
    title: '1-Click Multi-Account & Role Switcher',
    description:
      'Compact dropdown in the Swagger header to switch between accounts (Admin, Staff, Customer) and re-authorize Swagger instantly.',
  },
  {
    id: 'responseJsonSearch',
    title: 'Response JSON Search & Tree View',
    description:
      'Interactive collapsible JSON tree with real-time keyword search, match counter, expand/collapse all, and JSON path copy inside Swagger response bodies.',
  },
  {
    id: 'copyCodeSnippet',
    title: 'Multi-Language Copy Code Dropdown',
    description:
      "Quick copy dropdown next to Swagger's Curl block to instantly copy runnable requests in cURL, PowerShell, Fetch, Axios, and Python (requests).",
  },
  {
    id: 'responseExport',
    title: 'Response Export (JSON & CSV)',
    description:
      '1-click export actions in rendered response toolbars to download responses as formatted .json or RFC 4180-compliant .csv files.',
  },
  {
    id: 'pinnedEndpoints',
    title: 'Endpoint Favorites & Top Pinning',
    description:
      'Star favorite buttons directly on endpoint headers and an interactive Pinned Operations tray at the top of Swagger UI.',
  },
  {
    id: 'pasteCurl',
    title: 'Paste cURL to Auto-Fill',
    shortcut: 'Ctrl+Shift+V',
    description:
      'Paste raw cURL commands to automatically locate the matching endpoint, activate Try-it-out, and auto-populate parameters and body.',
  },
  {
    id: 'globalHeaders',
    title: 'Global Debug Headers Injector',
    description:
      'Configure global custom HTTP headers (e.g. X-Tenant-ID, X-Debug) automatically injected into all outgoing Swagger UI requests with dynamic variables.',
  },
]

export function ConfigPanel({ settings, bus }: ConfigPanelProps) {
  const [prefs, setPrefs] = useState<Preferences | null>(null)
  const [busy, setBusy] = useState(false)

  const loadPrefs = useCallback(async () => {
    try {
      const p = await settings.getPreferences()
      setPrefs(p)
    } catch {
      // fallback
    }
  }, [settings])

  useEffect(() => {
    void loadPrefs()
  }, [loadPrefs])

  useEffect(() => {
    if (!bus) return
    const un = bus.subscribe('SETTINGS_UPDATED', (payload) => {
      if (payload.keys.includes('swaggerFeatures') || payload.keys.includes('preferences')) {
        void loadPrefs()
      }
    })
    return () => un()
  }, [bus, loadPrefs])

  const features = prefs?.swaggerFeatures ?? DEFAULT_SWAGGER_FEATURES

  const toggleFeature = async (key: keyof SwaggerFeaturePreferences, enabled: boolean) => {
    if (typeof settings.setSwaggerFeature === 'function') {
      await settings.setSwaggerFeature(key, enabled)
    } else {
      const next = { ...features, [key]: enabled }
      await settings.setPreference('swaggerFeatures', next)
    }
    setPrefs((p) => {
      if (!p) return p
      return {
        ...p,
        swaggerFeatures: {
          ...p.swaggerFeatures,
          [key]: enabled,
        },
      }
    })
  }

  const enableAll = async () => {
    setBusy(true)
    const allEnabled: SwaggerFeaturePreferences = {
      mockData: true,
      jsonFormat: true,
      endpointHistory: true,
      responseVariables: true,
      authBadge: true,
      variableResolution: true,
      accountSwitcher: true,
      responseJsonSearch: true,
      copyCodeSnippet: true,
      responseExport: true,
      pinnedEndpoints: true,
      pasteCurl: true,
      globalHeaders: true,
    }
    await settings.setPreference('swaggerFeatures', allEnabled)
    setPrefs((p) => (p ? { ...p, swaggerFeatures: allEnabled } : p))
    bus?.publish('NOTIFY', { kind: 'success', message: 'All Swagger in-page features enabled.' })
    setBusy(false)
  }

  const resetDefaults = async () => {
    setBusy(true)
    await settings.setPreference('swaggerFeatures', DEFAULT_SWAGGER_FEATURES)
    setPrefs((p) => (p ? { ...p, swaggerFeatures: DEFAULT_SWAGGER_FEATURES } : p))
    bus?.publish('NOTIFY', { kind: 'success', message: 'Reset Swagger features to default settings.' })
    setBusy(false)
  }

  const activeCount = Object.values(features).filter(Boolean).length
  const totalCount = FEATURES.length

  return (
    <div className="flex flex-col gap-4 p-4 text-xs">
      {/* Header card */}
      <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface/30 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-text">Swagger In-Page Features</h2>
            <Badge kind={activeCount === totalCount ? 'success' : activeCount > 0 ? 'info' : 'neutral'}>
              {activeCount}/{totalCount} Active
            </Badge>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="secondary"
              onClick={() => void resetDefaults()}
              disabled={busy}
              className="text-[10px] px-2 py-1"
            >
              Reset Defaults
            </Button>
            {activeCount < totalCount && (
              <Button
                variant="primary"
                onClick={() => void enableAll()}
                disabled={busy}
                className="text-[10px] px-2 py-1"
              >
                Enable All
              </Button>
            )}
          </div>
        </div>
        <p className="text-[11px] text-muted leading-relaxed">
          Configure which OpenAPI Companion tools and enhancements are injected into Swagger UI pages.
          Features apply instantly with zero page reload required. All features are enabled by default.
        </p>
      </section>

      {/* Feature toggles list */}
      <section className="flex flex-col gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted">Feature Controls</h3>
        <div className="flex flex-col divide-y divide-border/40 rounded-lg border border-border bg-surface/20">
          {FEATURES.map((item) => {
            const isEnabled = features[item.id] ?? true
            return (
              <label
                key={item.id}
                className="flex items-start justify-between gap-3 p-3 cursor-pointer group hover:bg-surface/40 transition-colors"
              >
                <div className="flex flex-col gap-1 pr-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-text group-hover:text-primary transition-colors">
                      {item.title}
                    </span>
                    {item.shortcut && (
                      <kbd className="font-mono text-[9px] bg-surface px-1.5 py-0.5 rounded border border-border text-muted font-medium">
                        {item.shortcut}
                      </kbd>
                    )}
                  </div>
                  <span className="text-[11px] text-muted leading-relaxed">
                    {item.description}
                  </span>
                </div>
                <input
                  type="checkbox"
                  aria-label={`Toggle ${item.title}`}
                  checked={isEnabled}
                  onChange={(e) => void toggleFeature(item.id, e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer shrink-0"
                />
              </label>
            )
          })}
        </div>
      </section>
    </div>
  )
}

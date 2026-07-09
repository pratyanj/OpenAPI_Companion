import { settingsKey, type StorageService } from '@/core/storage'
import type { EventBus } from '@/core/events'
import type { Unsubscribe } from '@/types'

export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'
export interface ThemeSnapshot {
  preference: ThemePreference
  resolved: ResolvedTheme
}

/** Minimal MediaQueryList surface we depend on (injectable for tests). */
export interface MediaQueryListLike {
  matches: boolean
  addEventListener(type: 'change', listener: () => void): void
  removeEventListener(type: 'change', listener: () => void): void
}

export interface ThemeManagerOptions {
  storage: StorageService
  /** Element to toggle the `.dark` class on (document root, or the sidebar host). */
  root: HTMLElement
  bus?: EventBus
  matchMedia?: (query: string) => MediaQueryListLike
}

const THEME_KEY = settingsKey('theme')
const DARK_QUERY = '(prefers-color-scheme: dark)'

/** Pure: fold a preference + system state into a concrete theme (DD-025). */
export function resolveTheme(preference: ThemePreference, prefersDark: boolean): ResolvedTheme {
  if (preference === 'system') return prefersDark ? 'dark' : 'light'
  return preference
}

/**
 * Owns light/dark theming (DD-025): persists the preference, applies the `.dark`
 * class instantly (no reload — EC-038), and follows the OS preference when set
 * to "system". Owns the theme setting until SettingsService (Sprint 13) arrives.
 */
export class ThemeManager {
  private readonly storage: StorageService
  private readonly root: HTMLElement
  private readonly bus: EventBus | undefined
  private readonly matchMedia: ((query: string) => MediaQueryListLike) | undefined
  private readonly mql: MediaQueryListLike | undefined
  private readonly listeners = new Set<() => void>()
  private preference: ThemePreference = 'system'
  private snapshot: ThemeSnapshot = { preference: 'system', resolved: 'light' }

  constructor(options: ThemeManagerOptions) {
    this.storage = options.storage
    this.root = options.root
    this.bus = options.bus
    this.matchMedia =
      options.matchMedia ??
      (typeof window !== 'undefined' && window.matchMedia
        ? (window.matchMedia.bind(window) as unknown as (q: string) => MediaQueryListLike)
        : undefined)
    this.mql = this.matchMedia?.(DARK_QUERY)
  }

  async init(): Promise<void> {
    const stored = await this.storage.getData<ThemePreference>(THEME_KEY)
    this.preference = stored.ok && stored.value ? stored.value : 'system'
    this.mql?.addEventListener('change', this.onSystemChange)
    this.apply()
  }

  getPreference(): ThemePreference {
    return this.preference
  }

  resolved(): ResolvedTheme {
    return resolveTheme(this.preference, this.prefersDark())
  }

  async setPreference(preference: ThemePreference): Promise<void> {
    this.preference = preference
    await this.storage.set(THEME_KEY, preference, { immediate: true })
    this.apply()
    this.bus?.publish('THEME_CHANGED', { theme: preference })
  }

  /** Subscribe to theme changes (for React via useSyncExternalStore). */
  subscribe = (listener: () => void): Unsubscribe => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Stable snapshot for useSyncExternalStore — identity changes only on update. */
  getSnapshot = (): ThemeSnapshot => this.snapshot

  dispose(): void {
    this.mql?.removeEventListener('change', this.onSystemChange)
    this.listeners.clear()
  }

  private readonly onSystemChange = (): void => {
    if (this.preference === 'system') this.apply()
  }

  private prefersDark(): boolean {
    return this.mql?.matches ?? false
  }

  private apply(): void {
    const resolved = this.resolved()
    if (resolved === 'dark') this.root.classList.add('dark')
    else this.root.classList.remove('dark')
    this.snapshot = { preference: this.preference, resolved }
    for (const listener of this.listeners) listener()
  }
}

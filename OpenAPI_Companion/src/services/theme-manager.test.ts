import { describe, it, expect, vi } from 'vitest'
import { ThemeManager, resolveTheme, type MediaQueryListLike } from './theme-manager'
import { StorageService, settingsKey } from '@/core/storage'
import { EventBus } from '@/core/events'
import { createFakeArea } from '@/tests/fake-storage'

function fakeMatchMedia(initial: boolean) {
  const listeners = new Set<() => void>()
  const mql: MediaQueryListLike = {
    matches: initial,
    addEventListener: (_t, l) => listeners.add(l),
    removeEventListener: (_t, l) => listeners.delete(l),
  }
  return {
    matchMedia: () => mql,
    fire: (matches: boolean) => {
      mql.matches = matches
      for (const l of listeners) l()
    },
  }
}

function newStorage() {
  return new StorageService({ area: createFakeArea(), appVersion: '0.1.0', now: () => 0 })
}

describe('resolveTheme', () => {
  it('folds system preference using the OS setting', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })
  it('honours an explicit preference regardless of the OS', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })
})

describe('ThemeManager', () => {
  it('defaults to system and applies dark when the OS prefers dark', async () => {
    const root = document.createElement('div')
    const { matchMedia } = fakeMatchMedia(true)
    const tm = new ThemeManager({ storage: newStorage(), root, matchMedia })

    await tm.init()

    expect(tm.getPreference()).toBe('system')
    expect(tm.resolved()).toBe('dark')
    expect(root.classList.contains('dark')).toBe(true)
  })

  it('loads a persisted preference on init', async () => {
    const storage = newStorage()
    await storage.set(settingsKey('theme'), 'dark', { immediate: true })
    const root = document.createElement('div')
    const { matchMedia } = fakeMatchMedia(false)
    const tm = new ThemeManager({ storage, root, matchMedia })

    await tm.init()

    expect(tm.getPreference()).toBe('dark')
    expect(root.classList.contains('dark')).toBe(true)
  })

  it('setPreference persists, applies instantly, and emits THEME_CHANGED', async () => {
    const storage = newStorage()
    const root = document.createElement('div')
    const bus = new EventBus()
    const changed = vi.fn()
    bus.subscribe('THEME_CHANGED', changed)
    const { matchMedia } = fakeMatchMedia(false)
    const tm = new ThemeManager({ storage, root, bus, matchMedia })
    await tm.init()

    await tm.setPreference('dark')
    expect(root.classList.contains('dark')).toBe(true)
    expect(changed).toHaveBeenCalledWith({ theme: 'dark' })

    await tm.setPreference('light')
    expect(root.classList.contains('dark')).toBe(false)

    // persisted across a fresh manager
    const tm2 = new ThemeManager({ storage, root: document.createElement('div'), matchMedia })
    await tm2.init()
    expect(tm2.getPreference()).toBe('light')
  })

  it('reacts to OS changes only while preference is "system"', async () => {
    const root = document.createElement('div')
    const media = fakeMatchMedia(false)
    const tm = new ThemeManager({ storage: newStorage(), root, matchMedia: media.matchMedia })
    await tm.init() // system, light

    expect(root.classList.contains('dark')).toBe(false)
    media.fire(true) // OS switches to dark
    expect(root.classList.contains('dark')).toBe(true)

    await tm.setPreference('light') // pin to light
    media.fire(false)
    media.fire(true) // OS dark again, but we're pinned
    expect(root.classList.contains('dark')).toBe(false)
  })
})

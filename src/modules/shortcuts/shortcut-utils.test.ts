import { describe, it, expect } from 'vitest'
import {
  formatShortcut,
  matchesShortcut,
  eventToBinding,
  isReservedBrowserKey,
  isSameBinding,
  findConflict,
  normalizeKey,
} from './shortcut-utils'
import { DEFAULT_SHORTCUTS } from './types'

describe('shortcut-utils', () => {
  describe('normalizeKey', () => {
    it('normalizes common keys', () => {
      expect(normalizeKey(' ')).toBe('Space')
      expect(normalizeKey('space')).toBe('Space')
      expect(normalizeKey('Escape')).toBe('Esc')
      expect(normalizeKey('esc')).toBe('Esc')
      expect(normalizeKey('Enter')).toBe('Enter')
      expect(normalizeKey('M')).toBe('m')
    })
  })

  describe('formatShortcut', () => {
    it('formats Windows / Linux shortcuts with Ctrl/Alt/Shift and +', () => {
      expect(formatShortcut({ key: 'k', ctrlOrCmd: true }, false)).toBe('Ctrl+K')
      expect(formatShortcut({ key: 'm', alt: true }, false)).toBe('Alt+M')
      expect(formatShortcut({ key: 'f', alt: true, shift: true }, false)).toBe('Alt+Shift+F')
      expect(formatShortcut({ key: 'v', ctrlOrCmd: true, shift: true }, false)).toBe('Ctrl+Shift+V')
      expect(formatShortcut({ key: '/', ctrlOrCmd: true }, false)).toBe('Ctrl+/')
    })

    it('formats macOS shortcuts with symbols', () => {
      expect(formatShortcut({ key: 'k', ctrlOrCmd: true }, true)).toBe('⌘K')
      expect(formatShortcut({ key: 'm', alt: true }, true)).toBe('⌥M')
      expect(formatShortcut({ key: 'f', alt: true, shift: true }, true)).toBe('⌥⇧F')
      expect(formatShortcut({ key: 'v', ctrlOrCmd: true, shift: true }, true)).toBe('⌘⇧V')
      expect(formatShortcut({ key: '/', ctrlOrCmd: true }, true)).toBe('⌘/')
    })
  })

  describe('matchesShortcut', () => {
    it('matches exact Ctrl+K on Windows', () => {
      const binding = { key: 'k', ctrlOrCmd: true }
      const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true })
      expect(matchesShortcut(binding, event)).toBe(true)
    })

    it('matches exact ⌘K on macOS with metaKey', () => {
      const binding = { key: 'k', ctrlOrCmd: true }
      const event = new KeyboardEvent('keydown', { key: 'K', metaKey: true })
      expect(matchesShortcut(binding, event)).toBe(true)
    })

    it('rejects if modifier is missing or unexpected', () => {
      const binding = { key: 'm', alt: true }
      // Missing Alt
      expect(matchesShortcut(binding, new KeyboardEvent('keydown', { key: 'm' }))).toBe(false)
      // Extra Ctrl
      expect(
        matchesShortcut(
          binding,
          new KeyboardEvent('keydown', { key: 'm', altKey: true, ctrlKey: true }),
        ),
      ).toBe(false)
    })

    it('matches multi-modifier shortcut (Alt+Shift+F)', () => {
      const binding = { key: 'f', alt: true, shift: true }
      expect(
        matchesShortcut(
          binding,
          new KeyboardEvent('keydown', { key: 'F', altKey: true, shiftKey: true }),
        ),
      ).toBe(true)
    })

    it('matches / and ? for help shortcut', () => {
      const binding = { key: '/', ctrlOrCmd: true }
      expect(
        matchesShortcut(binding, new KeyboardEvent('keydown', { key: '/', ctrlKey: true })),
      ).toBe(true)
      expect(
        matchesShortcut(binding, new KeyboardEvent('keydown', { key: '?', ctrlKey: true })),
      ).toBe(true)
    })
  })

  describe('eventToBinding', () => {
    it('returns null for bare modifier keydowns', () => {
      expect(
        eventToBinding(new KeyboardEvent('keydown', { key: 'Control', ctrlKey: true })),
      ).toBeNull()
      expect(
        eventToBinding(new KeyboardEvent('keydown', { key: 'Shift', shiftKey: true })),
      ).toBeNull()
      expect(eventToBinding(new KeyboardEvent('keydown', { key: 'Alt', altKey: true }))).toBeNull()
      expect(
        eventToBinding(new KeyboardEvent('keydown', { key: 'Meta', metaKey: true })),
      ).toBeNull()
    })

    it('converts combination into ShortcutBinding', () => {
      const binding = eventToBinding(
        new KeyboardEvent('keydown', { key: 'd', altKey: true, ctrlKey: true }),
      )
      expect(binding).toEqual({
        key: 'd',
        ctrlOrCmd: true,
        alt: true,
      })
    })

    it('captures shift modifier', () => {
      const binding = eventToBinding(
        new KeyboardEvent('keydown', { key: 'f', altKey: true, shiftKey: true }),
      )
      expect(binding).toEqual({
        key: 'f',
        alt: true,
        shift: true,
      })
    })
  })

  describe('isReservedBrowserKey', () => {
    it('identifies critical browser shortcuts as reserved', () => {
      expect(isReservedBrowserKey({ key: 'w', ctrlOrCmd: true })).toBe(true)
      expect(isReservedBrowserKey({ key: 't', ctrlOrCmd: true })).toBe(true)
      expect(isReservedBrowserKey({ key: 'r', ctrlOrCmd: true })).toBe(true)
      expect(isReservedBrowserKey({ key: 'i', ctrlOrCmd: true, shift: true })).toBe(true)
      expect(isReservedBrowserKey({ key: 'f5' })).toBe(true)
      expect(isReservedBrowserKey({ key: 'f12' })).toBe(true)
    })

    it('allows non-reserved developer shortcuts', () => {
      expect(isReservedBrowserKey({ key: 'm', alt: true })).toBe(false)
      expect(isReservedBrowserKey({ key: 'k', ctrlOrCmd: true })).toBe(false)
      expect(isReservedBrowserKey({ key: 'l', alt: true })).toBe(false)
      expect(isReservedBrowserKey({ key: 'f', alt: true, shift: true })).toBe(false)
    })
  })

  describe('isSameBinding', () => {
    it('checks equality accurately', () => {
      expect(isSameBinding({ key: 'k', ctrlOrCmd: true }, { key: 'K', ctrlOrCmd: true })).toBe(true)
      expect(isSameBinding({ key: 'm', alt: true }, { key: 'm', alt: true, shift: true })).toBe(
        false,
      )
      expect(isSameBinding({ key: 'a' }, { key: 'b' })).toBe(false)
    })
  })

  describe('findConflict', () => {
    it('detects conflict with an existing global shortcut', () => {
      const current = { ...DEFAULT_SHORTCUTS }
      // Attempting to bind 'mockData.generate' to Ctrl+K (which is used by palette.toggle)
      const conflict = findConflict(current, 'mockData.generate', { key: 'k', ctrlOrCmd: true })
      expect(conflict).toBe('palette.toggle')
    })

    it('returns null if no conflict exists', () => {
      const current = { ...DEFAULT_SHORTCUTS }
      // Alt+D is not used by any default shortcut
      const conflict = findConflict(current, 'mockData.generate', { key: 'd', alt: true })
      expect(conflict).toBeNull()
    })

    it('ignores comparing against the same action', () => {
      const current = { ...DEFAULT_SHORTCUTS }
      // Re-recording the same key for the same action is not a conflict
      const conflict = findConflict(current, 'mockData.generate', { key: 'm', alt: true })
      expect(conflict).toBeNull()
    })
  })
})

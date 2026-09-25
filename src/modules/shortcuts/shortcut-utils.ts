import {
  SHORTCUT_DEFINITIONS,
  type ShortcutActionId,
  type ShortcutBinding,
  type ShortcutContext,
} from './types'

/**
 * Detects whether the current platform is macOS.
 */
export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  const platform =
    (navigator as unknown as { userAgentData?: { platform?: string } }).userAgentData?.platform ||
    navigator.platform ||
    navigator.userAgent ||
    ''
  return /mac|iphone|ipad|ipod/i.test(platform)
}

/**
 * Normalizes a key string into a clean lowercase representation.
 */
export function normalizeKey(key: string): string {
  const lower = key.toLowerCase()
  if (lower === 'space' || lower === ' ') return 'Space'
  if (lower === 'escape' || lower === 'esc') return 'Esc'
  if (lower === 'enter' || lower === 'return') return 'Enter'
  return lower
}

/**
 * Formats a ShortcutBinding into a user-friendly string (e.g. "Ctrl+K" or "⌘K").
 */
export function formatShortcut(binding: ShortcutBinding, isMac = isMacPlatform()): string {
  const keyDisplay =
    binding.key.length === 1 ? binding.key.toUpperCase() : normalizeKey(binding.key)

  if (isMac) {
    const parts: string[] = []
    if (binding.ctrlOrCmd) parts.push('⌘')
    if (binding.alt) parts.push('⌥')
    if (binding.shift) parts.push('⇧')
    parts.push(keyDisplay)
    return parts.join('')
  }

  const parts: string[] = []
  if (binding.ctrlOrCmd) parts.push('Ctrl')
  if (binding.alt) parts.push('Alt')
  if (binding.shift) parts.push('Shift')
  parts.push(keyDisplay)
  return parts.join('+')
}

/**
 * Tests whether a KeyboardEvent matches a ShortcutBinding.
 */
export function matchesShortcut(binding: ShortcutBinding, event: KeyboardEvent): boolean {
  if (!binding || !event) return false

  // Modifier checks
  const hasCtrlOrCmd = Boolean(event.ctrlKey || event.metaKey)
  const requiredCtrlOrCmd = Boolean(binding.ctrlOrCmd)
  if (hasCtrlOrCmd !== requiredCtrlOrCmd) return false

  const hasAlt = Boolean(event.altKey)
  const requiredAlt = Boolean(binding.alt)
  if (hasAlt !== requiredAlt) return false

  const hasShift = Boolean(event.shiftKey)
  const requiredShift = Boolean(binding.shift)
  if (hasShift !== requiredShift) return false

  // Key check
  const eventKey = (event.key || '').toLowerCase()
  const targetKey = (binding.key || '').toLowerCase()

  if (eventKey === targetKey) return true

  // Handle special case for / and ?
  if (targetKey === '/' && (eventKey === '?' || event.code === 'Slash')) {
    return true
  }

  return false
}

const MODIFIER_KEYS = new Set([
  'control',
  'shift',
  'alt',
  'meta',
  'altgraph',
  'capslock',
  'numlock',
  'scrolllock',
])

/**
 * Converts a keydown KeyboardEvent into a ShortcutBinding.
 * Returns null if only a modifier key is pressed.
 */
export function eventToBinding(event: KeyboardEvent): ShortcutBinding | null {
  const key = (event.key || '').toLowerCase()
  if (!key || MODIFIER_KEYS.has(key)) {
    return null
  }

  const binding: ShortcutBinding = {
    key: key.length === 1 ? key : normalizeKey(key),
  }

  if (event.ctrlKey || event.metaKey) {
    binding.ctrlOrCmd = true
  }
  if (event.altKey) {
    binding.alt = true
  }
  if (event.shiftKey) {
    binding.shift = true
  }

  return binding
}

const RESERVED_COMBINATIONS: Array<{
  ctrlOrCmd?: boolean
  alt?: boolean
  shift?: boolean
  key: string
}> = [
  { ctrlOrCmd: true, key: 'w' }, // Close tab
  { ctrlOrCmd: true, key: 't' }, // New tab
  { ctrlOrCmd: true, key: 'n' }, // New window
  { ctrlOrCmd: true, key: 'r' }, // Reload
  { ctrlOrCmd: true, key: 'q' }, // Quit
  { ctrlOrCmd: true, key: 'j' }, // Downloads / DevTools
  { ctrlOrCmd: true, shift: true, key: 'r' }, // Hard reload
  { ctrlOrCmd: true, shift: true, key: 'i' }, // DevTools
  { ctrlOrCmd: true, shift: true, key: 'c' }, // Inspect element
]

/**
 * Checks whether a binding conflicts with reserved browser/OS shortcuts.
 */
export function isReservedBrowserKey(binding: ShortcutBinding): boolean {
  const k = binding.key.toLowerCase()

  // Function keys used by browsers
  if (['f5', 'f11', 'f12'].includes(k)) {
    return true
  }

  return RESERVED_COMBINATIONS.some(
    (res) =>
      Boolean(res.ctrlOrCmd) === Boolean(binding.ctrlOrCmd) &&
      Boolean(res.alt) === Boolean(binding.alt) &&
      Boolean(res.shift) === Boolean(binding.shift) &&
      res.key === k,
  )
}

/**
 * Compares two ShortcutBindings for exact equality.
 */
export function isSameBinding(
  a: ShortcutBinding | undefined,
  b: ShortcutBinding | undefined,
): boolean {
  if (!a || !b) return a === b
  return (
    a.key.toLowerCase() === b.key.toLowerCase() &&
    Boolean(a.ctrlOrCmd) === Boolean(b.ctrlOrCmd) &&
    Boolean(a.alt) === Boolean(b.alt) &&
    Boolean(a.shift) === Boolean(b.shift)
  )
}

/**
 * Checks whether two shortcut contexts can overlap/conflict.
 * 'global' conflicts with everything; 'swagger-body' and 'swagger-op' overlap because
 * request body textareas reside inside Swagger operations.
 */
function contextsOverlap(a: ShortcutContext, b: ShortcutContext): boolean {
  if (a === 'global' || b === 'global') return true
  if (
    (a === 'swagger-body' || a === 'swagger-op') &&
    (b === 'swagger-body' || b === 'swagger-op')
  ) {
    return true
  }
  return a === b
}

/**
 * Detects whether candidate binding conflicts with an existing action.
 * Returns conflicting ShortcutActionId, or null if no conflict.
 */
export function findConflict(
  currentBindings: Record<string, ShortcutBinding>,
  targetActionId: ShortcutActionId,
  candidate: ShortcutBinding,
): ShortcutActionId | null {
  const targetDef = SHORTCUT_DEFINITIONS.find((d) => d.id === targetActionId)
  const targetContext = targetDef?.context ?? 'global'

  for (const def of SHORTCUT_DEFINITIONS) {
    if (def.id === targetActionId) continue

    const existingBinding = currentBindings[def.id] || def.defaultBinding
    if (!existingBinding) continue

    if (isSameBinding(existingBinding, candidate)) {
      if (contextsOverlap(targetContext, def.context)) {
        return def.id
      }
    }
  }

  return null
}

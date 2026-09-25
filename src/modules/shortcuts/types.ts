/**
 * Types and definitions for the customizable keyboard shortcut manager (Feature 5).
 */

export type ShortcutActionId =
  | 'palette.toggle'
  | 'mockData.generate'
  | 'endpointHistory.refill'
  | 'jsonFormat.format'
  | 'pasteCurl.paste'
  | 'shortcuts.open'

export interface ShortcutBinding {
  /** Target key, lowercase (e.g. 'k', 'm', 'l', 'f', 'v', '/') */
  key: string
  /** Require Ctrl (Windows/Linux) or Command (macOS) */
  ctrlOrCmd?: boolean
  /** Require Alt (Windows/Linux) or Option (macOS) */
  alt?: boolean
  /** Require Shift */
  shift?: boolean
}

export type ShortcutContext = 'global' | 'swagger-body' | 'swagger-op' | 'panel'

export interface ShortcutDefinition {
  id: ShortcutActionId
  name: string
  description: string
  context: ShortcutContext
  contextLabel: string
  defaultBinding: ShortcutBinding
}

export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  {
    id: 'palette.toggle',
    name: 'Command Palette',
    description: 'Quick search endpoints, switch tags, and jump to operations in Swagger UI',
    context: 'global',
    contextLabel: 'Global',
    defaultBinding: { key: 'k', ctrlOrCmd: true },
  },
  {
    id: 'mockData.generate',
    name: 'Fill Realistic Mock Data',
    description: 'Generates and fills realistic test values in Swagger request body textarea',
    context: 'swagger-body',
    contextLabel: 'Request Body',
    defaultBinding: { key: 'm', alt: true },
  },
  {
    id: 'endpointHistory.refill',
    name: 'Re-fill Last Sent Payload',
    description: 'Restores the parameters and payload from the previous execution of this endpoint',
    context: 'swagger-op',
    contextLabel: 'Swagger Operation',
    defaultBinding: { key: 'l', alt: true },
  },
  {
    id: 'jsonFormat.format',
    name: 'Format & Auto-Repair JSON',
    description: 'Prettifies request body JSON with 2 spaces and heals common syntax errors',
    context: 'swagger-body',
    contextLabel: 'Request Body',
    defaultBinding: { key: 'f', alt: true, shift: true },
  },
  {
    id: 'pasteCurl.paste',
    name: 'Paste cURL as Request',
    description: 'Parses clipboard cURL command into parameters, headers, and request body',
    context: 'swagger-op',
    contextLabel: 'Swagger Operation',
    defaultBinding: { key: 'v', ctrlOrCmd: true, shift: true },
  },
  {
    id: 'shortcuts.open',
    name: 'Keyboard Shortcuts Help',
    description: 'Opens the in-page Keyboard Shortcuts cheat-sheet and configuration modal',
    context: 'global',
    contextLabel: 'Global',
    defaultBinding: { key: '/', ctrlOrCmd: true },
  },
]

export const DEFAULT_SHORTCUTS: Record<ShortcutActionId, ShortcutBinding> =
  SHORTCUT_DEFINITIONS.reduce(
    (acc, def) => {
      acc[def.id] = { ...def.defaultBinding }
      return acc
    },
    {} as Record<ShortcutActionId, ShortcutBinding>,
  )

export type ShortcutMap = Partial<Record<ShortcutActionId, ShortcutBinding>>

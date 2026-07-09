import { useSyncExternalStore } from 'react'
import type { ThemeManager, ThemeSnapshot } from '@/services'

/**
 * Reactive view of the current theme. Re-renders when the preference or the
 * resolved (light/dark) value changes — including OS changes while on "system".
 */
export function useTheme(theme: ThemeManager): ThemeSnapshot {
  return useSyncExternalStore(theme.subscribe, theme.getSnapshot, theme.getSnapshot)
}

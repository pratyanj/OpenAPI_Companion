import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Dialog, Button, SearchIcon, KeyboardIcon, RegenerateIcon as ResetIcon } from '@/components'
import type { EventBus } from '@/core/events'
import type { SettingsApi } from '@/modules/settings/settings-service'
import {
  SHORTCUT_DEFINITIONS,
  DEFAULT_SHORTCUTS,
  type ShortcutActionId,
  type ShortcutBinding,
} from './types'
import {
  formatShortcut,
  eventToBinding,
  isReservedBrowserKey,
  findConflict,
  isSameBinding,
  isMacPlatform,
} from './shortcut-utils'

export interface KeyboardShortcutsModalProps {
  isOpen: boolean
  onClose: () => void
  settings: SettingsApi
  bus?: EventBus
  onToast?: (message: string, kind?: 'success' | 'warning' | 'error') => void
}

export function KeyboardShortcutsModal({
  isOpen,
  onClose,
  settings,
  bus,
  onToast,
}: KeyboardShortcutsModalProps) {
  const [shortcuts, setShortcuts] =
    useState<Record<ShortcutActionId, ShortcutBinding>>(DEFAULT_SHORTCUTS)
  const [searchQuery, setSearchQuery] = useState('')
  const [recordingActionId, setRecordingActionId] = useState<ShortcutActionId | null>(null)
  const [recordedBinding, setRecordedBinding] = useState<ShortcutBinding | null>(null)
  const [conflictActionId, setConflictActionId] = useState<ShortcutActionId | null>(null)
  const [reservedError, setReservedError] = useState<string | null>(null)
  const isMac = useMemo(() => isMacPlatform(), [])

  const notify = useCallback(
    (message: string, kind: 'success' | 'warning' | 'error' = 'success') => {
      if (onToast) {
        onToast(message, kind)
      } else if (bus) {
        bus.publish('NOTIFY', { message, kind })
      }
    },
    [bus, onToast],
  )

  // Load preferences on open
  useEffect(() => {
    if (!isOpen) return
    let active = true

    void settings.getPreferences().then((prefs) => {
      if (!active) return
      if (prefs.shortcuts) {
        setShortcuts({
          ...DEFAULT_SHORTCUTS,
          ...prefs.shortcuts,
        })
      } else {
        setShortcuts({ ...DEFAULT_SHORTCUTS })
      }
    })

    return () => {
      active = false
    }
  }, [isOpen, settings])

  const saveShortcuts = useCallback(
    async (updated: Record<ShortcutActionId, ShortcutBinding>) => {
      setShortcuts(updated)
      await settings.setPreference('shortcuts', updated)
      if (bus) {
        bus.publish('SHORTCUTS_CHANGED', { shortcuts: updated })
      }
    },
    [settings, bus],
  )

  const shortcutsRef = useRef(shortcuts)
  shortcutsRef.current = shortcuts

  const recordingActionIdRef = useRef(recordingActionId)
  recordingActionIdRef.current = recordingActionId

  // Key recording listener
  useEffect(() => {
    if (!recordingActionId) return

    const handleKeyDown = (e: KeyboardEvent) => {
      const activeActionId = recordingActionIdRef.current
      if (!activeActionId) return

      e.preventDefault()
      e.stopPropagation()

      if (e.key === 'Escape') {
        setRecordingActionId(null)
        setRecordedBinding(null)
        setConflictActionId(null)
        setReservedError(null)
        return
      }

      const candidate = eventToBinding(e)
      if (!candidate) return

      if (isReservedBrowserKey(candidate)) {
        setReservedError(
          `"${formatShortcut(candidate, isMac)}" is reserved by the browser or system.`,
        )
        setConflictActionId(null)
        setRecordedBinding(null)
        return
      }

      setReservedError(null)

      const currentShortcuts = shortcutsRef.current
      const conflict = findConflict(currentShortcuts, activeActionId, candidate)
      if (conflict) {
        setConflictActionId(conflict)
        setRecordedBinding(candidate)
        return
      }

      // No conflict: save immediately
      const updated = {
        ...currentShortcuts,
        [activeActionId]: candidate,
      }
      void saveShortcuts(updated).then(() => {
        notify(`Updated shortcut to ${formatShortcut(candidate, isMac)}`)
        setRecordingActionId(null)
        setRecordedBinding(null)
        setConflictActionId(null)
        setReservedError(null)
      })
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [recordingActionId, isMac, saveShortcuts, notify])

  const handleResolveConflict = async (resolution: 'swap' | 'override') => {
    if (!recordingActionId || !recordedBinding || !conflictActionId) return

    const updated = { ...shortcuts }
    if (resolution === 'swap') {
      const existing = shortcuts[recordingActionId] || DEFAULT_SHORTCUTS[recordingActionId]
      updated[conflictActionId] = existing
      updated[recordingActionId] = recordedBinding
      notify(
        `Swapped shortcuts for ${SHORTCUT_DEFINITIONS.find((d) => d.id === recordingActionId)?.name} and ${SHORTCUT_DEFINITIONS.find((d) => d.id === conflictActionId)?.name}`,
      )
    } else {
      // Override
      updated[recordingActionId] = recordedBinding
      updated[conflictActionId] = DEFAULT_SHORTCUTS[conflictActionId]
      notify(
        `Assigned shortcut to ${SHORTCUT_DEFINITIONS.find((d) => d.id === recordingActionId)?.name}`,
      )
    }

    await saveShortcuts(updated)
    setRecordingActionId(null)
    setRecordedBinding(null)
    setConflictActionId(null)
    setReservedError(null)
  }

  const handleResetSingle = async (actionId: ShortcutActionId) => {
    const updated = {
      ...shortcuts,
      [actionId]: { ...DEFAULT_SHORTCUTS[actionId] },
    }
    await saveShortcuts(updated)
    notify(`Reset ${SHORTCUT_DEFINITIONS.find((d) => d.id === actionId)?.name} to default`)
  }

  const handleResetAll = async () => {
    const updated = { ...DEFAULT_SHORTCUTS }
    await saveShortcuts(updated)
    notify('Reset all keyboard shortcuts to defaults')
    setRecordingActionId(null)
    setRecordedBinding(null)
    setConflictActionId(null)
    setReservedError(null)
  }

  const filteredDefinitions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return SHORTCUT_DEFINITIONS

    return SHORTCUT_DEFINITIONS.filter((def) => {
      const current = shortcuts[def.id] || def.defaultBinding
      const formatted = formatShortcut(current, isMac).toLowerCase()
      return (
        def.name.toLowerCase().includes(query) ||
        def.description.toLowerCase().includes(query) ||
        def.contextLabel.toLowerCase().includes(query) ||
        formatted.includes(query)
      )
    })
  }, [searchQuery, shortcuts, isMac])

  if (!isOpen) return null

  const conflictingDef = conflictActionId
    ? SHORTCUT_DEFINITIONS.find((d) => d.id === conflictActionId)
    : null
  const editingDef = recordingActionId
    ? SHORTCUT_DEFINITIONS.find((d) => d.id === recordingActionId)
    : null

  return (
    <Dialog
      title="Keyboard Shortcuts"
      onClose={() => {
        setRecordingActionId(null)
        onClose()
      }}
      size="xl"
      align="top"
    >
      <div className="flex flex-col gap-4 text-xs">
        {/* Header summary & Search */}
        <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
          <div className="flex items-center gap-2 text-text">
            <KeyboardIcon className="h-5 w-5 text-primary" />
            <div>
              <h2 className="font-semibold text-sm">Keyboard Shortcuts</h2>
              <p className="text-[11px] text-muted">
                Customize in-page and extension shortcuts. Changes apply immediately.
              </p>
            </div>
          </div>
          <div className="relative w-64">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search shortcuts..."
              aria-label="Search shortcuts"
              className="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 pl-8 text-xs text-text placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <SearchIcon className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted pointer-events-none" />
          </div>
        </div>

        {/* Conflict Alert Banner */}
        {conflictingDef && recordedBinding && editingDef && (
          <div className="flex flex-col gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-text animate-in fade-in duration-150">
            <div className="flex items-center justify-between">
              <span className="font-medium text-amber-500">⚠️ Shortcut Conflict Detected</span>
              <span className="font-mono text-xs font-semibold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">
                {formatShortcut(recordedBinding, isMac)}
              </span>
            </div>
            <p className="text-[11px] text-muted">
              This combination is already assigned to{' '}
              <strong className="text-text font-medium">{conflictingDef.name}</strong> (
              {conflictingDef.contextLabel}). How would you like to resolve it?
            </p>
            <div className="flex items-center gap-2 pt-1">
              <Button
                variant="primary"
                onClick={() => void handleResolveConflict('swap')}
                className="text-xs"
              >
                Swap Bindings
              </Button>
              <Button
                variant="secondary"
                onClick={() => void handleResolveConflict('override')}
                className="text-xs"
              >
                Override & Revert Other
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setConflictActionId(null)
                  setRecordedBinding(null)
                }}
                className="text-xs"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Reserved Key Warning */}
        {reservedError && (
          <div className="rounded-md border border-danger/30 bg-danger/10 p-2.5 text-xs text-danger flex items-center justify-between">
            <span>{reservedError}</span>
            <Button
              variant="secondary"
              onClick={() => setReservedError(null)}
              className="text-[11px] py-0.5 px-2"
            >
              Dismiss
            </Button>
          </div>
        )}

        {/* Shortcuts Table */}
        <div className="rounded-md border border-border overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border bg-surface/50 text-[11px] font-semibold text-muted">
                <th className="py-2 px-3">Action</th>
                <th className="py-2 px-3">Scope</th>
                <th className="py-2 px-3">Shortcut</th>
                <th className="py-2 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredDefinitions.map((def) => {
                const current = shortcuts[def.id] || def.defaultBinding
                const isRecording = recordingActionId === def.id
                const isModified = !isSameBinding(current, def.defaultBinding)

                return (
                  <tr
                    key={def.id}
                    className={`hover:bg-surface/30 transition-colors ${
                      isRecording ? 'bg-primary/10' : ''
                    }`}
                  >
                    <td className="py-2.5 px-3 min-w-[200px]">
                      <div className="flex flex-col">
                        <span className="font-medium text-text">{def.name}</span>
                        <span className="text-[10px] text-muted leading-tight">
                          {def.description}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          def.context === 'global'
                            ? 'bg-primary/10 text-primary border border-primary/20'
                            : def.context === 'swagger-body'
                              ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                              : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                        }`}
                      >
                        {def.contextLabel}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      {isRecording ? (
                        <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-primary bg-primary/20 text-primary font-mono text-xs font-semibold animate-pulse">
                          <span>Press keys...</span>
                        </div>
                      ) : (
                        <kbd
                          className="inline-flex items-center px-2 py-1 rounded border border-border bg-surface text-text font-mono text-xs font-semibold shadow-xs"
                          aria-label={`Shortcut: ${formatShortcut(current, isMac)}`}
                        >
                          {formatShortcut(current, isMac)}
                        </kbd>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        {isRecording ? (
                          <Button
                            variant="secondary"
                            onClick={() => {
                              setRecordingActionId(null)
                              setRecordedBinding(null)
                              setConflictActionId(null)
                            }}
                            className="text-[11px] py-0.5 px-2"
                          >
                            Cancel
                          </Button>
                        ) : (
                          <>
                            <Button
                              variant="secondary"
                              onClick={() => {
                                setRecordingActionId(def.id)
                                setRecordedBinding(null)
                                setConflictActionId(null)
                                setReservedError(null)
                              }}
                              className="text-[11px] py-0.5 px-2"
                              aria-label={`Change shortcut for ${def.name}`}
                            >
                              Edit
                            </Button>
                            {isModified && (
                              <button
                                type="button"
                                onClick={() => void handleResetSingle(def.id)}
                                title="Reset to default key"
                                aria-label={`Reset ${def.name} to default`}
                                className="p-1 rounded text-muted hover:text-text hover:bg-surface transition-colors"
                              >
                                <ResetIcon className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Footer controls */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <Button
            variant="secondary"
            onClick={() => void handleResetAll()}
            className="text-xs text-muted hover:text-text"
          >
            Reset All to Defaults
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              setRecordingActionId(null)
              onClose()
            }}
            className="text-xs"
          >
            Done
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

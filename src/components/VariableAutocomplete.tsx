import {
  useState,
  useRef,
  useEffect,
  type TextareaHTMLAttributes,
  type KeyboardEvent,
  type ChangeEvent,
} from 'react'
import { LockIcon } from '@/components/icons'
import {
  DYNAMIC_VARIABLE_SUGGESTIONS,
  type VariableSuggestion,
} from './variable-constants'

export interface VariableTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  projectVariables?: Record<string, string>
  projectSecrets?: string[]
  placement?: 'top' | 'bottom' | 'auto'
  onInsertVariable?: (varName: string) => void
}

export function VariableTextarea({
  projectVariables = {},
  projectSecrets = [],
  placement = 'auto',
  value,
  defaultValue,
  onChange,
  onKeyDown,
  className = '',
  ...rest
}: VariableTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [triggerIndex, setTriggerIndex] = useState(-1)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [resolvedPlacement, setResolvedPlacement] = useState<'top' | 'bottom'>('bottom')

  // Build full list of suggestions
  const projectSuggestions: VariableSuggestion[] = Object.entries(projectVariables).map(
    ([name, val]) => {
      const isSecret = projectSecrets.includes(name)
      return {
        name,
        kind: 'project' as const,
        preview: isSecret ? '••••••••' : val,
        isSecret,
      }
    },
  )

  const allSuggestions: VariableSuggestion[] = [
    ...projectSuggestions,
    ...DYNAMIC_VARIABLE_SUGGESTIONS,
  ]

  // Filter based on query after `{{`
  const filteredSuggestions = allSuggestions.filter((s) => {
    if (!query) return true
    const q = query.toLowerCase()
    return (
      s.name.toLowerCase().includes(q) ||
      (s.description && s.description.toLowerCase().includes(q))
    )
  })

  // Separate filtered items into project and dynamic
  const filteredProject = filteredSuggestions.filter((s) => s.kind === 'project')
  const filteredDynamic = filteredSuggestions.filter((s) => s.kind === 'dynamic')

  // Calculate placement dynamically when opening
  useEffect(() => {
    if (!isOpen || !textareaRef.current) return
    if (placement === 'top') {
      setResolvedPlacement('top')
      return
    }
    if (placement === 'bottom') {
      setResolvedPlacement('bottom')
      return
    }
    // auto: check available space below
    const rect = textareaRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    if (spaceBelow < 220 && rect.top > 240) {
      setResolvedPlacement('top')
    } else {
      setResolvedPlacement('bottom')
    }
  }, [isOpen, placement])

  // Keep selectedIndex within bounds
  useEffect(() => {
    if (selectedIndex >= filteredSuggestions.length) {
      setSelectedIndex(Math.max(0, filteredSuggestions.length - 1))
    }
  }, [filteredSuggestions.length, selectedIndex])

  // Scroll active option into view
  useEffect(() => {
    if (!isOpen || !popupRef.current) return
    const activeEl = popupRef.current.querySelector('[aria-selected="true"]') as HTMLElement | null
    if (typeof activeEl?.scrollIntoView === 'function') {
      activeEl.scrollIntoView({ block: 'nearest' })
    }
  }, [isOpen, selectedIndex])

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    onChange?.(e)

    const strVal = e.target.value
    const cursorPos = e.target.selectionStart ?? strVal.length

    // Find the last index of `{{` before cursor
    const lastOpen = strVal.lastIndexOf('{{', cursorPos - 1)
    if (lastOpen !== -1) {
      // Check that there is no closing `}}` between `{{` and cursorPos
      const textBetween = strVal.slice(lastOpen + 2, cursorPos)
      if (!textBetween.includes('}}') && !textBetween.includes('\n')) {
        setTriggerIndex(lastOpen)
        setQuery(textBetween.trim())
        setIsOpen(true)
        return
      }
    }

    setIsOpen(false)
  }

  const insertSuggestion = (suggestion: VariableSuggestion) => {
    const ta = textareaRef.current
    if (!ta) return

    const strVal = String(ta.value)
    const cursorPos = ta.selectionStart ?? strVal.length
    const textBeforeTrigger = strVal.slice(0, triggerIndex)
    const textAfterCursor = strVal.slice(cursorPos)

    // Check if user already typed closing `}}` right after cursor
    const closingNeeded = textAfterCursor.startsWith('}}') ? '' : '}}'
    const closingSkip = textAfterCursor.startsWith('}}') ? 2 : 0

    const insertedText = `{{${suggestion.name}${closingNeeded}`
    const nextValue = `${textBeforeTrigger}${insertedText}${textAfterCursor.slice(closingSkip)}`

    // Synthetic event
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value',
    )?.set
    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(ta, nextValue)
      const ev = new Event('input', { bubbles: true })
      ta.dispatchEvent(ev)
    }

    setIsOpen(false)

    // Restore focus and place cursor right after inserted variable
    setTimeout(() => {
      ta.focus()
      const newCursorPos = textBeforeTrigger.length + insertedText.length
      ta.setSelectionRange(newCursorPos, newCursorPos)
    }, 0)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (isOpen && filteredSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) => (prev + 1) % filteredSuggestions.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) => (prev - 1 + filteredSuggestions.length) % filteredSuggestions.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        const item = filteredSuggestions[selectedIndex]
        if (item) {
          e.preventDefault()
          insertSuggestion(item)
          return
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setIsOpen(false)
        return
      }
    }
    onKeyDown?.(e)
  }

  return (
    <div className="relative w-full">
      <textarea
        ref={textareaRef}
        {...(value !== undefined ? { value } : defaultValue !== undefined ? { defaultValue } : {})}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        className={className}
        {...rest}
      />

      {/* Autocomplete Popup */}
      {isOpen && filteredSuggestions.length > 0 && (
        <div
          ref={popupRef}
          role="listbox"
          aria-label="Variable suggestions"
          className={`absolute left-0 right-0 z-50 max-h-60 overflow-y-auto rounded-xl border border-border bg-surface shadow-2xl p-1.5 flex flex-col gap-1 animate-in fade-in duration-100 ${
            resolvedPlacement === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          }`}
        >
          {/* Project Variables Section */}
          {filteredProject.length > 0 && (
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center justify-between px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
                <span>Project Variables</span>
                <span className="font-mono text-[9px] font-normal">{filteredProject.length}</span>
              </div>
              {filteredProject.map((s) => {
                const globalIdx = filteredSuggestions.indexOf(s)
                const isSelected = globalIdx === selectedIndex
                return (
                  <div
                    key={s.name}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => insertSuggestion(s)}
                    className={`group flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 cursor-pointer text-xs transition-colors ${
                      isSelected ? 'bg-primary text-primary-contrast' : 'text-text hover:bg-bg'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      {s.isSecret ? (
                        <span title="Secret variable">
                          <LockIcon className={`h-3.5 w-3.5 shrink-0 ${isSelected ? 'text-primary-contrast' : 'text-warning'}`} />
                        </span>
                      ) : null}
                      <span className="font-mono font-semibold tracking-tight text-[11px] truncate">
                        {`{{${s.name}}}`}
                      </span>
                    </div>
                    {s.preview ? (
                      <span
                        className={`font-mono text-[10px] shrink-0 max-w-[160px] truncate ${
                          isSelected ? 'opacity-90' : 'text-muted'
                        }`}
                      >
                        {s.preview}
                      </span>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}

          {/* Dynamic System Variables Section */}
          {filteredDynamic.length > 0 && (
            <div className={`flex flex-col gap-0.5 ${filteredProject.length > 0 ? 'pt-1 border-t border-border/60' : ''}`}>
              <div className="flex items-center justify-between px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
                <span>Dynamic Variables</span>
                <span className="font-mono text-[9px] font-normal">{filteredDynamic.length}</span>
              </div>
              {filteredDynamic.map((s) => {
                const globalIdx = filteredSuggestions.indexOf(s)
                const isSelected = globalIdx === selectedIndex
                return (
                  <div
                    key={s.name}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => insertSuggestion(s)}
                    className={`group flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 cursor-pointer text-xs transition-colors ${
                      isSelected ? 'bg-primary text-primary-contrast' : 'text-text hover:bg-bg'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono font-semibold tracking-tight text-[11px] truncate">
                        {`{{${s.name}}}`}
                      </span>
                      {s.description ? (
                        <span
                          className={`text-[10px] truncate ${
                            isSelected ? 'opacity-85' : 'text-muted'
                          }`}
                        >
                          {s.description}
                        </span>
                      ) : null}
                    </div>
                    {s.preview ? (
                      <span
                        className={`font-mono text-[10px] shrink-0 max-w-[140px] truncate ${
                          isSelected ? 'opacity-90' : 'text-muted'
                        }`}
                      >
                        {s.preview}
                      </span>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}

          {/* Keyboard Navigation Footer */}
          <div className="mt-0.5 flex items-center justify-between border-t border-border/80 px-2 py-1 text-[9px] text-muted">
            <span>↑↓ navigate • ↵ or Tab insert</span>
            <span>Esc dismiss</span>
          </div>
        </div>
      )}
    </div>
  )
}

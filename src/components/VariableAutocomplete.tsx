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
  onInsertVariable?: (varName: string) => void
}

export function VariableTextarea({
  projectVariables = {},
  projectSecrets = [],
  value,
  defaultValue,
  onChange,
  onKeyDown,
  className = '',
  ...rest
}: VariableTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [triggerIndex, setTriggerIndex] = useState(-1)
  const [selectedIndex, setSelectedIndex] = useState(0)

  // Build full list of suggestions
  const allSuggestions: VariableSuggestion[] = [
    ...Object.entries(projectVariables).map(([name, val]) => {
      const isSecret = projectSecrets.includes(name)
      return {
        name,
        kind: 'project' as const,
        preview: isSecret ? '••••••••' : val,
        description: isSecret ? 'Secret project variable' : 'Project variable',
        isSecret,
      }
    }),
    ...DYNAMIC_VARIABLE_SUGGESTIONS,
  ]

  // Filter based on query after `{{`
  const filteredSuggestions = allSuggestions.filter((s) => {
    if (!query) return true
    const q = query.toLowerCase()
    return s.name.toLowerCase().includes(q) || (s.description && s.description.toLowerCase().includes(q))
  })

  // Keep selectedIndex within bounds
  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  const checkTrigger = (text: string, cursorPos: number) => {
    const textBefore = text.slice(0, cursorPos)
    const match = textBefore.match(/(?:\{\{)([$A-Za-z0-9_]*)$/)
    if (match && match.index !== undefined) {
      setTriggerIndex(match.index)
      setQuery(match[1] || '')
      setIsOpen(true)
    } else {
      setIsOpen(false)
    }
  }

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    onChange?.(e)
    const cursorPos = e.target.selectionStart ?? 0
    checkTrigger(e.target.value, cursorPos)
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
          role="listbox"
          aria-label="Variable suggestions"
          className="absolute left-2 right-2 bottom-full mb-1 max-h-52 overflow-y-auto rounded-md border border-border bg-surface shadow-xl z-50 p-1 flex flex-col gap-0.5 animate-in fade-in duration-100"
        >
          <div className="px-2 py-1 text-[10px] font-semibold text-muted border-b border-border flex items-center justify-between">
            <span>Insert Variable (Tab or Enter to apply)</span>
            <span className="font-mono text-[9px]">{filteredSuggestions.length} found</span>
          </div>
          {filteredSuggestions.map((s, idx) => {
            const isSelected = idx === selectedIndex
            return (
              <div
                key={s.name}
                role="option"
                aria-selected={isSelected}
                onClick={() => insertSuggestion(s)}
                className={`flex items-center justify-between rounded px-2 py-1.5 cursor-pointer text-xs transition-colors ${
                  isSelected ? 'bg-primary text-primary-contrast' : 'text-text hover:bg-bg'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  {s.isSecret ? (
                    <LockIcon className="h-3 w-3 shrink-0 text-warning" />
                  ) : null}
                  <span className="font-mono font-medium truncate">
                    {`{{${s.name}}}`}
                  </span>
                  {s.description ? (
                    <span
                      className={`text-[10px] truncate ${
                        isSelected ? 'opacity-90 text-primary-contrast' : 'text-muted'
                      }`}
                    >
                      • {s.description}
                    </span>
                  ) : null}
                </div>
                {s.preview ? (
                  <span
                    className={`font-mono text-[10px] shrink-0 max-w-[120px] truncate ml-2 ${
                      isSelected ? 'opacity-80' : 'text-muted'
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
    </div>
  )
}

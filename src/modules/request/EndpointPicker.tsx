import { useState, useMemo, useRef, useEffect } from 'react'
import {
  SearchIcon,
  ChevronDownIcon,
  CloseIcon,
  CopiedIcon,
} from '@/components'
import type { EndpointInfo } from '@/adapters'
import { METHODS, type MethodFilter } from './types'

const METHOD_STYLES: Record<string, { bg: string; text: string }> = {
  get: { bg: 'bg-[#61affe]/15', text: 'text-[#61affe]' },
  post: { bg: 'bg-[#49cc90]/15', text: 'text-[#49cc90]' },
  put: { bg: 'bg-[#fca130]/15', text: 'text-[#fca130]' },
  delete: { bg: 'bg-[#f93e3e]/15', text: 'text-[#f93e3e]' },
  patch: { bg: 'bg-[#50e3c2]/15', text: 'text-[#50e3c2]' },
}

export function MethodTag({ method }: { method: string }) {
  const m = method.toLowerCase()
  const style = METHOD_STYLES[m] ?? { bg: 'bg-surface', text: 'text-muted' }
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase ${style.bg} ${style.text}`}
    >
      {method}
    </span>
  )
}

export interface EndpointPickerProps {
  endpoints: EndpointInfo[]
  selectedEndpointId: string
  onSelect: (endpointId: string) => void
  disabled?: boolean
}

export function EndpointPicker({
  endpoints,
  selectedEndpointId,
  onSelect,
  disabled = false,
}: EndpointPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [methodFilter, setMethodFilter] = useState<MethodFilter>('ALL')
  const dropdownRef = useRef<HTMLDivElement>(null)

  const selectedEndpoint = useMemo(
    () => endpoints.find((ep) => ep.endpointId === selectedEndpointId),
    [endpoints, selectedEndpointId],
  )

  const filteredEndpoints = useMemo(() => {
    const q = query.trim().toLowerCase()
    return endpoints.filter((ep) => {
      if (methodFilter !== 'ALL' && ep.method.toUpperCase() !== methodFilter) {
        return false
      }
      if (!q) return true
      const matchesMethod = ep.method.toLowerCase().includes(q)
      const matchesPath = ep.path.toLowerCase().includes(q)
      const matchesSummary = (ep.summary || '').toLowerCase().includes(q)
      return matchesMethod || matchesPath || matchesSummary
    })
  }, [endpoints, query, methodFilter])

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  return (
    <div className="relative flex flex-col gap-1" ref={dropdownRef}>
      {/* Trigger Box */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-bg px-2.5 py-2 text-left text-xs transition hover:border-border/80 hover:bg-surface/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
      >
        {selectedEndpoint ? (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <MethodTag method={selectedEndpoint.method} />
            <span className="truncate font-mono font-medium text-text">
              {selectedEndpoint.path}
            </span>
            {selectedEndpoint.summary && (
              <span className="truncate text-muted">— {selectedEndpoint.summary}</span>
            )}
          </div>
        ) : (
          <span className="text-muted">Select an API endpoint…</span>
        )}
        <ChevronDownIcon
          className={`h-4 w-4 shrink-0 text-muted transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Custom Searchable Popover Dropdown */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 flex max-h-64 flex-col rounded-lg border border-border bg-surface shadow-2xl animate-in fade-in zoom-in-95 duration-150">
          {/* Search Header */}
          <div className="flex flex-col gap-1.5 border-b border-border p-2 bg-surface">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted" />
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by path, method, or summary…"
                className="w-full rounded-md border border-border bg-bg pl-8 pr-7 py-1.5 text-xs text-text placeholder:text-muted focus:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-2 top-2 text-muted hover:text-text"
                >
                  <CloseIcon className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Quick Method Filters */}
            <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-none">
              {METHODS.map((m) => {
                const active = methodFilter === m
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMethodFilter(m)}
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors ${
                      active
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-bg text-muted hover:bg-surface hover:text-text border border-border'
                    }`}
                  >
                    {m}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Endpoints List */}
          <div className="flex flex-col gap-1.5 overflow-y-auto p-2 max-h-56 bg-surface">
            {filteredEndpoints.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted">
                {endpoints.length === 0
                  ? 'No endpoints detected on this page.'
                  : 'No matching endpoints.'}
              </div>
            ) : (
              filteredEndpoints.map((ep) => {
                const isSelected = ep.endpointId === selectedEndpointId
                return (
                  <div
                    key={ep.endpointId}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      onSelect(ep.endpointId)
                      setIsOpen(false)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        onSelect(ep.endpointId)
                        setIsOpen(false)
                      }
                    }}
                    className={`group flex flex-col gap-1 rounded-md border p-2 text-xs transition cursor-pointer select-none ${
                      isSelected
                        ? 'border-primary bg-primary/10 shadow-sm'
                        : 'border-border bg-bg hover:border-muted hover:bg-surface/80'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <MethodTag method={ep.method} />
                        <span className="font-mono text-[11px] font-medium text-text break-all">
                          {ep.path}
                        </span>
                      </div>
                      {isSelected && (
                        <span className="shrink-0 flex items-center gap-1 text-[10px] font-semibold text-primary">
                          <CopiedIcon className="h-3 w-3" />
                        </span>
                      )}
                    </div>
                    {ep.summary ? (
                      <div className="text-[11px] text-muted pl-0.5 group-hover:text-text/90">
                        {ep.summary}
                      </div>
                    ) : null}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

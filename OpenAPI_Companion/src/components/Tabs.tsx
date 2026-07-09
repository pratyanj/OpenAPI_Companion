import type { ReactNode } from 'react'
import { cn } from '@/utils'

export interface TabDef {
  id: string
  label: string
  icon?: ReactNode
}

interface TabsProps {
  tabs: TabDef[]
  activeId: string
  onChange: (id: string) => void
}

/**
 * Accessible tab strip (ARIA `tablist`). Left/Right arrows move between tabs
 * (planning/09 §Accessibility, planning/10 §2).
 */
export function Tabs({ tabs, activeId, onChange }: TabsProps) {
  const move = (delta: number) => {
    const index = tabs.findIndex((t) => t.id === activeId)
    const next = tabs[(index + delta + tabs.length) % tabs.length]
    if (next) onChange(next.id)
  }

  return (
    <div role="tablist" aria-label="Companion sections" className="flex flex-wrap gap-1">
      {tabs.map((tab) => {
        const selected = tab.id === activeId
        return (
          <button
            key={tab.id}
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') move(1)
              else if (e.key === 'ArrowLeft') move(-1)
            }}
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              selected ? 'bg-primary text-white' : 'text-muted hover:bg-surface hover:text-text',
            )}
          >
            {tab.icon ? <span aria-hidden>{tab.icon}</span> : null}
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

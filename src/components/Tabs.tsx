import type { ReactNode } from 'react'
import { cn } from '@/utils'

export interface TabDef {
  id: string
  label: string
  icon?: ReactNode
  placement?: 'top' | 'bottom'
}

interface TabsProps {
  tabs: TabDef[]
  activeId: string
  onChange: (id: string) => void
  orientation?: 'horizontal' | 'vertical'
}

/**
 * Accessible tab strip (ARIA `tablist`).
 * Supports horizontal mode and vertical activity rail mode with keyboard navigation.
 */
export function Tabs({ tabs, activeId, onChange, orientation = 'horizontal' }: TabsProps) {
  const move = (delta: number) => {
    const index = tabs.findIndex((t) => t.id === activeId)
    const next = tabs[(index + delta + tabs.length) % tabs.length]
    if (next) onChange(next.id)
  }

  if (orientation === 'vertical') {
    const topTabs = tabs.filter((t) => t.placement !== 'bottom')
    const bottomTabs = tabs.filter((t) => t.placement === 'bottom')

    const renderVerticalTab = (tab: TabDef) => {
      const selected = tab.id === activeId
      return (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={`tab-${tab.id}`}
          aria-label={tab.label}
          title={tab.label}
          aria-selected={selected}
          aria-controls={`panel-${tab.id}`}
          tabIndex={selected ? 0 : -1}
          onClick={() => onChange(tab.id)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowRight') move(1)
            else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') move(-1)
          }}
          className={cn(
            'group relative flex h-9 w-9 items-center justify-center rounded-lg transition-all',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            selected
              ? 'bg-primary/15 text-primary shadow-sm font-semibold'
              : 'text-muted hover:bg-surface/80 hover:text-text',
          )}
        >
          {selected && (
            <span
              className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-primary shadow-sm shadow-primary/50"
              aria-hidden="true"
            />
          )}
          {tab.icon ? (
            <span
              aria-hidden="true"
              className={cn(
                'flex items-center justify-center transition-colors',
                selected ? 'text-primary' : 'text-muted group-hover:text-text',
              )}
            >
              {tab.icon}
            </span>
          ) : (
            <span className="text-xs font-bold">{tab.label.charAt(0)}</span>
          )}
          <span className="sr-only">{tab.label}</span>
        </button>
      )
    }

    return (
      <div
        role="tablist"
        aria-label="Companion sections"
        aria-orientation="vertical"
        className="flex h-full w-12 flex-shrink-0 flex-col justify-between items-center border-r border-border bg-surface/15 py-2 select-none"
      >
        <div className="flex w-full flex-col items-center gap-1.5">
          {topTabs.map(renderVerticalTab)}
        </div>
        {bottomTabs.length > 0 && (
          <div className="flex w-full flex-col items-center gap-1.5 border-t border-border/60 pt-2">
            {bottomTabs.map(renderVerticalTab)}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      role="tablist"
      aria-label="Companion sections"
      aria-orientation="horizontal"
      className="flex flex-wrap gap-1"
    >
      {tabs.map((tab) => {
        const selected = tab.id === activeId
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') move(1)
              else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') move(-1)
            }}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-all',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              selected
                ? 'bg-primary text-white border border-primary shadow-sm font-semibold'
                : 'bg-surface border border-border text-muted hover:text-text hover:border-muted hover:shadow-sm',
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

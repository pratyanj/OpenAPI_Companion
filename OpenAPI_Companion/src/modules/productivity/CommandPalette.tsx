import { useState } from 'react'
import type { Result } from '@/types'
import {
  Badge,
  Dialog,
  EmptyState,
  IconButton,
  CopyButton,
  SearchIcon,
  FavoriteIcon,
  CodeIcon,
} from '@/components'
import type { BadgeKind } from '@/components'
import type { CodeLang, EndpointInfo, EndpointListItem } from './types'

/** Surface CommandPalette needs from ProductivityService (eases testing). */
export interface ProductivityPanelService {
  search(query: string, method?: string): EndpointListItem[]
  getFavorites(): EndpointListItem[]
  getRecents(): EndpointListItem[]
  toggleFavorite(e: EndpointInfo): Promise<Result<boolean>>
  open(e: EndpointInfo): Promise<Result<void>>
  generateCode(lang: CodeLang, endpointId: string): Result<string>
}

interface CommandPaletteProps {
  service: ProductivityPanelService
  onClose: () => void
}

const CODE_LANGS: { lang: CodeLang; label: string }[] = [
  { lang: 'curl', label: 'cURL' },
  { lang: 'fetch', label: 'Fetch' },
  { lang: 'axios', label: 'Axios' },
]

/** Method filter chips shown above the results ('all' = no filter). */
const METHOD_FILTERS = ['all', 'get', 'post', 'put', 'patch', 'delete'] as const
type MethodFilter = (typeof METHOD_FILTERS)[number]

function methodKind(method: string): BadgeKind {
  switch (method.toLowerCase()) {
    case 'get':
      return 'info'
    case 'post':
      return 'success'
    case 'put':
    case 'patch':
      return 'warning'
    case 'delete':
      return 'error'
    default:
      return 'neutral'
  }
}

export function CommandPalette({ service, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [method, setMethod] = useState<MethodFilter>('all')
  const [codeFor, setCodeFor] = useState<string | null>(null)
  const [, forceRerender] = useState(0) // bump to recompute lists after a favorite toggle

  // Lists are small and sync, so compute each render (search-as-you-type).
  const trimmed = query.trim()
  // A method filter counts as "filtering" too, so it applies even with no query.
  const filtering = trimmed !== '' || method !== 'all'
  const results = filtering ? service.search(trimmed, method === 'all' ? undefined : method) : null
  const favorites = service.getFavorites()
  const recents = service.getRecents()

  const goto = (item: EndpointListItem) => {
    void service.open(item)
    onClose()
  }

  const Row = ({ item }: { item: EndpointListItem }) => {
    const showCode = codeFor === item.endpointId
    return (
      <li className="rounded-md border border-border">
        <div className="flex items-center gap-2 px-2 py-1">
          <button
            type="button"
            onClick={() => goto(item)}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
            aria-label={`Open ${item.method} ${item.path}`}
          >
            <Badge kind={methodKind(item.method)}>{item.method.toUpperCase()}</Badge>
            <span className="truncate font-mono text-[11px] text-text">{item.path}</span>
            {item.summary ? (
              <span className="truncate text-[11px] text-muted">— {item.summary}</span>
            ) : null}
          </button>
          <IconButton
            label={item.favorite ? `Unfavorite ${item.path}` : `Favorite ${item.path}`}
            onClick={() =>
              void service.toggleFavorite(item).then(() => forceRerender((n) => n + 1))
            }
            className={item.favorite ? 'text-warning' : ''}
          >
            <FavoriteIcon fill={item.favorite ? 'currentColor' : 'none'} />
          </IconButton>
          <IconButton
            label={`Copy code for ${item.path}`}
            onClick={() => setCodeFor(showCode ? null : item.endpointId)}
            className={showCode ? 'text-primary' : ''}
          >
            <CodeIcon />
          </IconButton>
        </div>
        {showCode ? (
          <div className="flex flex-wrap gap-1 border-t border-border px-2 py-1">
            {CODE_LANGS.map(({ lang, label }) => {
              const gen = service.generateCode(lang, item.endpointId)
              return (
                <CopyButton key={lang} text={gen.ok ? gen.value : ''} label={`Copy ${label}`} />
              )
            })}
          </div>
        ) : null}
      </li>
    )
  }

  const Section = ({ title, items }: { title: string; items: EndpointListItem[] }) =>
    items.length ? (
      <div className="flex flex-col gap-1">
        <span className="px-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
          {title}
        </span>
        <ul className="flex flex-col gap-1">
          {items.map((item) => (
            <Row key={item.endpointId} item={item} />
          ))}
        </ul>
      </div>
    ) : null

  return (
    <Dialog title="Search endpoints" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 rounded-md border border-border bg-surface px-2">
          <SearchIcon className="h-4 w-4 text-muted" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && results && results[0]) goto(results[0])
            }}
            placeholder="Search methods, paths, summaries…"
            aria-label="Search endpoints"
            className="flex-1 bg-transparent py-2 text-xs text-text focus:outline-none"
          />
        </div>

        <div role="group" aria-label="Filter by method" className="flex flex-wrap gap-1">
          {METHOD_FILTERS.map((m) => {
            const active = method === m
            return (
              <button
                key={m}
                type="button"
                aria-pressed={active}
                onClick={() => setMethod(m)}
                className={
                  active
                    ? 'rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase text-white'
                    : 'rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase text-muted hover:bg-surface hover:text-text'
                }
              >
                {m === 'all' ? 'All' : m}
              </button>
            )
          })}
        </div>

        {results ? (
          results.length ? (
            <ul className="flex flex-col gap-1">
              {results.map((item) => (
                <Row key={item.endpointId} item={item} />
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={<SearchIcon className="h-8 w-8 text-muted" />}
              title="No endpoints match"
              message="Try a different method, path, or keyword."
            />
          )
        ) : (
          <div className="flex flex-col gap-3">
            <Section title="Favorites" items={favorites} />
            <Section title="Recent" items={recents} />
            {favorites.length === 0 && recents.length === 0 ? (
              <p className="px-1 text-xs text-muted">
                Type to search this API&apos;s endpoints. Star an endpoint to keep it here.
              </p>
            ) : null}
          </div>
        )}
      </div>
    </Dialog>
  )
}

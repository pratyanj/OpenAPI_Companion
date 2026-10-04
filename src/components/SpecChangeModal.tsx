import { useState, useMemo } from 'react'
import { Dialog } from './Dialog'
import { Button } from './Button'
import { Badge } from './Badge'
import {
  CompareIcon,
  ToastErrorIcon,
  ToastSuccessIcon,
  DownloadIcon,
  CheckIcon,
  SearchIcon,
  WorkflowIcon,
  FolderIcon,
  StarIcon,
} from './icons'
import type {
  SpecDiffResult,
  NormalizedSpec,
  ChangeSeverity,
  ImpactedResourceType,
} from '@/modules/spec-detector/types'

export interface SpecChangeModalProps {
  diff: SpecDiffResult
  newSpec: NormalizedSpec
  onAccept: (newSpec: NormalizedSpec) => Promise<void> | void
  onClose: () => void
  onExportJson?: () => void
}

type TabType = 'summary' | 'changes' | 'impact'

export function SpecChangeModal({
  diff,
  newSpec,
  onAccept,
  onClose,
  onExportJson,
}: SpecChangeModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('summary')
  const [severityFilter, setSeverityFilter] = useState<ChangeSeverity | 'all'>('all')
  const [impactTypeFilter, setImpactTypeFilter] = useState<ImpactedResourceType | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [accepting, setAccepting] = useState(false)

  const filteredChanges = useMemo(() => {
    return diff.changes.filter((c) => {
      if (severityFilter !== 'all' && c.severity !== severityFilter) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchTitle = c.title.toLowerCase().includes(q)
        const matchDesc = c.description.toLowerCase().includes(q)
        const matchPath = c.path.toLowerCase().includes(q)
        const matchMethod = c.method.toLowerCase().includes(q)
        if (!matchTitle && !matchDesc && !matchPath && !matchMethod) return false
      }
      return true
    })
  }, [diff.changes, severityFilter, searchQuery])

  const filteredImpacted = useMemo(() => {
    return diff.impactedResources.filter((item) => {
      if (impactTypeFilter !== 'all' && item.type !== impactTypeFilter) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchName = item.name.toLowerCase().includes(q)
        const matchEndpoint = item.endpointId.toLowerCase().includes(q)
        const matchReason = item.reason.toLowerCase().includes(q)
        if (!matchName && !matchEndpoint && !matchReason) return false
      }
      return true
    })
  }, [diff.impactedResources, impactTypeFilter, searchQuery])

  const handleExportJson = () => {
    if (onExportJson) {
      onExportJson()
      return
    }
    const blob = new Blob([JSON.stringify(diff, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `openapi-spec-diff-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleAcceptClick = async () => {
    setAccepting(true)
    try {
      await onAccept(newSpec)
      onClose()
    } finally {
      setAccepting(false)
    }
  }

  return (
    <Dialog
      title={
        <div className="flex items-center gap-2">
          <CompareIcon className="h-5 w-5 text-accent" />
          <span className="font-semibold text-text">OpenAPI Spec Change Detector</span>
        </div>
      }
      size="xl"
      onClose={onClose}
      actions={
        <Button
          variant="secondary"
          className="text-xs px-2.5 py-1"
          onClick={handleExportJson}
          aria-label="Export Diff as JSON"
        >
          <DownloadIcon className="h-3.5 w-3.5 mr-1" />
          Export JSON
        </Button>
      }
    >
      <div className="flex flex-col gap-4 text-xs">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-border pb-2">
          <button
            type="button"
            className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
              activeTab === 'summary'
                ? 'bg-accent/15 text-accent font-semibold'
                : 'text-text-muted hover:text-text hover:bg-surface-elevated'
            }`}
            onClick={() => setActiveTab('summary')}
          >
            Summary
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === 'changes'
                ? 'bg-accent/15 text-accent font-semibold'
                : 'text-text-muted hover:text-text hover:bg-surface-elevated'
            }`}
            onClick={() => setActiveTab('changes')}
          >
            <span>Changes</span>
            <Badge kind="neutral" className="text-[10px] px-1.5 py-0">
              {diff.totalChanges}
            </Badge>
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === 'impact'
                ? 'bg-accent/15 text-accent font-semibold'
                : 'text-text-muted hover:text-text hover:bg-surface-elevated'
            }`}
            onClick={() => setActiveTab('impact')}
          >
            <span>Impacted Resources</span>
            {diff.impactedResources.length > 0 && (
              <Badge
                kind={diff.hasBreakingChanges ? 'error' : 'warning'}
                className="text-[10px] px-1.5 py-0"
              >
                {diff.impactedResources.length}
              </Badge>
            )}
          </button>
        </div>

        {/* Tab 1: Summary */}
        {activeTab === 'summary' && (
          <div className="flex flex-col gap-4">
            {diff.hasBreakingChanges ? (
              <div className="flex items-start gap-3 p-3 rounded-lg border border-danger/40 bg-danger/10 text-danger">
                <ToastErrorIcon className="h-5 w-5 shrink-0 mt-0.5" />
                <div className="flex flex-col gap-1">
                  <div className="font-semibold text-sm">Potentially Breaking Changes Detected</div>
                  <div className="text-xs text-text-muted">
                    {diff.breakingCount} breaking contract alteration(s) found. Existing saved
                    parameters, bodies, or workflow assertion steps may fail until updated.
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3 p-3 rounded-lg border border-success/40 bg-success/10 text-success">
                <ToastSuccessIcon className="h-5 w-5 shrink-0 mt-0.5" />
                <div className="flex flex-col gap-1">
                  <div className="font-semibold text-sm">Non-Breaking Contract Updates</div>
                  <div className="text-xs text-text-muted">
                    All detected changes are backward-compatible additions or informational
                    enhancements.
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-4 gap-3">
              <div className="flex flex-col items-center justify-center p-3 rounded-lg border border-border bg-surface/50">
                <span className="text-xl font-bold text-text">{diff.totalChanges}</span>
                <span className="text-[11px] text-text-muted">Total Changes</span>
              </div>
              <div className="flex flex-col items-center justify-center p-3 rounded-lg border border-danger/30 bg-danger/5">
                <span className="text-xl font-bold text-danger">{diff.breakingCount}</span>
                <span className="text-[11px] text-danger font-medium">Breaking</span>
              </div>
              <div className="flex flex-col items-center justify-center p-3 rounded-lg border border-warning/30 bg-warning/5">
                <span className="text-xl font-bold text-warning">{diff.warningCount}</span>
                <span className="text-[11px] text-warning font-medium">Warnings</span>
              </div>
              <div className="flex flex-col items-center justify-center p-3 rounded-lg border border-info/30 bg-info/5">
                <span className="text-xl font-bold text-info">{diff.infoCount}</span>
                <span className="text-[11px] text-info font-medium">Informational</span>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-surface/30 p-3 flex flex-col gap-2">
              <div className="font-medium text-text">Specification Details</div>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-text-muted">
                <div>
                  <span className="text-text-muted/80">Title: </span>
                  <span className="text-text font-medium">{newSpec.title ?? 'Untitled API'}</span>
                </div>
                <div>
                  <span className="text-text-muted/80">Version: </span>
                  <span className="text-text font-medium">{newSpec.version ?? 'Unknown'}</span>
                </div>
                <div>
                  <span className="text-text-muted/80">Previous Hash: </span>
                  <span className="font-mono text-text font-medium">
                    {diff.oldHash ? diff.oldHash.substring(0, 10) : 'None'}
                  </span>
                </div>
                <div>
                  <span className="text-text-muted/80">New Hash: </span>
                  <span className="font-mono text-text font-medium">
                    {diff.newHash ? diff.newHash.substring(0, 10) : 'None'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Changes List */}
        {activeTab === 'changes' && (
          <div className="flex flex-col gap-3">
            {/* Filters */}
            <div className="flex items-center justify-between gap-2">
              <div className="relative flex-1">
                <SearchIcon className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-text-muted" />
                <input
                  type="text"
                  placeholder="Filter changes by endpoint or description..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 rounded-md border border-border bg-surface text-text text-xs focus:outline-none focus:border-accent"
                />
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setSeverityFilter('all')}
                  className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                    severityFilter === 'all'
                      ? 'bg-accent/20 text-accent'
                      : 'text-text-muted hover:text-text'
                  }`}
                >
                  All ({diff.totalChanges})
                </button>
                <button
                  type="button"
                  onClick={() => setSeverityFilter('breaking')}
                  className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                    severityFilter === 'breaking'
                      ? 'bg-danger/20 text-danger'
                      : 'text-text-muted hover:text-text'
                  }`}
                >
                  Breaking ({diff.breakingCount})
                </button>
                <button
                  type="button"
                  onClick={() => setSeverityFilter('warning')}
                  className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                    severityFilter === 'warning'
                      ? 'bg-warning/20 text-warning'
                      : 'text-text-muted hover:text-text'
                  }`}
                >
                  Warning ({diff.warningCount})
                </button>
                <button
                  type="button"
                  onClick={() => setSeverityFilter('info')}
                  className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                    severityFilter === 'info'
                      ? 'bg-info/20 text-info'
                      : 'text-text-muted hover:text-text'
                  }`}
                >
                  Info ({diff.infoCount})
                </button>
              </div>
            </div>

            {/* List */}
            <div className="flex flex-col gap-2 max-h-[360px] overflow-y-auto pr-1">
              {filteredChanges.length === 0 ? (
                <div className="text-center py-8 text-text-muted">No changes match your filter.</div>
              ) : (
                filteredChanges.map((change) => {
                  const severityBadge =
                    change.severity === 'breaking' ? (
                      <Badge kind="error">Breaking</Badge>
                    ) : change.severity === 'warning' ? (
                      <Badge kind="warning">Warning</Badge>
                    ) : (
                      <Badge kind="info">Info</Badge>
                    )

                  return (
                    <div
                      key={change.id}
                      className="p-3 rounded-lg border border-border bg-surface/40 flex flex-col gap-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] font-bold uppercase text-accent">
                            {change.method}
                          </span>
                          <span className="font-mono text-[11px] text-text">{change.path}</span>
                        </div>
                        {severityBadge}
                      </div>
                      <div className="font-medium text-text text-xs">{change.title}</div>
                      <div className="text-[11px] text-text-muted leading-relaxed">
                        {change.description}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Impacted Resources */}
        {activeTab === 'impact' && (
          <div className="flex flex-col gap-3">
            {/* Filters */}
            <div className="flex items-center justify-between gap-2">
              <div className="relative flex-1">
                <SearchIcon className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-text-muted" />
                <input
                  type="text"
                  placeholder="Filter impacted resources..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 rounded-md border border-border bg-surface text-text text-xs focus:outline-none focus:border-accent"
                />
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setImpactTypeFilter('all')}
                  className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                    impactTypeFilter === 'all'
                      ? 'bg-accent/20 text-accent'
                      : 'text-text-muted hover:text-text'
                  }`}
                >
                  All ({diff.impactedResources.length})
                </button>
                <button
                  type="button"
                  onClick={() => setImpactTypeFilter('workflow')}
                  className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                    impactTypeFilter === 'workflow'
                      ? 'bg-accent/20 text-accent'
                      : 'text-text-muted hover:text-text'
                  }`}
                >
                  Workflows
                </button>
                <button
                  type="button"
                  onClick={() => setImpactTypeFilter('preset')}
                  className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                    impactTypeFilter === 'preset'
                      ? 'bg-accent/20 text-accent'
                      : 'text-text-muted hover:text-text'
                  }`}
                >
                  Presets
                </button>
              </div>
            </div>

            {/* List */}
            <div className="flex flex-col gap-2 max-h-[360px] overflow-y-auto pr-1">
              {filteredImpacted.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center text-text-muted gap-2">
                  <ToastSuccessIcon className="h-8 w-8 text-success/60" />
                  <div className="font-medium text-text">No Companion Resources Impacted</div>
                  <div className="text-xs">
                    Your saved workflows, request presets, and pinned operations are not affected.
                  </div>
                </div>
              ) : (
                filteredImpacted.map((item) => {
                  const typeIcon =
                    item.type === 'workflow' ? (
                      <WorkflowIcon className="h-3.5 w-3.5 text-accent" />
                    ) : item.type === 'preset' ? (
                      <FolderIcon className="h-3.5 w-3.5 text-info" />
                    ) : (
                      <StarIcon className="h-3.5 w-3.5 text-warning" />
                    )

                  return (
                    <div
                      key={item.id}
                      className="p-3 rounded-lg border border-border bg-surface/40 flex flex-col gap-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          {typeIcon}
                          <span className="font-semibold text-text">{item.name}</span>
                          {item.stepName && (
                            <span className="text-[11px] text-text-muted">
                              ({item.stepName})
                            </span>
                          )}
                        </div>
                        <Badge kind={item.severity === 'breaking' ? 'error' : 'warning'}>
                          {item.severity === 'breaking' ? 'Breaking' : 'Warning'}
                        </Badge>
                      </div>

                      <div className="font-mono text-[10px] text-text-muted">
                        Target: {item.endpointId}
                      </div>

                      <div className="text-[11px] text-danger/90 leading-relaxed font-medium">
                        {item.reason}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )}

        {/* Footer actions */}
        <div className="flex items-center justify-between border-t border-border pt-3 mt-2">
          <Button variant="secondary" onClick={onClose} disabled={accepting}>
            Dismiss
          </Button>

          <Button
            variant="primary"
            onClick={() => void handleAcceptClick()}
            disabled={accepting}
            className="flex items-center gap-1.5"
          >
            <CheckIcon className="h-4 w-4" />
            <span>{accepting ? 'Updating Baseline...' : 'Accept New Spec'}</span>
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

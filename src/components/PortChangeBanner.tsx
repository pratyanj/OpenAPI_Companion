import { useState } from 'react'
import type { CandidateProject } from '@/core/project/types'
import { Button, IconButton, CloseIcon, LinkIcon, CopyIcon, Spinner } from '@/components'
import { extractPort } from '@/utils/doc-url'

export interface PortChangeBannerProps {
  candidates: CandidateProject[]
  onLink: (candidateId: string) => Promise<void> | void
  onCopy: (candidateId: string) => Promise<void> | void
  onDismiss: () => void
}

export function PortChangeBanner({ candidates, onLink, onCopy, onDismiss }: PortChangeBannerProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [busyAction, setBusyAction] = useState<'link' | 'copy' | null>(null)

  if (!candidates || candidates.length === 0) return null

  const selectedCandidate = candidates[selectedIndex] ?? candidates[0]
  if (!selectedCandidate) return null

  const candidatePort = extractPort(selectedCandidate.originUrl)
  const portLabel = candidatePort ? `port :${candidatePort}` : selectedCandidate.name

  const handleLink = async () => {
    try {
      setBusyAction('link')
      await onLink(selectedCandidate.id)
    } finally {
      setBusyAction(null)
    }
  }

  const handleCopy = async () => {
    try {
      setBusyAction('copy')
      await onCopy(selectedCandidate.id)
    } finally {
      setBusyAction(null)
    }
  }

  return (
    <div
      role="alert"
      className="relative flex flex-col gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-text shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 font-semibold text-amber-500">
          <span className="text-sm">⚡</span>
          <span>Port Change Detected</span>
        </div>
        <IconButton
          label="Dismiss notification"
          onClick={onDismiss}
          className="h-5 w-5 text-muted hover:text-text"
        >
          <CloseIcon className="h-3.5 w-3.5" />
        </IconButton>
      </div>

      <p className="text-[11px] leading-relaxed text-text/90">
        Found existing project data from{' '}
        <strong className="font-semibold text-text">{selectedCandidate.name}</strong> (
        <span className="font-mono text-muted">{selectedCandidate.originUrl}</span>
        {selectedCandidate.presetCount ? ` • ${selectedCandidate.presetCount} presets` : ''}
        {selectedCandidate.variableCount ? ` • ${selectedCandidate.variableCount} variables` : ''}
        ). Would you like to use that data on this port?
      </p>

      {candidates.length > 1 ? (
        <div className="flex items-center gap-1.5 text-[11px]">
          <span className="text-muted">Target:</span>
          <select
            aria-label="Select candidate project"
            value={selectedIndex}
            onChange={(e) => setSelectedIndex(Number(e.target.value))}
            className="rounded border border-border bg-surface px-1.5 py-0.5 text-xs text-text focus:outline-none focus:ring-1 focus:ring-amber-500"
          >
            {candidates.map((cand, idx) => (
              <option key={cand.id} value={idx}>
                {cand.name} ({cand.originUrl})
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button
          variant="primary"
          onClick={handleLink}
          disabled={busyAction !== null}
          className="bg-amber-600 hover:bg-amber-500 text-white text-[11px] py-1 px-2.5 h-auto flex items-center gap-1.5 shadow-sm"
        >
          {busyAction === 'link' ? (
            <Spinner className="h-3 w-3" />
          ) : (
            <LinkIcon className="h-3.5 w-3.5" />
          )}
          <span>Link to {portLabel}</span>
        </Button>

        <Button
          variant="secondary"
          onClick={handleCopy}
          disabled={busyAction !== null}
          className="text-[11px] py-1 px-2.5 h-auto flex items-center gap-1.5"
        >
          {busyAction === 'copy' ? (
            <Spinner className="h-3 w-3" />
          ) : (
            <CopyIcon className="h-3.5 w-3.5" />
          )}
          <span>Copy Data</span>
        </Button>

        <Button
          variant="ghost"
          onClick={onDismiss}
          disabled={busyAction !== null}
          className="text-[11px] py-1 px-2 text-muted hover:text-text h-auto ml-auto"
        >
          Dismiss
        </Button>
      </div>
    </div>
  )
}

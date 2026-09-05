import { useState } from 'react'
import { Badge, Button, DeleteIcon, LockIcon, PlusIcon, ZapIcon } from '@/components'
import type { Result } from '@/types'
import type { EndpointInfo } from '@/adapters'
import { MethodTag } from '@/modules/request/EndpointPicker'
import type { ExtractionRule, ExtractionRuleInput } from './extraction-rules-types'
import { ExtractionRuleModal } from './ExtractionRuleModal'

export interface ExtractionRulesListProps {
  rules: ExtractionRule[]
  endpoints?: EndpointInfo[]
  onToggleRule: (id: string, enabled: boolean) => Promise<void>
  onDeleteRule: (id: string) => Promise<void>
  onAddRule: (rule: ExtractionRuleInput) => Promise<void>
  onOpenAddModal?: () => Promise<boolean | Result<void> | void> | boolean | Result<void> | void
}

export function ExtractionRulesList({
  rules,
  endpoints = [],
  onToggleRule,
  onDeleteRule,
  onAddRule,
  onOpenAddModal,
}: ExtractionRulesListProps) {
  const [modalOpen, setModalOpen] = useState(false)

  const handleOpenModal = async () => {
    if (onOpenAddModal) {
      try {
        const res = await onOpenAddModal()
        if (res === false || (res && typeof res === 'object' && 'ok' in res && !res.ok)) {
          setModalOpen(true)
        }
      } catch {
        setModalOpen(true)
      }
    } else {
      setModalOpen(true)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">
            Auto-Extraction Rules
          </span>
          <Badge kind="neutral">{rules.length}</Badge>
        </div>
        <Button variant="primary" onClick={handleOpenModal} className="gap-1 text-xs">
          <PlusIcon className="h-3.5 w-3.5" />
          Add Rule
        </Button>
      </div>

      <p className="text-[11px] text-muted leading-relaxed">
        Rules automatically capture JSON values (like access tokens or entity IDs) from successful
        (2xx) responses and write them directly into your project's .env variables.
      </p>

      {/* Rules list */}
      {rules.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2.5 rounded-lg border border-dashed border-border bg-surface/30 p-6 text-center">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ZapIcon className="h-5 w-5" />
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium text-text">No extraction rules configured</span>
            <span className="text-[11px] text-muted">
              Auto-extract tokens or IDs upon execution, or check "Auto-extract" when saving from
              History.
            </span>
          </div>
          <Button variant="secondary" onClick={handleOpenModal} className="mt-1 gap-1 text-xs">
            <PlusIcon className="h-3 w-3" />
            Create First Rule
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {rules.map((rule) => {
            const [rawMethod = 'GET', ...pathParts] = rule.endpointId.split(' ')
            const epPath = pathParts.join(' ') || rule.endpointId

            return (
              <div
                key={rule.id}
                className={`flex items-center justify-between gap-3 rounded-md border p-2.5 transition-colors ${
                  rule.enabled
                    ? 'border-border bg-surface'
                    : 'border-border/60 bg-surface/30 opacity-70'
                }`}
              >
                {/* Left side info */}
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <MethodTag method={rawMethod} />
                    <span className="truncate font-mono text-xs font-medium text-text">
                      {epPath}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="rounded bg-background px-1.5 py-0.5 font-mono text-muted">
                      body.{rule.property}
                    </span>
                    <span className="text-muted">→</span>
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono font-semibold text-primary">
                      {`{{${rule.targetVariable}}}`}
                    </span>
                    {rule.isSecret ? (
                      <span
                        title="Stored as secret"
                        className="inline-flex items-center gap-0.5 text-warning"
                      >
                        <LockIcon className="h-3 w-3" />
                      </span>
                    ) : null}
                  </div>
                </div>

                {/* Right side controls */}
                <div className="flex items-center gap-2">
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted select-none">
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={(e) => void onToggleRule(rule.id, e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary"
                    />
                    <span className="text-[11px]">{rule.enabled ? 'Active' : 'Off'}</span>
                  </label>
                  <button
                    type="button"
                    title="Delete rule"
                    onClick={() => void onDeleteRule(rule.id)}
                    className="rounded p-1 text-muted hover:bg-surface hover:text-danger"
                  >
                    <DeleteIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add Rule Dialog Modal (Fallback for unit testing / standalone) */}
      {modalOpen ? (
        <ExtractionRuleModal
          endpoints={endpoints}
          onClose={() => setModalOpen(false)}
          onSave={async (input) => {
            await onAddRule(input)
            setModalOpen(false)
          }}
        />
      ) : null}
    </div>
  )
}

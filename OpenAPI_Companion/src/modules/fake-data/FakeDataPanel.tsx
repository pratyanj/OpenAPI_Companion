import { useCallback, useEffect, useState } from 'react'
import type { Result } from '@/types'
import type { EventBus } from '@/core/events'
import { useEventBus } from '@/hooks'
import {
  Badge,
  Button,
  EmptyState,
  IconButton,
  DataIcon,
  GenerateIcon,
  RegenerateIcon,
} from '@/components'
import type { FakeDataPreview, GenerateOptions, GenerateResult } from './types'

/** Surface FakeDataPanel needs from FakeDataService (eases testing). */
export interface FakeDataPanelService {
  previewOpenRequest(): FakeDataPreview | null
  generateAll(options?: GenerateOptions): Promise<Result<GenerateResult>>
  regenerateField(key: string): Promise<Result<GenerateResult>>
}

interface FakeDataPanelProps {
  service: FakeDataPanelService
  bus: EventBus
}

function humanize(generator: string): string {
  const spaced = generator.replace(/([A-Z])/g, ' $1').toLowerCase()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

function preview(value: unknown): string {
  const text = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value)
  return text.length > 32 ? `${text.slice(0, 32)}…` : text
}

export function FakeDataPanel({ service, bus }: FakeDataPanelProps) {
  const [data, setData] = useState<FakeDataPreview | null>(() => service.previewOpenRequest())
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(() => setData(service.previewOpenRequest()), [service])

  useEffect(() => refresh(), [refresh])
  useEventBus(bus, 'REQUEST_CHANGED', refresh)
  useEventBus(bus, 'FAKE_DATA_GENERATED', refresh)

  const notify = (result: Result<GenerateResult>) => {
    if (result.ok) {
      const n = result.value.fieldCount
      bus.publish('NOTIFY', {
        kind: n > 0 ? 'success' : 'warning',
        message: n > 0 ? `Generated ${n} field${n === 1 ? '' : 's'}.` : 'No fillable fields found.',
      })
    } else {
      bus.publish('NOTIFY', { kind: 'error', message: result.error.message })
    }
    refresh()
  }

  const run = async (op: () => Promise<Result<GenerateResult>>) => {
    setBusy(true)
    notify(await op())
    setBusy(false)
  }

  if (!data) {
    return (
      <div className="flex flex-col gap-2 p-3">
        <EmptyState
          icon={<DataIcon className="h-8 w-8 text-muted" />}
          title="No request open"
          message="Open a request with a JSON body in Swagger (Try it out), then generate test data here."
        />
        <Button variant="secondary" onClick={refresh} className="self-center">
          Refresh
        </Button>
      </div>
    )
  }

  const supported = data.fields.filter((f) => f.generator).length

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] font-semibold uppercase text-muted">
          {data.method}
        </span>
        <span className="truncate font-mono text-[11px] text-text">
          {data.endpointId.split(' ')[1]}
        </span>
      </div>

      <div className="flex gap-2">
        <Button
          variant="primary"
          onClick={() => void run(() => service.generateAll())}
          disabled={busy}
        >
          <GenerateIcon className="h-3.5 w-3.5" />
          Generate test data
        </Button>
        <Button
          variant="secondary"
          onClick={() => void run(() => service.generateAll({ overwrite: true }))}
          disabled={busy}
        >
          Regenerate all
        </Button>
      </div>

      {supported === 0 ? (
        <p className="text-xs text-muted">
          No recognizable fields in this request — generation will leave it unchanged.
        </p>
      ) : null}

      <ul className="flex flex-col gap-1">
        {data.fields.map((f) => (
          <li
            key={f.key}
            className="flex items-center gap-2 rounded-md border border-border px-2 py-1"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-mono text-[11px] font-medium text-text">
                  {f.key}
                </span>
                {f.generator ? (
                  <Badge kind="info">{humanize(f.generator)}</Badge>
                ) : (
                  <Badge kind="neutral">unsupported</Badge>
                )}
              </div>
              <div className="truncate font-mono text-[11px] text-muted">{preview(f.value)}</div>
            </div>
            <IconButton
              label={`Regenerate ${f.key}`}
              onClick={() => void run(() => service.regenerateField(f.key))}
              disabled={busy || !f.generator}
            >
              <RegenerateIcon />
            </IconButton>
          </li>
        ))}
      </ul>
    </div>
  )
}

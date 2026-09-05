import { useCallback, useEffect, useState } from 'react'
import { Dialog, Spinner, ReplayIcon, LocateIcon } from '@/components'
import type { EventBus } from '@/core/events'
import type { EnvironmentPanelService } from '@/modules/environment'
import type { HistoryEntry, HistoryRecord } from './types'
import type { HistoryPanelService } from './HistoryPanel'
import { HistoryDetail } from './HistoryDetail'

export interface HistoryDetailModalProps {
  initialHistoryId?: string
  initialRecord?: HistoryRecord | null
  service: HistoryPanelService
  environmentService?: EnvironmentPanelService
  bus?: EventBus
  baseUrl?: string
  onClose: () => void
}

export function HistoryDetailModal({
  initialHistoryId,
  initialRecord,
  service,
  environmentService,
  bus,
  baseUrl,
  onClose,
}: HistoryDetailModalProps) {
  const [record, setRecord] = useState<HistoryRecord | null>(initialRecord ?? null)
  const [calls, setCalls] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(!initialRecord && Boolean(initialHistoryId))
  const [replaying, setReplaying] = useState(false)

  const loadRecord = useCallback(
    async (id: string) => {
      setLoading(true)
      const res = await service.get(id)
      if (res.ok && res.value) {
        setRecord(res.value)
        const listRes = await service.list()
        if (listRes.ok) {
          setCalls(listRes.value.filter((e) => e.endpointId === res.value!.endpointId))
        }
      }
      setLoading(false)
    },
    [service],
  )

  useEffect(() => {
    if (initialRecord) {
      setRecord(initialRecord)
      void service.list().then((listRes) => {
        if (listRes.ok) {
          setCalls(listRes.value.filter((e) => e.endpointId === initialRecord.endpointId))
        }
      })
    } else if (initialHistoryId) {
      void loadRecord(initialHistoryId)
    }
  }, [initialHistoryId, initialRecord, loadRecord, service])

  const handleReplay = async () => {
    if (!record) return
    setReplaying(true)
    const res = await service.replay(record.id)
    setReplaying(false)
    if (!res.ok) {
      bus?.publish('NOTIFY', { kind: 'error', message: res.error.message })
    } else {
      bus?.publish('NOTIFY', {
        kind: 'success',
        message: `Replayed ${record.method.toUpperCase()} ${record.endpoint}`,
      })
      // Reload calls to show the new execution
      const listRes = await service.list()
      if (listRes.ok) {
        setCalls(listRes.value.filter((e) => e.endpointId === record.endpointId))
      }
    }
  }

  const handleLocate = () => {
    if (!record) return
    const res = service.locate(record.endpointId)
    if (!res.ok) {
      bus?.publish('NOTIFY', { kind: 'error', message: res.error.message })
    }
  }

  return (
    <Dialog
      title="Request detail"
      size="xl"
      align="top"
      onClose={onClose}
      actions={
        record ? (
          <>
            <button
              type="button"
              onClick={() => void handleReplay()}
              disabled={replaying}
              className="flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[11px] text-text hover:bg-surface disabled:opacity-50"
            >
              <ReplayIcon className="h-3.5 w-3.5" />
              {replaying ? 'Replaying…' : 'Replay'}
            </button>
            <button
              type="button"
              onClick={handleLocate}
              className="flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[11px] text-text hover:bg-surface"
            >
              <LocateIcon className="h-3.5 w-3.5" />
              Locate
            </button>
          </>
        ) : null
      }
    >
      {loading ? (
        <div className="flex justify-center p-8">
          <Spinner />
        </div>
      ) : record ? (
        <HistoryDetail
          record={record}
          baseUrl={baseUrl}
          environmentService={environmentService}
          bus={bus}
          calls={calls}
          onSelectCall={(id) => void loadRecord(id)}
        />
      ) : (
        <p className="p-4 text-center text-xs text-muted">Request not found.</p>
      )}
    </Dialog>
  )
}

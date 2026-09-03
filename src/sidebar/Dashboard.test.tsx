import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ok, type Result } from '@/types'
import { EventBus } from '@/core/events'
import type { HistoryEntry } from '@/modules/history'
import { Dashboard, type DashboardProps } from './Dashboard'

const NOW = 1_700_000_000_000

const project = {
  id: 'project_abc',
  name: 'DWERP API',
  originUrl: 'http://192.168.71.56',
  openApiUrl: '',
  docType: 'swagger-ui',
  createdAt: 0,
  lastActiveEnvId: 'default',
}

const entries: HistoryEntry[] = [
  {
    id: 'h1',
    endpointId: 'post:/auth/login/',
    method: 'post',
    endpoint: '/auth/login/',
    status: 201,
    timestamp: NOW - 120_000,
    environmentId: 'default',
  },
  {
    id: 'h2',
    endpointId: 'get:/approvals/rules/',
    method: 'get',
    endpoint: '/approvals/rules/',
    status: 403,
    timestamp: NOW - 3_600_000,
    environmentId: 'default',
  },
]

/* eslint-disable @typescript-eslint/no-explicit-any -- terse test doubles */
function props(over: Partial<DashboardProps> = {}): DashboardProps {
  const okAsync = (v: unknown) => vi.fn(async (): Promise<Result<any>> => ok(v))
  return {
    project,
    bus: new EventBus(),
    environmentId: 'default',
    authService: {
      current: okAsync({
        type: 'bearer',
        token: 'x',
        environmentId: 'default',
        updatedAt: 0,
        expiresAt: NOW + 42 * 60_000,
      }),
      clear: okAsync(undefined),
      isAutoRefreshEnabled: vi.fn(async () => true),
      setAutoRefreshEnabled: okAsync(undefined),
      isBearerPrefixEnabled: vi.fn(async () => true),
      setBearerPrefixEnabled: okAsync(undefined),
      addByLogin: okAsync({}),
      refreshActivity: vi.fn(async () => []),
      refreshNow: okAsync(true),
      loginEndpoint: vi.fn(async () => null),
      loginTemplate: vi.fn(async () => null),
      listSaved: okAsync([]),
      saveAs: okAsync({}),
      activateSaved: okAsync({}),
      deleteSaved: okAsync(undefined),
      setLogin: okAsync({}),
    } as any,
    environmentService: {
      list: okAsync([
        { id: 'default', name: 'Default', projectId: 'project_abc', variables: {} },
        { id: 'qa', name: 'QA', projectId: 'project_abc', variables: {} },
      ]),
      getActiveId: vi.fn(async () => 'default'),
      switch: okAsync({}),
      create: okAsync({}),
      update: okAsync({}),
      delete: okAsync(undefined),
      listBuiltins: () => [],
    } as any,
    historyService: {
      list: okAsync(entries),
      get: okAsync(null),
      replay: okAsync({}),
      locate: vi.fn(() => ok(undefined)),
      deleteEntry: okAsync(undefined),
      clearProject: okAsync(undefined),
    } as any,
    requestService: {
      listTemplates: okAsync([{ id: 't1' }, { id: 't2' }]),
      saveOpenAsTemplate: okAsync(null),
      applyTemplate: okAsync(undefined),
      deleteTemplate: okAsync(undefined),
    } as any,
    importExportService: {
      exportAll: okAsync('{}'),
      backup: okAsync('backup.json'),
      previewImport: vi.fn(() => ok({} as any)),
      applyImport: okAsync({ imported: 0, skipped: 0, renamed: 0 }),
    } as any,
    onOpenPalette: vi.fn(),
    onNavigate: vi.fn(),
    swagger: {
      version: () => '5.17.14',
      specUrl: () => 'http://192.168.71.56/api/v1/swagger/?format=openapi',
      listEndpoints: () => new Array(214).fill(null),
    },
    ...over,
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

describe('Dashboard (Home tab)', () => {
  beforeEach(() => vi.setSystemTime(NOW))
  afterEach(() => vi.useRealTimers())

  it('summarises the project and spec', async () => {
    render(<Dashboard {...props()} />)
    expect(screen.getByText('DWERP API')).toBeInTheDocument()
    expect(await screen.findByText(/214 endpoints/)).toBeInTheDocument()
    expect(screen.getByText('v5.17.14')).toBeInTheDocument()
    expect(screen.getByText('swagger-ui')).toBeInTheDocument()
  })

  it('shows auth status with the expiry countdown and auto-refresh state', async () => {
    render(<Dashboard {...props()} />)
    expect(await screen.findByText('Active')).toBeInTheDocument()
    expect(screen.getByText(/expires in 42m/)).toBeInTheDocument()
    expect(screen.getByText('Auto-refresh on')).toBeInTheDocument()
  })

  it('flags an expired token instead of counting down', async () => {
    const p = props()
    ;(p.authService.current as ReturnType<typeof vi.fn>).mockResolvedValue(
      ok({
        type: 'bearer',
        token: 'x',
        environmentId: 'default',
        updatedAt: 0,
        expiresAt: NOW - 1000,
      }),
    )
    render(<Dashboard {...p} />)
    expect(await screen.findByText('Expired')).toBeInTheDocument()
    expect(screen.queryByText(/expires in/)).not.toBeInTheDocument()
  })

  it('lists recent calls with method + status, and locates one on click', async () => {
    const p = props()
    render(<Dashboard {...p} />)
    expect(await screen.findByText('/auth/login/')).toBeInTheDocument()
    expect(screen.getByText('201')).toBeInTheDocument()
    expect(screen.getByText('403')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Locate post /auth/login/' }))
    expect(p.historyService.locate).toHaveBeenCalledWith('post:/auth/login/')
  })

  it('counts calls, failures and templates', async () => {
    render(<Dashboard {...props()} />)
    expect(await screen.findByText('2 calls')).toBeInTheDocument()
    expect(screen.getByText(/1 failed/)).toBeInTheDocument()
    expect(screen.getByText(/2 templates/)).toBeInTheDocument()
  })

  it('wires the quick actions', async () => {
    const p = props()
    render(<Dashboard {...p} />)

    fireEvent.click(await screen.findByRole('button', { name: /Search/ }))
    expect(p.onOpenPalette).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: /Templates/ }))
    expect(p.onNavigate).toHaveBeenCalledWith('requests')

    fireEvent.click(screen.getByRole('button', { name: /Backup/ }))
    expect(p.importExportService.backup).toHaveBeenCalledTimes(1)
  })

  it('refreshes when a call is recorded elsewhere', async () => {
    const p = props()
    render(<Dashboard {...p} />)
    await screen.findByText('2 calls')
    const before = (p.historyService.list as ReturnType<typeof vi.fn>).mock.calls.length
    p.bus.publish('HISTORY_RECORDED', {
      recordId: 'h1',
      endpointId: 'post:/auth/login/',
      status: 201,
    })
    expect((p.historyService.list as ReturnType<typeof vi.fn>).mock.calls.length).toBe(before + 1)
  })

  it('prompts to open a doc when no project is detected', () => {
    render(<Dashboard {...props({ project: null })} />)
    expect(screen.getByText('No project detected')).toBeInTheDocument()
  })
})

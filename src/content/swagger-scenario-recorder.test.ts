import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mountSwaggerScenarioRecorder } from './swagger-scenario-recorder'
import { ScenarioRecorderService } from '@/modules/workflows/recorder/recorder-service'
import type { SwaggerAdapter } from '@/adapters/types'
import type { ScenarioModalHandle } from './scenario-modal'

describe('mountSwaggerScenarioRecorder', () => {
  let doc: Document
  let fakeAdapter: SwaggerAdapter
  let recorder: ScenarioRecorderService
  let modal: ScenarioModalHandle

  beforeEach(() => {
    doc = document.implementation.createHTMLDocument('Swagger Test')
    fakeAdapter = {
      detect: () => true,
      version: () => '3.0.0',
      specUrl: () => null,
      readAuth: () => null,
      writeAuth: () => ({ ok: true, value: undefined }),
      clearAuth: () => ({ ok: true, value: undefined }),
      readOpenRequests: () => [],
      writeRequest: () => ({ ok: true, value: undefined }),
      replay: () => ({ ok: true, value: undefined }),
      readExecutedResponses: () => [],
      listEndpoints: () => [],
      openEndpoint: () => ({ ok: true, value: undefined }),
      isRequestBodyEmpty: () => false,
      observe: () => () => {},
      onExecute: vi.fn().mockReturnValue(() => {}),
    }

    recorder = new ScenarioRecorderService({ projectId: 'test_proj' })
    modal = {
      open: vi.fn(),
      close: vi.fn(),
      isOpen: vi.fn().mockReturnValue(false),
      themeRoot: doc.createElement('div'),
      destroy: vi.fn(),
    }
  })

  it('mounts floating bar in host element with Shadow DOM', () => {
    const handle = mountSwaggerScenarioRecorder(fakeAdapter, recorder, modal, undefined, doc)
    const host = doc.getElementById('oac-scenario-bar-host')
    expect(host).not.toBeNull()
    expect(host?.shadowRoot).not.toBeNull()

    const startBtn = host?.shadowRoot?.querySelector('#oac-btn-start-record')
    expect(startBtn).not.toBeNull()
    expect(startBtn?.textContent).toContain('Record Scenario')

    handle.destroy()
    expect(doc.getElementById('oac-scenario-bar-host')).toBeNull()
  })

  it('transitions from idle to recording and paused on button clicks', () => {
    const handle = mountSwaggerScenarioRecorder(fakeAdapter, recorder, modal, undefined, doc)
    const host = doc.getElementById('oac-scenario-bar-host')
    expect(host).not.toBeNull()
    const shadow = host?.shadowRoot
    expect(shadow).not.toBeNull()

    // Click Record
    const startBtn = shadow?.querySelector<HTMLButtonElement>('#oac-btn-start-record')
    expect(startBtn).toBeTruthy()
    startBtn?.click()

    expect(recorder.isRecording()).toBe(true)
    expect(shadow?.textContent).toContain('Recording (0)')

    // Click Pause
    const pauseBtn = shadow?.querySelector<HTMLButtonElement>('#oac-btn-pause-record')
    expect(pauseBtn).toBeTruthy()
    pauseBtn?.click()

    expect(recorder.getState().state).toBe('paused')
    expect(shadow?.textContent).toContain('Paused (0)')

    // Click Resume
    const resumeBtn = shadow?.querySelector<HTMLButtonElement>('#oac-btn-resume-record')
    expect(resumeBtn).toBeTruthy()
    resumeBtn?.click()

    expect(recorder.isRecording()).toBe(true)
    expect(shadow?.textContent).toContain('Recording (0)')

    // Click Stop & Review
    const stopBtn = shadow?.querySelector<HTMLButtonElement>('#oac-btn-stop-record')
    expect(stopBtn).toBeTruthy()
    stopBtn?.click()

    expect(recorder.isRecording()).toBe(false)
    expect(modal.open).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'test_proj' }),
    )

    handle.destroy()
  })
})

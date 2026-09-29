/**
 * In-Page Swagger Floating Scenario Recorder Toolbar.
 *
 * Mounts a floating control toolbar (#oac-scenario-bar-host) inside a Shadow DOM
 * over Swagger UI, providing 1-click Record, Pause, Resume, and Stop & Review controls.
 */

import shadowCss from '@/styles/index.css?inline'
import type { SwaggerAdapter } from '@/adapters/types'
import type { ScenarioRecorderService } from '@/modules/workflows/recorder/recorder-service'
import type { ScenarioModalHandle } from './scenario-modal'
import type { EventBus } from '@/core/events'

const HOST_ID = 'oac-scenario-bar-host'

export interface SwaggerScenarioRecorderHandle {
  destroy(): void
  update(): void
}

export function mountSwaggerScenarioRecorder(
  adapter: SwaggerAdapter,
  recorder: ScenarioRecorderService,
  modal: ScenarioModalHandle,
  bus?: EventBus,
  doc: Document = document,
): SwaggerScenarioRecorderHandle {
  doc.getElementById(HOST_ID)?.remove()

  const host = doc.createElement('div')
  host.id = HOST_ID
  host.style.position = 'fixed'
  host.style.top = '14px'
  host.style.right = '24px'
  host.style.zIndex = '99998'
  host.style.pointerEvents = 'auto'

  const shadow = host.attachShadow({ mode: 'open' })

  const style = doc.createElement('style')
  style.textContent = `
    ${shadowCss}
    @keyframes pulse-red {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(1.15); }
    }
    .animate-pulse-red {
      animation: pulse-red 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }
  `

  const container = doc.createElement('div')
  container.className = 'font-sans text-xs'
  shadow.append(style, container)
  ;(doc.body ?? doc.documentElement).append(host)

  const unsubs: Array<() => void> = []

  function render(): void {
    const state = recorder.getState()
    const stepCount = state.steps.length

    if (state.state === 'idle') {
      container.innerHTML = `
        <button
          id="oac-btn-start-record"
          type="button"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/95 dark:bg-slate-900/95 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 shadow-md hover:shadow-lg hover:border-rose-400 dark:hover:border-rose-500 transition-all font-medium backdrop-blur cursor-pointer select-none active:scale-95"
          title="Record API calls executed in Swagger UI and convert into a reusable Workflow"
        >
          <span class="inline-block w-2.5 h-2.5 rounded-full bg-rose-500"></span>
          <span>Record Scenario</span>
        </button>
      `

      const startBtn = container.querySelector('#oac-btn-start-record')
      startBtn?.addEventListener('click', () => {
        recorder.start()
        render()
      })
    } else if (state.state === 'recording') {
      container.innerHTML = `
        <div class="flex items-center gap-2 p-1.5 pr-2 rounded-full bg-white/95 dark:bg-slate-900/95 border border-rose-300 dark:border-rose-800/80 shadow-lg backdrop-blur">
          <div class="flex items-center gap-1.5 pl-2 pr-1 font-semibold text-rose-600 dark:text-rose-400">
            <span class="inline-block w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse-red"></span>
            <span>Recording (${stepCount})</span>
          </div>

          <button
            id="oac-btn-pause-record"
            type="button"
            class="px-2.5 py-1 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium transition-colors cursor-pointer select-none"
            title="Pause recording"
          >
            Pause
          </button>

          <button
            id="oac-btn-stop-record"
            type="button"
            class="px-2.5 py-1 rounded-full bg-rose-600 hover:bg-rose-700 text-white font-semibold transition-colors cursor-pointer select-none shadow-sm"
            title="Stop recording and review steps"
          >
            Stop & Review
          </button>
        </div>
      `

      container.querySelector('#oac-btn-pause-record')?.addEventListener('click', () => {
        recorder.pause()
        render()
      })

      container.querySelector('#oac-btn-stop-record')?.addEventListener('click', () => {
        const scenario = recorder.stop()
        render()
        modal.open(scenario)
      })
    } else if (state.state === 'paused') {
      container.innerHTML = `
        <div class="flex items-center gap-2 p-1.5 pr-2 rounded-full bg-white/95 dark:bg-slate-900/95 border border-amber-300 dark:border-amber-800/80 shadow-lg backdrop-blur">
          <div class="flex items-center gap-1.5 pl-2 pr-1 font-semibold text-amber-600 dark:text-amber-400">
            <span class="inline-block w-2.5 h-2.5 rounded-full bg-amber-500"></span>
            <span>Paused (${stepCount})</span>
          </div>

          <button
            id="oac-btn-resume-record"
            type="button"
            class="px-2.5 py-1 rounded-full bg-amber-500 hover:bg-amber-600 text-white font-medium transition-colors cursor-pointer select-none"
            title="Resume recording"
          >
            Resume
          </button>

          <button
            id="oac-btn-stop-record"
            type="button"
            class="px-2.5 py-1 rounded-full bg-slate-800 hover:bg-slate-900 text-white font-semibold transition-colors cursor-pointer select-none"
            title="Stop recording and review steps"
          >
            Stop & Review
          </button>
        </div>
      `

      container.querySelector('#oac-btn-resume-record')?.addEventListener('click', () => {
        recorder.resume()
        render()
      })

      container.querySelector('#oac-btn-stop-record')?.addEventListener('click', () => {
        const scenario = recorder.stop()
        render()
        modal.open(scenario)
      })
    }
  }

  // Intercept Swagger executions
  const recentSignatures = new Map<string, string>()

  const unsubExec = adapter.onExecute?.((endpointId) => {
    if (!recorder.isRecording()) return

    // Snapshot existing responses
    const currentResponses = adapter.readExecutedResponses()
    for (const r of currentResponses) {
      if (r.endpointId.toLowerCase() === endpointId.toLowerCase()) {
        recentSignatures.set(endpointId.toLowerCase(), `${r.status}:${r.responseBody ?? ''}`)
      }
    }

    // Poll briefly for fresh response to render
    const startTime = Date.now()
    const checkInterval = setInterval(() => {
      if (!recorder.isRecording()) {
        clearInterval(checkInterval)
        return
      }

      const freshResponses = adapter.readExecutedResponses()
      for (const res of freshResponses) {
        if (res.endpointId.toLowerCase() !== endpointId.toLowerCase()) continue
        const sig = `${res.status}:${res.responseBody ?? ''}`
        const oldSig = recentSignatures.get(endpointId.toLowerCase())

        if (sig !== oldSig) {
          recentSignatures.set(endpointId.toLowerCase(), sig)
          clearInterval(checkInterval)
          recorder.recordExecution(res)
          render()
          return
        }
      }

      if (Date.now() - startTime > 15000) {
        clearInterval(checkInterval)
      }
    }, 200)
  })

  if (unsubExec) unsubs.push(unsubExec)

  // Subscribe to bus events
  if (bus) {
    const unsubStep = bus.subscribe('SCENARIO_STEP_CAPTURED', () => render())
    const unsubStart = bus.subscribe('SCENARIO_RECORDING_STARTED', () => render())
    const unsubStop = bus.subscribe('SCENARIO_RECORDING_STOPPED', () => render())
    unsubs.push(unsubStep, unsubStart, unsubStop)
  }

  render()

  return {
    destroy: () => {
      unsubs.forEach((u) => u())
      host.remove()
    },
    update: render,
  }
}

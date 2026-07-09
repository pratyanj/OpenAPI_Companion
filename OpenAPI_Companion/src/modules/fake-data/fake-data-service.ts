import { ok, err, type Result, type AppError } from '@/types'
import { projectKey, type StorageService } from '@/core/storage'
import type { EventBus } from '@/core/events'
import type { SwaggerAdapter } from '@/adapters'
import { generate, type Rng } from './generators'
import { detectGenerator } from './detect'
import type { FakeDataPreview, FieldInfo, GenerateOptions, GenerateResult } from './types'

export interface FakeDataServiceOptions {
  adapter: SwaggerAdapter
  bus?: EventBus
  storage?: StorageService
  projectId?: string
  /** Injectable 0..1 random source for deterministic tests. */
  rng?: Rng
}

interface Prefs {
  overwrite: boolean
}

const noRequest = (): AppError => ({
  code: 'FAKE_DATA_NO_REQUEST',
  message: 'Open a request with a JSON body in Swagger first.',
  recoverable: true,
})

/** Values treated as Swagger placeholders — safe to fill without overwriting edits. */
function isPlaceholder(value: unknown): boolean {
  return value === '' || value === 'string' || value === 0 || value === null
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Generates realistic test data into the open request body (FDD-005, EPIC-07).
 *
 * Works entirely on the request's JSON body (the field developers most want
 * filled): it reads the open operation via the adapter, walks the parsed JSON,
 * fills detected fields, and writes the body back — never executing anything
 * (business rule). Manual edits are preserved unless `overwrite` is set; fields
 * with no confident type are left untouched (EC-029).
 */
export class FakeDataService {
  private readonly adapter: SwaggerAdapter
  private readonly bus: EventBus | undefined
  private readonly storage: StorageService | undefined
  private readonly projectId: string | undefined
  private readonly rng: Rng

  constructor(options: FakeDataServiceOptions) {
    this.adapter = options.adapter
    this.bus = options.bus
    this.storage = options.storage
    this.projectId = options.projectId
    this.rng = options.rng ?? Math.random
  }

  private prefsKey(): string | null {
    return this.projectId ? projectKey(this.projectId, 'fake-data', 'presets') : null
  }

  /** Persisted generator preferences (T-07.5). Best-effort; defaults if absent. */
  async loadPrefs(): Promise<Prefs> {
    const key = this.prefsKey()
    if (!key || !this.storage) return { overwrite: false }
    const got = await this.storage.getData<Prefs>(key)
    return got.ok && got.value ? got.value : { overwrite: false }
  }

  async savePrefs(prefs: Prefs): Promise<void> {
    const key = this.prefsKey()
    if (!key || !this.storage) return
    await this.storage.set(key, prefs, { immediate: true })
  }

  /** The first open operation whose body parses to a JSON object, if any. */
  private findOpenObjectRequest(): {
    endpointId: string
    method: string
    body: Record<string, unknown>
  } | null {
    for (const snapshot of this.adapter.readOpenRequests()) {
      if (!snapshot.body) continue
      try {
        const parsed: unknown = JSON.parse(snapshot.body)
        if (isPlainObject(parsed)) {
          return { endpointId: snapshot.endpointId, method: snapshot.method, body: parsed }
        }
      } catch {
        // Non-JSON body — not supported in v1.
      }
    }
    return null
  }

  /** Describe the open request's top-level fields for the panel (sync, no writes). */
  previewOpenRequest(): FakeDataPreview | null {
    const open = this.findOpenObjectRequest()
    if (!open) return null
    const fields: FieldInfo[] = Object.entries(open.body).map(([key, value]) => ({
      key,
      value,
      generator: detectGenerator(key, value),
    }))
    return { endpointId: open.endpointId, method: open.method, fields }
  }

  /**
   * Recursively fill a value. Returns the (possibly new) value and increments
   * `counter.n` for each field actually generated.
   */
  private fillValue(
    name: string,
    value: unknown,
    overwrite: boolean,
    counter: { n: number },
  ): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.fillValue(name, item, overwrite, counter))
    }
    if (isPlainObject(value)) {
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(value)) out[k] = this.fillValue(k, v, overwrite, counter)
      return out
    }
    const key = detectGenerator(name, value)
    if (!key) return value // unsupported — leave unchanged (EC-029)
    if (!overwrite && !isPlaceholder(value)) return value // preserve manual edit
    counter.n += 1
    return generate(key, this.rng)
  }

  private async applyToOpenRequest(
    mutate: (body: Record<string, unknown>, counter: { n: number }) => Record<string, unknown>,
  ): Promise<Result<GenerateResult>> {
    const open = this.findOpenObjectRequest()
    if (!open) return err(noRequest())
    const counter = { n: 0 }
    const next = mutate(open.body, counter)
    const written = this.adapter.writeRequest(open.endpointId, {
      endpointId: open.endpointId,
      method: open.method,
      body: JSON.stringify(next, null, 2),
    })
    if (!written.ok) return written
    this.bus?.publish('FAKE_DATA_GENERATED', { endpointId: open.endpointId, fieldCount: counter.n })
    return ok({ endpointId: open.endpointId, fieldCount: counter.n })
  }

  /** Fill every detected field of the open request (FR-FDG-005). */
  generateAll(options: GenerateOptions = {}): Promise<Result<GenerateResult>> {
    const overwrite = options.overwrite ?? false
    return this.applyToOpenRequest((body, counter) => {
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(body)) out[k] = this.fillValue(k, v, overwrite, counter)
      return out
    })
  }

  /** Regenerate a single top-level field, always overwriting it (FR-FDG-004). */
  regenerateField(fieldKey: string): Promise<Result<GenerateResult>> {
    return this.applyToOpenRequest((body, counter) => {
      if (!(fieldKey in body)) return body
      return { ...body, [fieldKey]: this.fillValue(fieldKey, body[fieldKey], true, counter) }
    })
  }
}

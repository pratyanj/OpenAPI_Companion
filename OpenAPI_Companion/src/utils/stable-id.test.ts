import { describe, it, expect } from 'vitest'
import { stableId } from './stable-id'

describe('stableId', () => {
  it('is deterministic for the same inputs', () => {
    const a = stableId('project', 'https://localhost:8000', '/openapi.json', 'swagger-ui')
    const b = stableId('project', 'https://localhost:8000', '/openapi.json', 'swagger-ui')
    expect(a).toBe(b)
  })

  it('differs when any input part differs', () => {
    const a = stableId('project', 'https://localhost:8000', '/openapi.json', 'swagger-ui')
    const b = stableId('project', 'https://localhost:8001', '/openapi.json', 'swagger-ui')
    expect(a).not.toBe(b)
  })

  it('applies the prefix and an 8-char hex hash', () => {
    const id = stableId('project', 'x')
    expect(id).toMatch(/^project_[0-9a-f]{8}$/)
  })
})

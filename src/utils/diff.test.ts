import { describe, it, expect } from 'vitest'
import {
  computeLineDiff,
  computeJsonDiff,
  compareHeaders,
  compareMetrics,
  formatPayload,
} from './diff'

describe('diff utilities', () => {
  describe('formatPayload', () => {
    it('prettifies valid JSON', () => {
      const raw = '{"a":1,"b":[2,3]}'
      expect(formatPayload(raw)).toBe('{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}')
    })

    it('returns raw text if not JSON', () => {
      expect(formatPayload('Hello World')).toBe('Hello World')
    })

    it('returns empty string for falsy/empty values', () => {
      expect(formatPayload('')).toBe('')
      expect(formatPayload(undefined)).toBe('')
    })
  })

  describe('computeLineDiff', () => {
    it('returns no changes when strings are identical', () => {
      const text = 'line 1\nline 2\nline 3'
      const res = computeLineDiff(text, text)

      expect(res.hasChanges).toBe(false)
      expect(res.additions).toBe(0)
      expect(res.deletions).toBe(0)
      expect(res.unified).toHaveLength(3)
      expect(res.unified.every((l) => l.type === 'same')).toBe(true)
      expect(res.sideBySide).toHaveLength(3)
      expect(res.sideBySide.every((r) => r.left.type === 'same' && r.right.type === 'same')).toBe(
        true,
      )
    })

    it('detects line additions and removals', () => {
      const textA = 'apple\nbanana\ncherry'
      const textB = 'apple\nblueberry\ncherry\ndate'

      const res = computeLineDiff(textA, textB)

      expect(res.hasChanges).toBe(true)
      expect(res.additions).toBe(2) // blueberry, date
      expect(res.deletions).toBe(1) // banana

      // Unified check
      const removed = res.unified.filter((l) => l.type === 'removed')
      const added = res.unified.filter((l) => l.type === 'added')
      expect(removed.map((l) => l.text)).toEqual(['banana'])
      expect(added.map((l) => l.text)).toEqual(['blueberry', 'date'])

      // Side-by-side alignment check
      expect(res.sideBySide).toHaveLength(4)
      // row 0: apple (same)
      expect(res.sideBySide[0]?.left.text).toBe('apple')
      expect(res.sideBySide[0]?.right.text).toBe('apple')
      // row 1: banana (removed) aligned with blueberry (added)
      expect(res.sideBySide[1]?.left.text).toBe('banana')
      expect(res.sideBySide[1]?.left.type).toBe('removed')
      expect(res.sideBySide[1]?.right.text).toBe('blueberry')
      expect(res.sideBySide[1]?.right.type).toBe('added')
      // row 2: cherry (same)
      expect(res.sideBySide[2]?.left.text).toBe('cherry')
      expect(res.sideBySide[2]?.right.text).toBe('cherry')
      // row 3: empty left, date right (added)
      expect(res.sideBySide[3]?.left.type).toBe('empty')
      expect(res.sideBySide[3]?.right.text).toBe('date')
    })

    it('handles empty inputs cleanly', () => {
      const res = computeLineDiff('', '')
      expect(res.hasChanges).toBe(false)
      expect(res.unified).toHaveLength(0)
      expect(res.sideBySide).toHaveLength(0)

      const res2 = computeLineDiff('hello', '')
      expect(res2.hasChanges).toBe(true)
      expect(res2.deletions).toBe(1)
      expect(res2.additions).toBe(0)

      const res3 = computeLineDiff('', 'world')
      expect(res3.hasChanges).toBe(true)
      expect(res3.additions).toBe(1)
      expect(res3.deletions).toBe(0)
    })
  })

  describe('computeJsonDiff', () => {
    it('detects additions, deletions, and modifications in JSON objects', () => {
      const jsonA = {
        id: 1,
        name: 'Alice',
        settings: { theme: 'light', active: true },
        tags: ['admin', 'user'],
      }
      const jsonB = {
        id: 1,
        name: 'Alice Cooper',
        settings: { theme: 'dark', active: true, extra: 42 },
        tags: ['admin', 'superuser'],
      }

      const res = computeJsonDiff(jsonA, jsonB)

      expect(res.addedCount).toBe(1) // settings.extra
      expect(res.removedCount).toBe(0)
      expect(res.modifiedCount).toBe(3) // name, settings.theme, tags[1]

      const paths = res.entries.map((e) => e.path)
      expect(paths).toContain('name')
      expect(paths).toContain('settings.theme')
      expect(paths).toContain('settings.extra')
      expect(paths).toContain('tags[1]')
    })

    it('detects removed keys', () => {
      const jsonA = { oldField: 'delete-me', common: 'keep' }
      const jsonB = { common: 'keep' }

      const res = computeJsonDiff(jsonA, jsonB)
      expect(res.removedCount).toBe(1)
      expect(res.entries[0]?.path).toBe('oldField')
      expect(res.entries[0]?.type).toBe('removed')
    })
  })

  describe('compareHeaders', () => {
    it('compares headers case-insensitively and identifies differences', () => {
      const headersA = {
        'Content-Type': 'application/json',
        Authorization: 'Bearer tokenA',
        'X-Old': 'legacy',
      }
      const headersB = {
        'content-type': 'application/json',
        authorization: 'Bearer tokenB',
        'X-New': 'fresh',
      }

      const diff = compareHeaders(headersA, headersB)

      const ct = diff.find((d) => d.key.toLowerCase() === 'content-type')
      expect(ct?.type).toBe('same')

      const auth = diff.find((d) => d.key.toLowerCase() === 'authorization')
      expect(auth?.type).toBe('modified')
      expect(auth?.valueA).toBe('Bearer tokenA')
      expect(auth?.valueB).toBe('Bearer tokenB')

      const xOld = diff.find((d) => d.key.toLowerCase() === 'x-old')
      expect(xOld?.type).toBe('removed')

      const xNew = diff.find((d) => d.key.toLowerCase() === 'x-new')
      expect(xNew?.type).toBe('added')
    })
  })

  describe('compareMetrics', () => {
    it('computes latency delta, percentage, size delta, and status changes', () => {
      const recA = {
        status: 200,
        durationMs: 50,
        responseBody: '{"success":true}',
        timestamp: 1000,
      }
      const recB = {
        status: 404,
        durationMs: 125,
        responseBody: '{"error":"Not Found","code":404}',
        timestamp: 2000,
      }

      const metrics = compareMetrics(recA, recB)

      expect(metrics.statusA).toBe(200)
      expect(metrics.statusB).toBe(404)
      expect(metrics.statusChanged).toBe(true)

      expect(metrics.durationA).toBe(50)
      expect(metrics.durationB).toBe(125)
      expect(metrics.durationDelta).toBe(75) // 125 - 50 = +75ms
      expect(metrics.durationPercentDelta).toBe(150) // 75/50 = +150%

      expect(metrics.sizeDelta).toBeGreaterThan(0)
    })
  })
})

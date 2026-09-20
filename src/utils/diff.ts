/**
 * Zero-dependency, high-performance Diff Engine for OpenAPI Companion.
 * Provides line-by-line Myers/LCS text comparison, Side-by-Side row alignment,
 * semantic JSON key path comparison, header delta analysis, and latency/status metrics.
 */

export type DiffLineType = 'same' | 'added' | 'removed' | 'empty'

export interface DiffLine {
  type: DiffLineType
  text: string
  lineNumber?: number
}

export interface SideBySideRow {
  left: DiffLine
  right: DiffLine
}

export interface LineDiffResult {
  unified: DiffLine[]
  sideBySide: SideBySideRow[]
  hasChanges: boolean
  additions: number
  deletions: number
}

/** Formats JSON if valid, otherwise returns string trimmed. */
export function formatPayload(raw?: string): string {
  if (!raw || !raw.trim()) return ''
  try {
    return JSON.stringify(JSON.parse(raw.trim()), null, 2)
  } catch {
    return raw.trim()
  }
}

/**
 * Computes Longest Common Subsequence (LCS) matrix for two line arrays.
 */
function computeLcsMatrix(a: string[], b: string[]): number[][] {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    const aLine = a[i - 1]
    for (let j = 1; j <= n; j++) {
      if (aLine === b[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]! + 1
      } else {
        dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!)
      }
    }
  }

  return dp
}

/**
 * Computes unified and side-by-side line diffs between textA (baseline) and textB (comparison).
 */
export function computeLineDiff(textA: string, textB: string): LineDiffResult {
  const linesA = textA ? textA.split(/\r?\n/) : []
  const linesB = textB ? textB.split(/\r?\n/) : []

  if (linesA.length === 0 && linesB.length === 0) {
    return {
      unified: [],
      sideBySide: [],
      hasChanges: false,
      additions: 0,
      deletions: 0,
    }
  }

  const dp = computeLcsMatrix(linesA, linesB)
  let i = linesA.length
  let j = linesB.length

  // Backtrack from bottom-right of matrix to build raw sequence
  type RawStep = {
    type: 'same' | 'added' | 'removed'
    text: string
    lineA?: number
    lineB?: number
  }
  const steps: RawStep[] = []

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && linesA[i - 1] === linesB[j - 1]) {
      steps.push({ type: 'same', text: linesA[i - 1]!, lineA: i, lineB: j })
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i]![j - 1]! >= dp[i - 1]![j]!)) {
      steps.push({ type: 'added', text: linesB[j - 1]!, lineB: j })
      j--
    } else if (i > 0 && (j === 0 || dp[i]![j - 1]! < dp[i - 1]![j]!)) {
      steps.push({ type: 'removed', text: linesA[i - 1]!, lineA: i })
      i--
    }
  }

  steps.reverse()

  const unified: DiffLine[] = []
  let additions = 0
  let deletions = 0

  for (const step of steps) {
    if (step.type === 'added') {
      additions++
      unified.push({ type: 'added', text: step.text, lineNumber: step.lineB })
    } else if (step.type === 'removed') {
      deletions++
      unified.push({ type: 'removed', text: step.text, lineNumber: step.lineA })
    } else {
      unified.push({ type: 'same', text: step.text, lineNumber: step.lineB })
    }
  }

  // Align for Side-by-Side split view:
  // Pair contiguous removed blocks and added blocks row by row
  const sideBySide: SideBySideRow[] = []
  let s = 0

  while (s < steps.length) {
    const cur = steps[s]!
    if (cur.type === 'same') {
      sideBySide.push({
        left: { type: 'same', text: cur.text, lineNumber: cur.lineA },
        right: { type: 'same', text: cur.text, lineNumber: cur.lineB },
      })
      s++
    } else {
      // Gather contiguous block of changes
      const removedBlock: RawStep[] = []
      const addedBlock: RawStep[] = []

      while (s < steps.length && steps[s]!.type !== 'same') {
        if (steps[s]!.type === 'removed') {
          removedBlock.push(steps[s]!)
        } else {
          addedBlock.push(steps[s]!)
        }
        s++
      }

      const maxLen = Math.max(removedBlock.length, addedBlock.length)
      for (let k = 0; k < maxLen; k++) {
        const rem = removedBlock[k]
        const add = addedBlock[k]

        const left: DiffLine = rem
          ? { type: 'removed', text: rem.text, lineNumber: rem.lineA }
          : { type: 'empty', text: '' }

        const right: DiffLine = add
          ? { type: 'added', text: add.text, lineNumber: add.lineB }
          : { type: 'empty', text: '' }

        sideBySide.push({ left, right })
      }
    }
  }

  return {
    unified,
    sideBySide,
    hasChanges: additions > 0 || deletions > 0,
    additions,
    deletions,
  }
}

export interface JsonDiffEntry {
  path: string
  type: 'added' | 'removed' | 'modified'
  oldValue?: unknown
  newValue?: unknown
}

export interface JsonDiffSummary {
  entries: JsonDiffEntry[]
  addedCount: number
  removedCount: number
  modifiedCount: number
}

/**
 * Compares two JSON values recursively and returns detailed key-path differences.
 */
export function computeJsonDiff(a: unknown, b: unknown): JsonDiffSummary {
  const entries: JsonDiffEntry[] = []

  function walk(path: string, valA: unknown, valB: unknown) {
    if (valA === valB) return

    // If either is null or undefined
    if (valA === undefined && valB !== undefined) {
      entries.push({ path, type: 'added', newValue: valB })
      return
    }
    if (valA !== undefined && valB === undefined) {
      entries.push({ path, type: 'removed', oldValue: valA })
      return
    }

    const typeA = typeof valA
    const typeB = typeof valB

    // Different primitive types or null vs non-null
    if (valA === null || valB === null || typeA !== typeB) {
      entries.push({ path, type: 'modified', oldValue: valA, newValue: valB })
      return
    }

    // Both are Arrays
    if (Array.isArray(valA) && Array.isArray(valB)) {
      const maxLen = Math.max(valA.length, valB.length)
      for (let i = 0; i < maxLen; i++) {
        const itemPath = `${path}[${i}]`
        walk(itemPath, valA[i], valB[i])
      }
      return
    }

    // Both are Objects
    if (typeA === 'object' && !Array.isArray(valA) && !Array.isArray(valB)) {
      const objA = valA as Record<string, unknown>
      const objB = valB as Record<string, unknown>
      const allKeys = new Set([...Object.keys(objA), ...Object.keys(objB)])

      for (const key of allKeys) {
        const subPath = path ? `${path}.${key}` : key
        walk(subPath, objA[key], objB[key])
      }
      return
    }

    // Primitives with different values
    entries.push({ path, type: 'modified', oldValue: valA, newValue: valB })
  }

  walk('', a, b)

  let addedCount = 0
  let removedCount = 0
  let modifiedCount = 0

  for (const e of entries) {
    if (e.type === 'added') addedCount++
    else if (e.type === 'removed') removedCount++
    else modifiedCount++
  }

  return { entries, addedCount, removedCount, modifiedCount }
}

export interface HeaderDiffItem {
  key: string
  valueA?: string
  valueB?: string
  type: 'same' | 'added' | 'removed' | 'modified'
}

/**
 * Compares two header maps (case-insensitively).
 */
export function compareHeaders(
  headersA?: Record<string, string>,
  headersB?: Record<string, string>,
): HeaderDiffItem[] {
  const normA = new Map<string, { originalKey: string; val: string }>()
  const normB = new Map<string, { originalKey: string; val: string }>()

  if (headersA) {
    for (const [k, v] of Object.entries(headersA)) {
      normA.set(k.toLowerCase(), { originalKey: k, val: v })
    }
  }

  if (headersB) {
    for (const [k, v] of Object.entries(headersB)) {
      normB.set(k.toLowerCase(), { originalKey: k, val: v })
    }
  }

  const allLowerKeys = new Set([...normA.keys(), ...normB.keys()])
  const result: HeaderDiffItem[] = []

  for (const lk of Array.from(allLowerKeys).sort()) {
    const itemA = normA.get(lk)
    const itemB = normB.get(lk)
    const key = itemA?.originalKey ?? itemB?.originalKey ?? lk

    if (itemA && itemB) {
      if (itemA.val === itemB.val) {
        result.push({ key, valueA: itemA.val, valueB: itemB.val, type: 'same' })
      } else {
        result.push({ key, valueA: itemA.val, valueB: itemB.val, type: 'modified' })
      }
    } else if (itemA && !itemB) {
      result.push({ key, valueA: itemA.val, type: 'removed' })
    } else if (!itemA && itemB) {
      result.push({ key, valueB: itemB.val, type: 'added' })
    }
  }

  return result
}

export interface MetricsDiff {
  statusA: number
  statusB: number
  statusChanged: boolean
  durationA?: number
  durationB?: number
  durationDelta?: number // durationB - durationA (positive = slower)
  durationPercentDelta?: number
  sizeA: number
  sizeB: number
  sizeDelta: number // sizeB - sizeA
  timestampA: number
  timestampB: number
}

/**
 * Computes status, latency delta, and payload byte size comparison.
 */
export function compareMetrics(
  recordA: { status: number; durationMs?: number; responseBody?: string; timestamp: number },
  recordB: { status: number; durationMs?: number; responseBody?: string; timestamp: number },
): MetricsDiff {
  const statusChanged = recordA.status !== recordB.status
  const sizeA = recordA.responseBody ? new TextEncoder().encode(recordA.responseBody).length : 0
  const sizeB = recordB.responseBody ? new TextEncoder().encode(recordB.responseBody).length : 0
  const sizeDelta = sizeB - sizeA

  let durationDelta: number | undefined
  let durationPercentDelta: number | undefined

  if (recordA.durationMs != null && recordB.durationMs != null) {
    durationDelta = recordB.durationMs - recordA.durationMs
    if (recordA.durationMs > 0) {
      durationPercentDelta = Math.round((durationDelta / recordA.durationMs) * 100)
    }
  }

  return {
    statusA: recordA.status,
    statusB: recordB.status,
    statusChanged,
    durationA: recordA.durationMs,
    durationB: recordB.durationMs,
    durationDelta,
    durationPercentDelta,
    sizeA,
    sizeB,
    sizeDelta,
    timestampA: recordA.timestamp,
    timestampB: recordB.timestamp,
  }
}

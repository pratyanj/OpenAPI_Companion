export interface JsonCandidate {
  path: string
  suggestedName: string
  value: string
  isLikelySecret: boolean
}

export function extractJsonCandidates(raw: string): JsonCandidate[] {
  if (!raw || !raw.trim()) return []
  try {
    const data = JSON.parse(raw)
    const candidates: JsonCandidate[] = []

    function toVarName(path: string): string {
      return path
        .replace(/\[\d+\]/g, '')
        .replace(/[^a-zA-Z0-9_.]/g, '_')
        .replace(/[.]/g, '_')
        .replace(/([a-z])([A-Z])/g, '$1_$2')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .toUpperCase()
    }

    function isSecretKey(key: string): boolean {
      return /token|secret|key|password|jwt|auth|hash|session|credential/i.test(key)
    }

    function traverse(obj: unknown, prefix = '', depth = 0) {
      if (depth > 4 || obj === null || obj === undefined) return

      if (typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'boolean') {
        const strVal = String(obj)
        // Skip huge values (e.g. base64 image strings > 1000 chars)
        if (strVal.length > 2000) return
        const pathName = prefix || 'value'
        candidates.push({
          path: pathName,
          suggestedName: toVarName(pathName) || 'VAR',
          value: strVal,
          isLikelySecret: isSecretKey(pathName),
        })
        return
      }

      if (Array.isArray(obj)) {
        for (let i = 0; i < Math.min(obj.length, 2); i++) {
          traverse(obj[i], prefix ? `${prefix}[${i}]` : `[${i}]`, depth + 1)
        }
        return
      }

      if (typeof obj === 'object') {
        for (const [k, v] of Object.entries(obj)) {
          const nextPath = prefix ? `${prefix}.${k}` : k
          traverse(v, nextPath, depth + 1)
        }
      }
    }

    traverse(data)

    // Sort: secrets and IDs first, then path length
    candidates.sort((a, b) => {
      const aScore = a.isLikelySecret ? 2 : /id$/i.test(a.path) ? 1 : 0
      const bScore = b.isLikelySecret ? 2 : /id$/i.test(b.path) ? 1 : 0
      return bScore - aScore
    })

    return candidates
  } catch {
    return []
  }
}

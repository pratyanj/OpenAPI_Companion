/**
 * Deterministic short id from input parts, via FNV-1a (32-bit). Same inputs
 * always yield the same id across sessions/restarts — used for project ids
 * (planning/08 §4: `project_<hash>` of origin + OpenAPI URL + doc type).
 */
export function stableId(prefix: string, ...parts: string[]): string {
  const input = parts.join('|')
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  const hex = (hash >>> 0).toString(16).padStart(8, '0')
  return `${prefix}_${hex}`
}

import type { CodeGenRequest, CodeLang } from './types'

/**
 * Code-snippet generators (T-08.5, FR-PROD-004…006). Pure string builders — no
 * DOM, no I/O — so they're trivially fast (< 30 ms) and unit-testable. Output is
 * meant to run with minimal edits: JSON bodies are inlined as real objects
 * (fetch/axios) or single-quoted payloads (cURL).
 */

/** Parse a body string as JSON; return the value + whether it parsed. */
function parseBody(body: string | undefined): { json: unknown; isJson: boolean } {
  if (body == null || body === '') return { json: undefined, isJson: false }
  try {
    return { json: JSON.parse(body), isJson: true }
  } catch {
    return { json: body, isJson: false }
  }
}

function indentLines(text: string, spaces: number): string {
  const pad = ' '.repeat(spaces)
  return text
    .split('\n')
    .map((line) => pad + line)
    .join('\n')
}

function curl(req: CodeGenRequest): string {
  const parts = [`curl -X ${req.method.toUpperCase()} '${req.url}'`]
  for (const [key, value] of Object.entries(req.headers)) {
    parts.push(`  -H '${key}: ${value.replace(/'/g, "'\\''")}'`)
  }
  if (req.body) {
    parts.push(`  -d '${req.body.replace(/'/g, "'\\''")}'`)
  }
  return parts.join(' \\\n')
}

function fetchCode(req: CodeGenRequest): string {
  const { json, isJson } = parseBody(req.body)
  const lines = [`await fetch('${req.url}', {`, `  method: '${req.method.toUpperCase()}',`]
  const headerEntries = Object.entries(req.headers)
  if (headerEntries.length) {
    lines.push('  headers: {')
    lines.push(
      headerEntries.map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n'),
    )
    lines.push('  },')
  }
  if (req.body) {
    const payload = isJson
      ? `JSON.stringify(${indentLines(JSON.stringify(json, null, 2), 2).trimStart()})`
      : JSON.stringify(req.body)
    lines.push(`  body: ${payload},`)
  }
  lines.push('})')
  return lines.join('\n')
}

function axiosCode(req: CodeGenRequest): string {
  const { json, isJson } = parseBody(req.body)
  const lines = [
    `await axios({`,
    `  method: '${req.method.toLowerCase()}',`,
    `  url: '${req.url}',`,
  ]
  const headerEntries = Object.entries(req.headers)
  if (headerEntries.length) {
    lines.push('  headers: {')
    lines.push(
      headerEntries.map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n'),
    )
    lines.push('  },')
  }
  if (req.body) {
    const data = isJson
      ? indentLines(JSON.stringify(json, null, 2), 2).trimStart()
      : JSON.stringify(req.body)
    lines.push(`  data: ${data},`)
  }
  lines.push('})')
  return lines.join('\n')
}

export function generateCode(lang: CodeLang, req: CodeGenRequest): string {
  switch (lang) {
    case 'curl':
      return curl(req)
    case 'fetch':
      return fetchCode(req)
    case 'axios':
      return axiosCode(req)
  }
}

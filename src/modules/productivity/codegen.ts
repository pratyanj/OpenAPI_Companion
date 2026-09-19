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

function powershell(req: CodeGenRequest): string {
  // Invoke-RestMethod — single-quoted PowerShell strings escape ' by doubling it.
  const ps = (v: string) => `'${v.replace(/'/g, "''")}'`
  const parts = [`Invoke-RestMethod -Method ${req.method.toUpperCase()} -Uri ${ps(req.url)}`]
  const headerEntries = Object.entries(req.headers)
  if (headerEntries.length) {
    const pairs = headerEntries.map(([k, v]) => `${ps(k)} = ${ps(v)}`).join('; ')
    parts.push(`-Headers @{ ${pairs} }`)
  }
  if (req.body) parts.push(`-Body ${ps(req.body)}`)
  return parts.join(' `\n  ')
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

function formatPythonLiteral(val: unknown, indent = 0): string {
  if (val === null || val === undefined) return 'None'
  if (typeof val === 'boolean') return val ? 'True' : 'False'
  if (typeof val === 'number') return String(val)
  if (typeof val === 'string') {
    return "'" + val.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'"
  }
  const pad = ' '.repeat(indent + 4)
  if (Array.isArray(val)) {
    if (val.length === 0) return '[]'
    return (
      '[\n' +
      val.map((v) => pad + formatPythonLiteral(v, indent + 4)).join(',\n') +
      '\n' +
      ' '.repeat(indent) +
      ']'
    )
  }
  if (typeof val === 'object') {
    const keys = Object.keys(val as Record<string, unknown>)
    if (keys.length === 0) return '{}'
    return (
      '{\n' +
      keys
        .map(
          (k) =>
            pad +
            "'" +
            k.replace(/'/g, "\\'") +
            "': " +
            formatPythonLiteral((val as Record<string, unknown>)[k], indent + 4),
        )
        .join(',\n') +
      '\n' +
      ' '.repeat(indent) +
      '}'
    )
  }
  return String(val)
}

function pythonCode(req: CodeGenRequest): string {
  const lines = ['import requests', '', `url = '${req.url.replace(/'/g, "\\'")}'`]
  const headerEntries = Object.entries(req.headers || {})
  if (headerEntries.length) {
    lines.push('headers = {')
    for (const [k, v] of headerEntries) {
      lines.push(`    '${k.replace(/'/g, "\\'")}': '${v.replace(/'/g, "\\'")}',`)
    }
    lines.push('}')
  }

  let bodyArg = ''
  if (req.body) {
    const { json, isJson } = parseBody(req.body)
    if (isJson) {
      lines.push('json_data = ' + formatPythonLiteral(json))
      bodyArg = ', json=json_data'
    } else {
      lines.push(
        `data = '${req.body.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`,
      )
      bodyArg = ', data=data'
    }
  }

  const headersArg = headerEntries.length ? ', headers=headers' : ''
  const method = req.method.toLowerCase()
  const standardMethods = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options']

  if (standardMethods.includes(method)) {
    lines.push(`response = requests.${method}(url${headersArg}${bodyArg})`)
  } else {
    lines.push(
      `response = requests.request('${req.method.toUpperCase()}', url${headersArg}${bodyArg})`,
    )
  }

  lines.push('print(response.status_code)')
  lines.push('print(response.json())')

  return lines.join('\n')
}

export function generateCode(lang: CodeLang, req: CodeGenRequest): string {
  switch (lang) {
    case 'curl':
      return curl(req)
    case 'powershell':
      return powershell(req)
    case 'fetch':
      return fetchCode(req)
    case 'axios':
      return axiosCode(req)
    case 'python':
      return pythonCode(req)
  }
}

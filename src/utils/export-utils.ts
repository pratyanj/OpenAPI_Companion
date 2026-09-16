/**
 * Utility functions for exporting API response payloads as JSON or CSV files (Point 10).
 *
 * Supports:
 * - RFC 4180 compliant CSV formatting with quote and comma escaping.
 * - Automatic tabular extraction from arrays of objects and nested collection payloads (items, data, etc.).
 * - UTF-8 BOM (\uFEFF) prepending for full compatibility with Microsoft Excel and Google Sheets.
 * - Clean filename sanitization with HTTP method, endpoint path, and timestamp.
 * - Browser Blob download triggering without requiring background permissions.
 *
 * Zero-emoji policy: Strictly uses clean inline SVG vector icons for any UI representations.
 */

/**
 * Escapes a single string/value for RFC 4180 CSV compliance.
 */
export function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) return ''
  let str: string
  if (typeof val === 'object') {
    try {
      str = JSON.stringify(val)
    } catch {
      str = String(val)
    }
  } else {
    str = String(val)
  }

  // If contains comma, double-quote, newline, or carriage return, wrap in quotes and escape quotes
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/**
 * Checks if data can be represented cleanly as CSV (array of objects, single object, or array of primitives).
 */
export function isCsvExportable(data: unknown): boolean {
  if (data === null || data === undefined) return false
  if (typeof data !== 'object') return false
  if (Array.isArray(data)) {
    return data.length > 0
  }
  const keys = Object.keys(data as Record<string, unknown>)
  return keys.length > 0
}

/**
 * Extracts candidate rows from an unknown data payload.
 * If payload is an array -> returns the array.
 * If payload is an object with an array property (e.g. items, data, results, records) -> returns that array.
 * If payload is a flat object -> returns [payload].
 */
export function extractTabularData(data: unknown): { rows: unknown[]; extractedFromKey?: string } {
  if (Array.isArray(data)) {
    return { rows: data }
  }
  if (typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>
    // Check common list container keys
    const commonKeys = ['items', 'data', 'results', 'records', 'rows', 'list', 'content']
    for (const key of commonKeys) {
      if (Array.isArray(obj[key]) && (obj[key] as unknown[]).length > 0) {
        return { rows: obj[key] as unknown[], extractedFromKey: key }
      }
    }
    // Check any array property with objects
    for (const [key, val] of Object.entries(obj)) {
      if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object' && val[0] !== null) {
        return { rows: val, extractedFromKey: key }
      }
    }
    // Fallback: single object becomes a 1-row table
    return { rows: [obj] }
  }
  return { rows: [] }
}

/**
 * Converts JSON data to an RFC 4180 compliant CSV string with UTF-8 BOM.
 */
export function jsonToCsv(data: unknown): { csv?: string; error?: string } {
  if (data === null || data === undefined) {
    return { error: 'Response data is empty.' }
  }

  const { rows } = extractTabularData(data)
  if (!rows || rows.length === 0) {
    return { error: 'No tabular records found in response.' }
  }

  // Check if rows are primitive values (e.g. [1, 2, 3] or ["a", "b"])
  const isPrimitiveArray = rows.every((r) => typeof r !== 'object' || r === null)
  if (isPrimitiveArray) {
    const header = 'value'
    const bodyRows = rows.map((r) => escapeCsvField(r)).join('\r\n')
    const csvContent = '\uFEFF' + header + '\r\n' + bodyRows
    return { csv: csvContent }
  }

  // Collect all unique column keys in order of appearance
  const headerKeysSet = new Set<string>()
  for (const row of rows) {
    if (typeof row === 'object' && row !== null) {
      for (const k of Object.keys(row as Record<string, unknown>)) {
        headerKeysSet.add(k)
      }
    }
  }

  const headers = Array.from(headerKeysSet)
  if (headers.length === 0) {
    return { error: 'No property keys found to generate CSV columns.' }
  }

  const csvRows: string[] = []
  // Header line
  csvRows.push(headers.map(escapeCsvField).join(','))

  // Data rows
  for (const row of rows) {
    if (typeof row === 'object' && row !== null) {
      const rec = row as Record<string, unknown>
      const rowLine = headers.map((h) => escapeCsvField(rec[h])).join(',')
      csvRows.push(rowLine)
    } else {
      const rowLine = headers
        .map((_, i) => (i === 0 ? escapeCsvField(row) : ''))
        .join(',')
      csvRows.push(rowLine)
    }
  }

  // UTF-8 BOM + CRLF RFC 4180
  const csv = '\uFEFF' + csvRows.join('\r\n')
  return { csv }
}

/**
 * Generates clean, sanitized export filenames based on HTTP method, path, and timestamp.
 * e.g. "get_tasks_2026-09-17.json"
 */
export function sanitizeExportFilename(
  method: string,
  path: string,
  extension: 'json' | 'csv',
  date: Date = new Date(),
): string {
  const m = (method || 'response').toLowerCase().trim()
  const cleanPath = (path || '')
    .replace(/^https?:\/\/[^/]+/i, '') // strip origin if full URL
    .replace(/\?.*$/, '') // strip query params
    .replace(/[{}]/g, '') // strip path param brackets
    .replace(/[^a-zA-Z0-9_-]+/g, '_') // replace non-alphanumerics with _
    .replace(/^_+|_+$/g, '') // trim leading/trailing underscores

  const dateStr = date.toISOString().slice(0, 10) // YYYY-MM-DD
  const base = [m, cleanPath].filter(Boolean).join('_') || 'response'
  return `${base}_${dateStr}.${extension}`
}

/**
 * Triggers a browser download using Blob and a synthetic anchor click.
 */
export function triggerDownload(
  filename: string,
  content: string,
  mimeType: string,
  doc: Document = document,
): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = doc.createElement('a')
  a.href = url
  a.download = filename
  doc.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

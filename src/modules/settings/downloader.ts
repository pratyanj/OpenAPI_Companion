import { DEFAULT_BACKUP_FOLDER } from './types'

export interface DownloadOptions {
  /** Relative subfolder within the Downloads folder (e.g. 'OpenAPI-Companion-Backups'). */
  subfolder?: string
  /** Whether to prompt the user with a Save As dialog. Defaults to false. */
  saveAs?: boolean
}

export type Downloader = (
  filename: string,
  content: string,
  mime: string,
  options?: DownloadOptions,
) => void

/**
 * Sanitize a subfolder path relative to the Downloads directory.
 * - Standardizes slashes
 * - Strips leading and trailing slashes and whitespace
 * - Disallows directory traversal (..)
 * - Removes invalid filesystem characters (: * ? " < > |)
 */
export function sanitizeSubfolder(folder?: string): string {
  if (!folder) return ''
  return folder
    .trim()
    .replace(/\\/g, '/')
    .replace(/\.{2,}/g, '') // remove .. traversal
    .replace(/[:*?"<>|]/g, '') // strip invalid Windows/Unix path chars
    .replace(/^\/+|\/+$/g, '') // strip leading and trailing slashes
    .replace(/\/+/g, '/') // collapse multiple slashes
}

/** Format timestamp as YYYY-MM-DD-HHmm (e.g. 2026-09-20-2215). */
export function formatBackupDate(timestamp = Date.now()): string {
  const d = new Date(timestamp)
  const pad = (n: number) => String(n).padStart(2, '0')
  const year = d.getFullYear()
  const month = pad(d.getMonth() + 1)
  const day = pad(d.getDate())
  const hours = pad(d.getHours())
  const minutes = pad(d.getMinutes())
  return `${year}-${month}-${day}-${hours}${minutes}`
}

/** Generate a clean slug for project filenames. */
export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'project'
  )
}

/**
 * Generate human-readable timestamped backup filename:
 * - Full workspace: `openapi-companion-workspace-backup-YYYY-MM-DD-HHmm.json`
 * - Project: `openapi-companion-[project-name]-backup-YYYY-MM-DD-HHmm.json`
 */
export function formatBackupFilename(
  scope: 'all' | 'current' = 'all',
  projectName?: string,
  timestamp = Date.now(),
): string {
  const dateStr = formatBackupDate(timestamp)
  if (scope === 'current' && projectName) {
    const slug = slugify(projectName)
    return `openapi-companion-${slug}-backup-${dateStr}.json`
  }
  return `openapi-companion-backup-${dateStr}.json`
}

/** Anchor+Blob download — works from content script / side panel with DOM. */
export const anchorDownload: Downloader = (filename, content, mime) => {
  if (typeof URL === 'undefined' || !URL.createObjectURL || typeof document === 'undefined') return
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/**
 * Universal downloader:
 * Tries chrome.downloads API first (crucial for background service workers without DOM).
 * Places files inside the designated subfolder relative to Downloads without prompting (saveAs: false).
 * Falls back to anchorDownload when chrome.downloads is unavailable or throws.
 */
export const universalDownloader: Downloader = (filename, content, mime, options) => {
  const subfolder = sanitizeSubfolder(options?.subfolder ?? DEFAULT_BACKUP_FOLDER)
  const fullPath = subfolder ? `${subfolder}/${filename}` : filename
  const saveAs = options?.saveAs ?? false

  if (
    typeof chrome !== 'undefined' &&
    chrome.downloads &&
    typeof chrome.downloads.download === 'function'
  ) {
    try {
      const isBlobSupported =
        typeof URL !== 'undefined' &&
        typeof URL.createObjectURL === 'function' &&
        typeof Blob !== 'undefined'

      const downloadUrl = isBlobSupported
        ? URL.createObjectURL(new Blob([content], { type: mime }))
        : `data:${mime};charset=utf-8,${encodeURIComponent(content)}`

      chrome.downloads.download(
        {
          url: downloadUrl,
          filename: fullPath,
          saveAs,
          conflictAction: 'uniquify',
        },
        () => {
          if (isBlobSupported && downloadUrl.startsWith('blob:')) {
            setTimeout(() => {
              try {
                URL.revokeObjectURL(downloadUrl)
              } catch {
                // Ignore cleanup errors
              }
            }, 10000)
          }

          if (chrome.runtime.lastError) {
            anchorDownload(filename, content, mime, options)
          }
        },
      )
      return
    } catch {
      // Fall through to anchorDownload
    }
  }

  anchorDownload(filename, content, mime, options)
}

/** Productivity Tools domain types (FDD-009, EPIC-08). */
import type { EndpointInfo } from '@/adapters'

export type { EndpointInfo }

/** A favorited endpoint (per project). */
export interface FavoriteEntry {
  endpointId: string
  method: string
  path: string
  addedAt: number
}

/** A recently-opened endpoint (per project, ring-capped). */
export interface RecentEntry {
  endpointId: string
  method: string
  path: string
  usedAt: number
}

/** An endpoint decorated with its favorite flag, for list rendering. */
export interface EndpointListItem extends EndpointInfo {
  favorite: boolean
}

export type CodeLang = 'curl' | 'fetch' | 'axios'

/** The pieces a code snippet needs — assembled by the service, formatted by codegen. */
export interface CodeGenRequest {
  method: string
  url: string
  headers: Record<string, string>
  body?: string
}

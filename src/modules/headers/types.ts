/**
 * Global Debug Headers Types (Point 13).
 */

export interface GlobalHeaderItem {
  id: string
  name: string
  value: string
  enabled: boolean
  description?: string
}

export type GlobalHeadersConfig = GlobalHeaderItem[]

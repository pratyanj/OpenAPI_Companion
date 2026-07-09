// Productivity Tools (FDD-009, EPIC-08). Endpoint search, favorites, recents, copy-as-code.
export { ProductivityService } from './productivity-service'
export type { ProductivityServiceOptions } from './productivity-service'
export { CommandPalette } from './CommandPalette'
export type { ProductivityPanelService } from './CommandPalette'
export { generateCode } from './codegen'
export type {
  CodeLang,
  CodeGenRequest,
  EndpointListItem,
  FavoriteEntry,
  RecentEntry,
} from './types'

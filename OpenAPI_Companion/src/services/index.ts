// Shared cross-cutting services. The logger (Sprint 3+) must never log
// tokens/secrets (security §1.9).
export { ThemeManager, resolveTheme } from './theme-manager'
export type {
  ThemePreference,
  ResolvedTheme,
  ThemeSnapshot,
  MediaQueryListLike,
} from './theme-manager'
export { NotificationService } from './notification-service'
export type { ToastKind } from './notification-service'
export { TokenRefreshService, extractToken } from './token-refresh'
export type {
  TokenRefreshOptions,
  RefreshAuthApi,
  RefreshTemplateApi,
  TemplateLike,
} from './token-refresh'

/**
 * Sidebar root. Composition point for the injected UI — wires the project,
 * theme, event bus, and storage into the shell (planning/10 §1). Kept thin so
 * feature panels can later be registered without touching the entry.
 */
import { SidebarShell, type SidebarShellProps } from './SidebarShell'

export type AppProps = SidebarShellProps

export function App(props: AppProps) {
  return <SidebarShell {...props} />
}

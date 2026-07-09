import {
  type TabDef,
  HomeIcon,
  AuthIcon,
  RequestsIcon,
  EnvIcon,
  HistoryIcon,
  DataIcon,
  SettingsIcon,
} from '@/components'

const ICON_CLASS = 'h-3.5 w-3.5'

/** Sidebar sections. Feature panels replace the placeholders as modules land. */
export const TABS: TabDef[] = [
  { id: 'dashboard', label: 'Home', icon: <HomeIcon className={ICON_CLASS} /> },
  { id: 'auth', label: 'Auth', icon: <AuthIcon className={ICON_CLASS} /> },
  { id: 'requests', label: 'Requests', icon: <RequestsIcon className={ICON_CLASS} /> },
  { id: 'environments', label: 'Env', icon: <EnvIcon className={ICON_CLASS} /> },
  { id: 'history', label: 'History', icon: <HistoryIcon className={ICON_CLASS} /> },
  { id: 'fake-data', label: 'Data', icon: <DataIcon className={ICON_CLASS} /> },
  { id: 'settings', label: 'Settings', icon: <SettingsIcon className={ICON_CLASS} /> },
]

export const DEFAULT_TAB = 'dashboard'

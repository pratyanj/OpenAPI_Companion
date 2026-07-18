import type { ComponentProps } from 'react'
import {
  House,
  KeyRound,
  Package,
  Globe,
  History,
  Dices,
  Settings,
  Sun,
  Moon,
  Monitor,
  X,
  Trash2,
  Pencil,
  Eye,
  EyeOff,
  Compass,
  Search,
  Construction,
  Copy,
  Check,
  CircleCheck,
  TriangleAlert,
  CircleX,
  ArrowUpRight,
  ArrowDownLeft,
  Clock,
  Sparkles,
  RefreshCw,
  Star,
  Code,
  ChevronRight,
  ChevronLeft,
  type LucideIcon,
} from 'lucide-react'

/**
 * Central icon set (lucide-react — inline SVGs bundled at build time, so no
 * external requests, CSP-safe inside the Shadow DOM). Call sites use these
 * semantic aliases, not raw lucide names, so the underlying library can be
 * swapped in one place. Icons are decorative (`aria-hidden`) — every button
 * that uses one supplies its own text or `aria-label`.
 */
type IconProps = ComponentProps<LucideIcon>

function make(Cmp: LucideIcon, defaultClass = 'h-4 w-4') {
  function AppIcon({ className = defaultClass, ...props }: IconProps) {
    return <Cmp aria-hidden className={className} {...props} />
  }
  AppIcon.displayName = `Icon(${Cmp.displayName ?? 'lucide'})`
  return AppIcon
}

// Tabs
export const HomeIcon = make(House)
export const AuthIcon = make(KeyRound)
export const RequestsIcon = make(Package)
export const EnvIcon = make(Globe)
export const HistoryIcon = make(History)
export const DataIcon = make(Dices)
export const SettingsIcon = make(Settings)

// Theme cycle
export const ThemeLightIcon = make(Sun)
export const ThemeDarkIcon = make(Moon)
export const ThemeSystemIcon = make(Monitor)

// Actions & chrome
export const CloseIcon = make(X)
export const DeleteIcon = make(Trash2)
export const EditIcon = make(Pencil)
export const RevealIcon = make(Eye)
export const HideIcon = make(EyeOff)
export const BrandIcon = make(Compass)
export const SearchIcon = make(Search)
export const PlaceholderIcon = make(Construction)
export const CopyIcon = make(Copy)
export const CopiedIcon = make(Check)
export const RequestIcon = make(ArrowUpRight)
export const ResponseIcon = make(ArrowDownLeft)
export const ClockIcon = make(Clock)
export const GenerateIcon = make(Sparkles)
export const RegenerateIcon = make(RefreshCw)
export const FavoriteIcon = make(Star)
export const CodeIcon = make(Code)
export const CollapseIcon = make(ChevronRight)  // collapse sidebar to icon strip  (>)
export const ExpandIcon = make(ChevronLeft)    // expand sidebar from icon strip  (<)

// Toast kinds
export const ToastSuccessIcon = make(CircleCheck)
export const ToastWarningIcon = make(TriangleAlert)
export const ToastErrorIcon = make(CircleX)

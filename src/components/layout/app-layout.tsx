import {
  Bell, CalendarCheck, Compass, Wallet, Languages, MousePointerClick, FileText, Hotel, LayoutDashboard, LogOut, Map, Plane, Receipt, Settings, ShieldCheck, Stamp,
  type LucideIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { NavLink, Outlet, useNavigate } from 'react-router'
import { useAuth } from '@/features/auth/auth-context'
import { Logo } from '@/components/shared/logo'
import { ROUTES } from '@/config/routes'
import { cn } from '@/lib/utils'

const items: { key: string; to: string; icon: LucideIcon; end?: boolean }[] = [
  { key: 'dashboard', to: ROUTES.app.dashboard, icon: LayoutDashboard, end: true },
  { key: 'visa', to: ROUTES.app.visa, icon: Stamp },
  { key: 'flights', to: ROUTES.app.flights, icon: Plane },
  { key: 'hotels', to: ROUTES.app.hotels, icon: Hotel },
  { key: 'insurance', to: ROUTES.app.insurance, icon: ShieldCheck },
  { key: 'map', to: ROUTES.app.map, icon: Map },
  { key: 'appointments', to: ROUTES.app.appointments, icon: CalendarCheck },
  { key: 'documents', to: ROUTES.app.documents, icon: FileText },
  { key: 'bookings', to: ROUTES.app.bookings, icon: Receipt },
  { key: 'budget', to: ROUTES.app.budget, icon: Wallet },
  { key: 'extras', to: ROUTES.app.extras, icon: Compass },
  { key: 'translate', to: ROUTES.app.translate, icon: Languages },
  { key: 'assistant', to: ROUTES.app.assistant, icon: MousePointerClick },
  { key: 'notifications', to: ROUTES.app.notifications, icon: Bell },
  { key: 'settings', to: ROUTES.app.settings, icon: Settings },
]

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm whitespace-nowrap',
    isActive ? 'bg-navy-900 text-white' : 'text-ink-soft hover:bg-muted hover:text-ink',
  )

export function AppLayout() {
  const { user, logout } = useAuth()
  const { t } = useTranslation()
  const navigate = useNavigate()
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="border-b border-line bg-surface lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
        <div className="flex h-16 items-center px-4"><Logo /></div>
        <nav aria-label={t('navigation.label')} className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible">
          {items.map(({ key, to, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={linkClass}>
              <Icon className="size-4" aria-hidden />{t(`navigation.${key}`)}
            </NavLink>
          ))}
          <button
            onClick={() => {
              navigate(ROUTES.home)
              void logout()
            }}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm whitespace-nowrap text-ink-soft hover:bg-muted hover:text-ink lg:mt-4"
          >
            <LogOut className="size-4" aria-hidden />{t('navigation.logout')}{user ? ` (${user.name.split(' ')[0]})` : ''}
          </button>
        </nav>
      </aside>
      <div className="min-w-0">
        <main id="main"><Outlet /></main>
      </div>
    </div>
  )
}

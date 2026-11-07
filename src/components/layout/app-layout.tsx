import {
  Bell, CalendarCheck, Compass, Home, Languages, LogOut, Map, Menu, MousePointerClick, Plane, Receipt, Settings, ShieldCheck, Stamp, Train, Wallet, X, FileText, Hotel,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { useAuth } from '@/features/auth/auth-context'
import { Logo } from '@/components/shared/logo'
import { SeoManager } from '@/components/shared/seo-manager'
import { ROUTES } from '@/config/routes'
import { cn } from '@/lib/utils'

interface Item { key: string; to: string; icon: LucideIcon; end?: boolean }

/** The four things people come here to do, plus home. Shown as the phone's bottom bar and at the top of the desktop sidebar. */
const main: Item[] = [
  { key: 'dashboard', to: ROUTES.app.dashboard, icon: Home, end: true },
  { key: 'trains', to: ROUTES.app.trains, icon: Train },
  { key: 'map', to: ROUTES.app.map, icon: Map },
  { key: 'plan', to: ROUTES.app.extras, icon: Compass },
  { key: 'translate', to: ROUTES.app.translate, icon: Languages },
]

const groups: { title: string; items: Item[] }[] = [
  {
    title: 'Visa and bookings',
    items: [
      { key: 'visa', to: ROUTES.app.visa, icon: Stamp },
      { key: 'flights', to: ROUTES.app.flights, icon: Plane },
      { key: 'hotels', to: ROUTES.app.hotels, icon: Hotel },
      { key: 'insurance', to: ROUTES.app.insurance, icon: ShieldCheck },
      { key: 'appointments', to: ROUTES.app.appointments, icon: CalendarCheck },
      { key: 'documents', to: ROUTES.app.documents, icon: FileText },
      { key: 'bookings', to: ROUTES.app.bookings, icon: Receipt },
      { key: 'budget', to: ROUTES.app.budget, icon: Wallet },
    ],
  },
  {
    title: 'Account',
    items: [
      { key: 'assistant', to: ROUTES.app.assistant, icon: MousePointerClick },
      { key: 'notifications', to: ROUTES.app.notifications, icon: Bell },
      { key: 'settings', to: ROUTES.app.settings, icon: Settings },
    ],
  },
]

const sideLink = ({ isActive }: { isActive: boolean }) =>
  cn('flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm', isActive ? 'bg-navy-900 text-white' : 'text-ink-soft hover:bg-muted hover:text-ink')

export function AppLayout() {
  const { user, logout } = useAuth()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const signOut = () => {
    navigate(ROUTES.home)
    void logout()
  }

  const renderGroups = (link: (s: { isActive: boolean }) => string) =>
    groups.map((g) => (
      <div key={g.title} className="mt-4">
        <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">{g.title}</p>
        {g.items.map(({ key, to, icon: Icon }) => (
          <NavLink key={to} to={to} className={link}><Icon className="size-4" aria-hidden />{t(`navigation.${key}`)}</NavLink>
        ))}
      </div>
    ))

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[250px_1fr]">
      {/* Desktop sidebar */}
      <aside className="hidden border-r border-line bg-surface lg:sticky lg:top-0 lg:block lg:h-screen lg:overflow-y-auto">
        <div className="flex h-16 items-center px-4"><Logo /></div>
        <nav aria-label={t('navigation.label')} className="px-3 pb-6">
          {main.map(({ key, to, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={sideLink}><Icon className="size-4" aria-hidden />{t(`navigation.${key}`)}</NavLink>
          ))}
          {renderGroups(sideLink)}
          <button onClick={signOut} className="mt-4 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-ink-soft hover:bg-muted hover:text-ink">
            <LogOut className="size-4" aria-hidden />{t('navigation.logout')}{user ? ` (${user.name.split(' ')[0]})` : ''}
          </button>
        </nav>
      </aside>

      {/* Phone top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-surface px-4 lg:hidden">
        <Logo />
        <button onClick={() => setOpen(true)} aria-label={t('navigation.menu')} aria-expanded={open} className="grid size-11 place-items-center rounded-lg hover:bg-muted">
          <Menu className="size-6" aria-hidden />
        </button>
      </header>

      {/* Phone full menu */}
      {open && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-surface lg:hidden" role="dialog" aria-modal="true" aria-label={t('navigation.menu')}>
          <div className="flex h-14 items-center justify-between border-b border-line px-4">
            <Logo />
            <button onClick={() => setOpen(false)} aria-label={t('navigation.close')} className="grid size-11 place-items-center rounded-lg hover:bg-muted"><X className="size-6" aria-hidden /></button>
          </div>
          <nav aria-label={t('navigation.label')} className="px-3 pb-10 pt-2">
            {renderGroups(sideLink)}
            <button onClick={signOut} className="mt-4 flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm text-ink-soft hover:bg-muted">
              <LogOut className="size-4" aria-hidden />{t('navigation.logout')}{user ? ` (${user.name.split(' ')[0]})` : ''}
            </button>
          </nav>
        </div>
      )}

      <div className="min-w-0 pb-20 lg:pb-0">
        <SeoManager />
        <main id="main"><Outlet /></main>
      </div>

      {/* Phone bottom bar: the main tasks, one tap away */}
      <nav aria-label={t('navigation.label')} className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
        {main.map(({ key, to, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => cn('flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium', isActive ? 'text-accent-700' : 'text-ink-soft')}
          >
            <Icon className="size-5" aria-hidden />
            <span className="max-w-full truncate">{t(`navigation.${key}`)}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

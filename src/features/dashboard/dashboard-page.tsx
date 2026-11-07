import { CalendarCheck, Compass, FileText, Hotel, Languages, Map, Plane, ShieldCheck, Stamp, Train, Trash2, type LucideIcon } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ROUTES } from '@/config/routes'
import { typeLabel } from '@/features/appointments/appointments-api'
import { dateOf, dayLabel, timeOf, toISODate } from '@/features/appointments/dates'
import { useAuth } from '@/features/auth/auth-context'
import { statusInfo } from '@/features/bookings/bookings-api'
import { useExpenses } from '@/features/budget/budget-api'
import { budgetStatus, formatMoney, summarise } from '@/features/budget/summary'
import { buildNotifications } from '@/features/notifications/build'
import { useTravelData } from '@/features/notifications/use-travel-data'
import { findDestination, isWorkVisaCategory } from '@/features/visa/destinations'
import { formCompletion, mergeFormData } from '@/features/visa/form-schema'
import type { Trip, TripStatus } from '@/types/api'
import { TripForm } from './trip-form'
import { daysUntil } from './trip-schema'
import { useTrips } from './use-trips'

const mainTasks: { label: string; description: string; to: string; icon: LucideIcon }[] = [
  { label: 'Book trains', description: 'Compare times and prices', to: ROUTES.app.trains, icon: Train },
  { label: 'Maps and directions', description: 'Search any city, find places', to: ROUTES.app.map, icon: Map },
  { label: 'Translate a document', description: 'Photo or PDF to your language', to: ROUTES.app.translate, icon: Languages },
  { label: 'Make a tourist plan', description: 'Day-by-day itinerary as PDF', to: ROUTES.app.extras, icon: Compass },
]

const quickActions: { label: string; description: string; to: string; icon: LucideIcon }[] = [
  { label: 'Apply for a visa', description: 'Tourism, visiting or work', to: ROUTES.app.visa, icon: Stamp },
  { label: 'Find flights', description: 'Provider fare search', to: ROUTES.app.flights, icon: Plane },
  { label: 'Find a hotel', description: 'Search provider data or compare partners', to: ROUTES.app.hotels, icon: Hotel },
  { label: 'Insurance', description: 'Check cover with a partner', to: ROUTES.app.insurance, icon: ShieldCheck },
  { label: 'Appointments', description: 'Track booked visits', to: ROUTES.app.appointments, icon: CalendarCheck },
  { label: 'Documents', description: 'Your uploaded files', to: ROUTES.app.documents, icon: FileText },
]

const statusLabel: Record<TripStatus, string> = { planning: 'Planning', ready: 'Ready', completed: 'Completed' }

function Panel({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <Card className={`p-5 ${className ?? ''}`}>
      <h2 className="mb-4 font-semibold">{title}</h2>
      {children}
    </Card>
  )
}

function CurrentTrip({ trip }: { trip: Trip }) {
  const d = daysUntil(trip.departOn)
  const when = d > 0 ? `Departs in ${d} day${d === 1 ? '' : 's'}` : d === 0 ? 'Departs today' : 'Trip dates have started or passed'
  return (
    <>
      <p className="text-2xl font-semibold">{trip.destination}</p>
      <p className="mt-1 text-sm text-ink-soft">{trip.departOn} → {trip.returnOn} · {trip.purpose}</p>
      <p className="mt-3 text-sm font-medium text-accent-700">{when}</p>
    </>
  )
}

function applicationHref(app: { destinationId: string; categoryId: string; nationality: string; residence: string }) {
  const query = new URLSearchParams({ nationality: app.nationality, residence: app.residence })
  return `/app/visa/${app.destinationId}/${app.categoryId}?${query}`
}

export default function DashboardPage() {
  const { user } = useAuth()
  const { trips, loading, error, create, setStatus, remove } = useTrips()
  const { data, error: dataError } = useTravelData()
  const today = toISODate(new Date())

  const { expenses } = useExpenses()
  const current = trips.find((t) => t.status !== 'completed')
  const applications = data?.applications ?? []
  const bookings = (data?.bookings ?? []).filter((b) => b.status !== 'sample')
  const appointments = (data?.appointments ?? []).filter((a) => dateOf(a.startsAt) >= today).slice(0, 3)
  const notifications = useMemo(
    () => data ? buildNotifications({ ...data, bookings, today }) : [],
    [data, bookings, today],
  )
  const tasks = notifications.filter((n) => n.level !== 'info').slice(0, 4)
  const documents = (data?.documents ?? []).slice(-4).reverse()

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Welcome, {user?.name.split(' ')[0]}</h1>
        <p className="mt-1 text-sm text-ink-soft">What would you like to do?</p>
      </header>

      <nav aria-label="Main tasks" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {mainTasks.map(({ label, description, to, icon: Icon }) => (
          <Link key={label} to={to} className="group flex min-h-36 flex-col justify-between rounded-2xl bg-gradient-to-br from-navy-900 to-accent-900 p-4 text-white shadow-sm transition active:scale-[0.98] hover:shadow-lg">
            <Icon className="size-8 text-accent-200" aria-hidden />
            <span>
              <span className="block text-base font-semibold leading-tight">{label}</span>
              <span className="mt-1 block text-xs text-white/75">{description}</span>
            </span>
          </Link>
        ))}
      </nav>

      {user && !user.emailVerified && (
        <p role="note" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Your email isn’t verified yet. Check your inbox for the verification link.
        </p>
      )}
      {dataError && <p role="alert" className="text-sm text-red-700">{dataError}</p>}

      <h2 className="-mb-3 text-sm font-semibold text-ink-soft">Visa and bookings</h2>
      <nav aria-label="Visa and bookings" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {quickActions.map(({ label, description, to, icon: Icon }) => (
          <Link key={label} to={to} className="group flex items-center gap-4 rounded-2xl border border-line bg-surface p-4 transition hover:-translate-y-0.5 hover:border-accent-300 hover:shadow-md">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-50 text-accent-700 transition group-hover:bg-accent-100">
              <Icon className="size-5" aria-hidden />
            </span>
            <span>
              <span className="block text-sm font-semibold">{label}</span>
              <span className="mt-0.5 block text-xs text-ink-soft">{description}</span>
            </span>
          </Link>
        ))}
      </nav>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Next trip">
          {loading ? <p role="status" className="text-sm text-ink-soft">Loading your trips…</p>
            : error ? <p role="alert" className="text-sm text-red-700">{error}</p>
            : current ? <CurrentTrip trip={current} />
            : <div><p className="text-sm text-ink-soft">No upcoming trip yet.</p><p className="mt-2 text-xs text-ink-soft">Add your real trip dates below to keep your plans together.</p></div>}
        </Panel>

        <Panel title="Visa applications" className="lg:col-span-2">
          {data === null ? <p role="status" className="text-sm text-ink-soft">Loading your applications…</p>
            : applications.length === 0 ? (
              <div className="rounded-xl bg-muted/70 p-5">
                <p className="text-sm text-ink-soft">Your visa applications will appear here as you prepare them.</p>
                <Button asChild size="sm" variant="outline" className="mt-3"><Link to={ROUTES.app.visa}>Choose tourism, visit or work</Link></Button>
              </div>
            ) : (
              <ul className="space-y-3">
                {applications.slice(0, 3).map((app) => {
                  const destination = findDestination(app.destinationId)
                  const category = destination?.categories.find((c) => c.id === app.categoryId)
                  const completion = formCompletion(mergeFormData(app.data), isWorkVisaCategory(app.categoryId))
                  return (
                    <li key={app.id} className="rounded-xl border border-line p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{destination?.name ?? app.destinationId}</p>
                          <p className="text-xs text-ink-soft">{category?.label ?? app.categoryId} · {completion.percent}% complete</p>
                        </div>
                        <Badge tone={app.status === 'draft' ? 'neutral' : 'accent'}>{app.status === 'draft' ? 'Draft' : app.status === 'ready' ? 'Prepared' : 'Submitted (self-reported)'}</Badge>
                      </div>
                      <div className="mt-3 h-1.5 rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={completion.total} aria-valuenow={completion.done} aria-label={`${destination?.name ?? app.destinationId} application progress`}>
                        <div className="h-full rounded-full bg-accent-600" style={{ width: `${completion.percent}%` }} />
                      </div>
                      <Button asChild size="sm" variant="ghost" className="mt-2 -ml-2">
                        <Link to={applicationHref(app)}>Continue application</Link>
                      </Button>
                    </li>
                  )
                })}
              </ul>
            )}
        </Panel>
      </div>

      <Panel title="Your trips">
        {trips.length > 0 && (
          <ul className="mb-6 divide-y divide-line">
            {trips.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">{t.destination}</p>
                  <p className="text-xs text-ink-soft">{t.departOn} → {t.returnOn} · {t.purpose}{t.budget !== null && ` · budget $${t.budget}`}</p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="sr-only" htmlFor={`status-${t.id}`}>Status for {t.destination}</label>
                  <select id={`status-${t.id}`} value={t.status} onChange={(e) => void setStatus(t.id, e.target.value as TripStatus)} className="h-9 rounded-lg border border-line bg-surface px-2 text-sm">
                    {Object.entries(statusLabel).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                  </select>
                  <Button variant="ghost" size="sm" aria-label={`Delete trip to ${t.destination}`} onClick={() => void remove(t.id)}><Trash2 className="size-4" aria-hidden /></Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <TripForm onCreate={create} />
      </Panel>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Panel title="Upcoming appointments">
          {data === null ? <p className="text-sm text-ink-soft">Loading appointments…</p>
            : appointments.length > 0 ? appointments.map((a) => (
              <div key={a.id} className="mb-3 text-sm last:mb-0">
                <p className="font-medium">{typeLabel[a.type]} · {a.center}</p>
                <p className="text-ink-soft">{dayLabel(dateOf(a.startsAt))} at {timeOf(a.startsAt)}</p>
                <Badge tone={a.status === 'confirmed' ? 'accent' : 'neutral'} className="mt-1">{a.status === 'confirmed' ? 'Confirmed' : a.status === 'pending' ? 'Pending — not confirmed' : 'Requested — not confirmed'}</Badge>
              </div>
            )) : <p className="text-sm text-ink-soft">No upcoming appointments recorded.</p>}
        </Panel>

        <Panel title="Flights, stays & policies">
          {data === null ? <p className="text-sm text-ink-soft">Loading your travel records…</p>
            : bookings.length > 0 ? (
              <ul className="space-y-3 text-sm">
                {bookings.slice(0, 5).map((booking) => (
                  <li key={booking.id}>
                    <p className="font-medium">{booking.title}</p>
                    <Badge tone={statusInfo[booking.status].tone} className="mt-1">{statusInfo[booking.status].label}</Badge>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-ink-soft">Your recorded bookings and policies will appear here.</p>}
        </Panel>

        <Panel title="Outstanding tasks">
          {data === null ? <p className="text-sm text-ink-soft">Loading your tasks…</p>
            : tasks.length > 0 ? (
              <ul className="space-y-2 text-sm">{tasks.map((task) => <li key={task.id}><Link to={task.href} className="text-accent-700 underline">{task.title}</Link></li>)}</ul>
            ) : <p className="text-sm text-ink-soft">Nothing needs your attention right now.</p>}
        </Panel>

        <Panel title="Recent documents">
          {data === null ? <p className="text-sm text-ink-soft">Loading your documents…</p>
            : documents.length > 0 ? (
              <ul className="space-y-2 text-sm">{documents.map((doc) => <li key={doc.id} className="flex items-center gap-2"><FileText className="size-4 text-ink-soft" aria-hidden />{doc.filename}</li>)}</ul>
            ) : <p className="text-sm text-ink-soft">Uploaded files will appear here.</p>}
        </Panel>

        <Panel title="Trip budget">
          {expenses === null ? <p className="text-sm text-ink-soft">Loading your budget…</p> : (() => {
            const scoped = current ? expenses.filter((e) => e.tripId === current.id) : expenses
            const sums = summarise(scoped)
            const st = current ? budgetStatus(current.budget, sums) : null
            if (sums.length === 0) {
              return <p className="text-sm text-ink-soft">{current?.budget != null ? `Budget for ${current.destination}: ${formatMoney(current.budget, 'USD')}. ` : ''}No expenses recorded yet.</p>
            }
            return (
              <div className="space-y-1 text-sm">
                {sums.map((s) => <p key={s.currency}><strong>{formatMoney(s.total, s.currency)}</strong> <span className="text-ink-soft">recorded ({formatMoney(s.paid, s.currency)} paid)</span></p>)}
                {st?.budget != null && <p className={st.over ? 'font-medium text-red-700' : 'text-ink-soft'}>{st.over ? 'Over' : 'Within'} your {formatMoney(st.budget, 'USD')} budget{st.over ? '' : `: ${formatMoney(st.remaining ?? 0, 'USD')} left`}</p>}
              </div>
            )
          })()}
          <Button asChild size="sm" variant="ghost" className="mt-3"><Link to={ROUTES.app.budget}>Open budget</Link></Button>
        </Panel>

        <Panel title="Notifications">
          {data === null ? <p className="text-sm text-ink-soft">Loading your notifications…</p>
            : notifications.length > 0 ? (
              <>
                <ul className="space-y-2 text-sm">{notifications.slice(0, 4).map((notification) => <li key={notification.id}>{notification.title}</li>)}</ul>
                <Button asChild size="sm" variant="ghost" className="mt-3"><Link to={ROUTES.app.notifications}>See all</Link></Button>
              </>
            ) : <p className="text-sm text-ink-soft">Your travel reminders will appear here.</p>}
        </Panel>
      </div>
    </div>
  )
}

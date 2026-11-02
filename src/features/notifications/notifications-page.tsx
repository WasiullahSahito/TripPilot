import { AlertTriangle, BellRing, Info } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { toISODate } from '@/features/appointments/dates'
import { buildNotifications, type NotificationLevel } from './build'
import { useTravelData } from './use-travel-data'

const KEY = 'tp.dismissed-notifications'
// Only notification ids are remembered in the browser (no personal data), and it still works if storage is blocked.
const readDismissed = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}
const writeDismissed = (ids: string[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids))
  } catch {
    /* storage unavailable: dismissals last for this visit only */
  }
}

const icon: Record<NotificationLevel, typeof Info> = { action: BellRing, warning: AlertTriangle, info: Info }
const tone: Record<NotificationLevel, 'accent' | 'warning' | 'neutral'> = { action: 'accent', warning: 'warning', info: 'neutral' }
const label: Record<NotificationLevel, string> = { action: 'Do next', warning: 'Check this', info: 'For your information' }

export default function NotificationsPage() {
  const { data, error } = useTravelData()
  const [dismissed, setDismissed] = useState<string[]>(readDismissed)
  const all = useMemo(() => (data ? buildNotifications({ ...data, today: toISODate(new Date()) }) : []), [data])
  const shown = all.filter((n) => !dismissed.includes(n.id))

  const dismiss = (id: string) => {
    const next = [...dismissed, id]
    setDismissed(next)
    writeDismissed(next)
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <header>
        <h1 className="text-2xl font-semibold">Notifications</h1>
        <p className="mt-1 text-sm text-ink-soft">Reminders based on your applications, bookings and appointments. They are calculated in your browser; nothing is emailed or sent to anyone.</p>
      </header>

      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {!data && !error && <p role="status" className="text-sm text-ink-soft">Loading…</p>}
      {data && shown.length === 0 && (
        <Card className="p-10 text-center text-sm text-ink-soft">
          {all.length > 0 ? 'You have dismissed everything. ' : ''}You’re all caught up.
          {dismissed.length > 0 && (
            <Button variant="ghost" size="sm" className="ml-2" onClick={() => { setDismissed([]); writeDismissed([]) }}>Restore dismissed</Button>
          )}
        </Card>
      )}

      <ul className="space-y-3">
        {shown.map((n) => {
          const Icon = icon[n.level]
          return (
            <li key={n.id}>
              <Card className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="flex gap-3">
                  <Icon className="mt-0.5 size-5 shrink-0 text-accent-600" aria-hidden />
                  <div>
                    <Badge tone={tone[n.level]}>{label[n.level]}</Badge>
                    <p className="mt-1.5 text-sm font-medium">{n.title}</p>
                    <p className="mt-0.5 text-xs text-ink-soft">{n.detail}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button asChild size="sm" variant="outline"><Link to={n.href}>Open</Link></Button>
                  <Button size="sm" variant="ghost" onClick={() => dismiss(n.id)} aria-label={`Dismiss: ${n.title}`}>Dismiss</Button>
                </div>
              </Card>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

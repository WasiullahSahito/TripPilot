import { ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { findDestination } from '@/features/visa/destinations'
import { AppointmentDetail } from './appointment-detail'
import { AppointmentForm } from './appointment-form'
import { appointmentsApi, statusMeta, typeLabel, type AppointmentDto } from './appointments-api'
import { AgendaView, MonthView, WeekView } from './calendar-views'
import { addDays, addMonths, monthLabel, toISODate, weekDays, dayLabel } from './dates'
import { buildIcs } from './ics'

type View = 'month' | 'week' | 'agenda'

export default function AppointmentsPage() {
  const today = toISODate(new Date())
  const [items, setItems] = useState<AppointmentDto[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>('month')
  const [anchor, setAnchor] = useState(today)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setItems(await appointmentsApi.list())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load appointments')
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const selected = items?.find((a) => a.id === selectedId) ?? null
  const shift = (dir: 1 | -1) => setAnchor((a) => (view === 'month' ? addMonths(a, dir) : addDays(a, 7 * dir)))
  const title = useMemo(() => {
    if (view === 'month') return monthLabel(anchor)
    if (view === 'week') { const w = weekDays(anchor); return `${dayLabel(w[0]!)} – ${dayLabel(w[6]!)}` }
    return 'Upcoming'
  }, [view, anchor])

  const exportIcs = () => {
    const ics = buildIcs((items ?? []).map((a) => ({
      id: a.id,
      title: `${typeLabel[a.type]} - ${a.center}`,
      startsAt: a.startsAt,
      location: a.center,
      status: a.status,
      reminderDays: a.reminderDays,
      description: [findDestination(a.destinationId)?.name, a.officialRef && `Reference: ${a.officialRef}`, a.notes].filter(Boolean).join('\n'),
    })))
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }))
    const el = document.createElement('a')
    el.href = url
    el.download = 'trippilot-appointments.ics'
    el.click()
    URL.revokeObjectURL(url)
  }

  const viewProps = { anchor, items: items ?? [], selectedId, onSelect: setSelectedId, today }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Appointments</h1>
          <p className="mt-1 text-sm text-ink-soft">Track visa-centre and biometric appointments you book on the official site.</p>
        </div>
        <Button variant="outline" onClick={exportIcs} disabled={!items?.length}><Download className="size-4" aria-hidden />Export calendar (.ics)</Button>
      </header>

      <ul className="flex flex-wrap gap-3 text-xs" aria-label="Status legend">
        {(Object.keys(statusMeta) as (keyof typeof statusMeta)[]).map((s) => (
          <li key={s} className="flex items-center gap-2"><span className={`rounded-full px-2.5 py-0.5 ${statusMeta[s].chip}`}>{statusMeta[s].label}</span><span className="text-ink-soft">{statusMeta[s].help}</span></li>
        ))}
      </ul>

      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {items === null && !error && <p role="status" className="text-sm text-ink-soft">Loading…</p>}

      {items && (
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <section aria-label="Calendar" className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1">
                <Button size="sm" variant="outline" aria-label="Previous" onClick={() => shift(-1)} disabled={view === 'agenda'}><ChevronLeft className="size-4" /></Button>
                <Button size="sm" variant="outline" onClick={() => setAnchor(today)}>Today</Button>
                <Button size="sm" variant="outline" aria-label="Next" onClick={() => shift(1)} disabled={view === 'agenda'}><ChevronRight className="size-4" /></Button>
                <h2 className="ml-3 font-semibold" aria-live="polite">{title}</h2>
              </div>
              <div className="flex gap-1" role="group" aria-label="Calendar view">
                {(['month', 'week', 'agenda'] as View[]).map((v) => (
                  <Button key={v} size="sm" variant={view === v ? 'primary' : 'outline'} aria-pressed={view === v} onClick={() => setView(v)} className="capitalize">{v}</Button>
                ))}
              </div>
            </div>
            {view === 'month' && <MonthView {...viewProps} />}
            {view === 'week' && <WeekView {...viewProps} />}
            {view === 'agenda' && <AgendaView {...viewProps} />}
            {items.length === 0 && <p className="text-sm text-ink-soft">No appointments recorded yet. Add one below.</p>}
          </section>

          <aside aria-label="Appointment details" className="min-w-0">
            {selected
              ? <AppointmentDetail key={selected.id + selected.status + (selected.officialRef ?? '')} a={selected} onChanged={() => { void load() }} />
              : <Card className="p-5 text-sm text-ink-soft">Select an appointment to see its checklist, status and documents.</Card>}
          </aside>
        </div>
      )}

      <Card className="p-6">
        <h2 className="font-semibold">Add an appointment</h2>
        <p className="mb-4 mt-1 text-sm text-ink-soft">
          “Confirmed” is only for appointments the official provider has confirmed — you’ll need their reference. Reminders are saved
          preferences included in the calendar export; TripPilot does not send notifications yet.
        </p>
        <AppointmentForm onCreate={async (a) => { await appointmentsApi.create(a); await load() }} />
      </Card>
    </div>
  )
}

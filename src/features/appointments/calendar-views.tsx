import { cn } from '@/lib/utils'
import { statusMeta, typeLabel, type AppointmentDto } from './appointments-api'
import { dateOf, dayLabel, monthGrid, timeOf, weekDays } from './dates'

interface ViewProps {
  anchor: string
  items: AppointmentDto[]
  selectedId: string | null
  onSelect(id: string): void
  today: string
}

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function Chip({ a, selected, onSelect }: { a: AppointmentDto; selected: boolean; onSelect(id: string): void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(a.id)}
      aria-pressed={selected}
      title={`${typeLabel[a.type]} - ${a.center} (${statusMeta[a.status].label})`}
      className={cn('block w-full truncate rounded-md px-1.5 py-0.5 text-left text-xs', statusMeta[a.status].chip, selected && 'outline-2 outline-navy-900')}
    >
      {timeOf(a.startsAt)} {typeLabel[a.type]} · {statusMeta[a.status].label}
    </button>
  )
}

const forDay = (items: AppointmentDto[], d: string) => items.filter((a) => dateOf(a.startsAt) === d).sort((a, b) => a.startsAt.localeCompare(b.startsAt))

export function MonthView({ anchor, items, selectedId, onSelect, today }: ViewProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] table-fixed border-collapse" aria-label="Month calendar">
        <thead>
          <tr>
            {DOW.map((d) => (
              <th key={d} scope="col" className="border border-line bg-muted p-2 text-center text-xs font-medium text-ink-soft">{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {monthGrid(anchor).map((week) => (
            <tr key={week[0]!.date}>
              {week.map((day) => (
                <td key={day.date} className={cn('h-24 border border-line p-1.5 align-top', day.inMonth ? 'bg-surface' : 'bg-canvas text-ink-soft')}>
                  <div className="space-y-1">
                    <p className={cn('text-xs', day.date === today && 'inline-grid size-5 place-items-center rounded-full bg-navy-900 text-white')}>{+day.date.slice(8)}</p>
                    {forDay(items, day.date).map((a) => <Chip key={a.id} a={a} selected={a.id === selectedId} onSelect={onSelect} />)}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function WeekView({ anchor, items, selectedId, onSelect, today }: ViewProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-7" aria-label="Week calendar" role="list">
      {weekDays(anchor).map((d) => (
        <div key={d} role="listitem" className={cn('min-h-28 rounded-xl border border-line bg-surface p-2', d === today && 'border-navy-900')}>
          <p className="mb-2 text-xs font-medium text-ink-soft">{dayLabel(d)}</p>
          <div className="space-y-1">{forDay(items, d).map((a) => <Chip key={a.id} a={a} selected={a.id === selectedId} onSelect={onSelect} />)}</div>
        </div>
      ))}
    </div>
  )
}

export function AgendaView({ items, selectedId, onSelect, today }: ViewProps) {
  const upcoming = [...items].filter((a) => dateOf(a.startsAt) >= today).sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  if (upcoming.length === 0) return <p className="rounded-xl border border-line bg-surface p-8 text-center text-sm text-ink-soft">No upcoming appointments.</p>
  return (
    <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
      {upcoming.map((a) => (
        <li key={a.id}>
          <button
            type="button"
            onClick={() => onSelect(a.id)}
            className={cn('flex w-full flex-wrap items-center justify-between gap-2 p-4 text-left hover:bg-muted', a.id === selectedId && 'bg-muted')}
          >
            <span>
              <span className="block text-sm font-medium">{dayLabel(dateOf(a.startsAt))} · {timeOf(a.startsAt)}</span>
              <span className="text-xs text-ink-soft">{typeLabel[a.type]} — {a.center}</span>
            </span>
            <span className={cn('rounded-full px-2.5 py-0.5 text-xs', statusMeta[a.status].chip)}>{statusMeta[a.status].label}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

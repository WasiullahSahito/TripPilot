import { Hotel, Paperclip, Plane, ShieldCheck, Trash2, type LucideIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { bookingsApi, statusInfo, type BookingDto } from './bookings-api'

const icons: Record<BookingDto['kind'], LucideIcon> = { flight: Plane, hotel: Hotel, insurance: ShieldCheck }

export function BookingRow({ b, onChanged }: { b: BookingDto; onChanged(): void }) {
  const info = statusInfo[b.status]
  const ref = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const Icon = icons[b.kind]

  return (
    <li>
      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex gap-3">
            <Icon className="mt-0.5 size-5 text-accent-600" aria-hidden />
            <div>
              <p className="font-medium">{b.title}</p>
              <p className="text-xs text-ink-soft">{b.startDate}{b.endDate ? ` → ${b.endDate}` : ''}</p>
              <p className="mt-2 flex flex-wrap items-center gap-2">
                <Badge tone={info.tone}>{info.label}</Badge>
                {b.confirmationRef && <span className="text-xs">Ref: <strong>{b.confirmationRef}</strong></span>}
              </p>
              <p className="mt-1 text-xs text-ink-soft">{info.help}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={ref}
              type="file"
              accept="application/pdf,image/png,image/jpeg"
              className="sr-only"
              aria-label={`Attach document to ${b.title}`}
              onChange={async (e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (!f) return
                setError(null)
                try {
                  await bookingsApi.attach(b.id, f)
                  onChanged()
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Upload failed')
                }
              }}
            />
            <Button variant="outline" size="sm" onClick={() => ref.current?.click()}>
              <Paperclip className="size-4" aria-hidden />Attach
            </Button>
            <Button variant="ghost" size="sm" aria-label={`Delete ${b.title}`} onClick={() => void bookingsApi.remove(b.id).then(onChanged)}>
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
        {b.documents.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-3 text-xs">
            {b.documents.map((d) => (
              <li key={d.id}><a className="text-accent-700 underline" href={bookingsApi.documentUrl(d.id)}>{d.filename}</a></li>
            ))}
          </ul>
        )}
        {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
      </Card>
    </li>
  )
}

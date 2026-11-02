export interface IcsEvent {
  id: string
  title: string
  startsAt: string // YYYY-MM-DDTHH:mm, floating local time
  durationMin?: number
  location?: string
  description?: string
  status: 'requested' | 'pending' | 'confirmed'
  reminderDays?: number
}

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

/** Fold lines to 75 octets as required by RFC 5545. */
export function fold(line: string) {
  const enc = new TextEncoder()
  if (enc.encode(line).length <= 75) return line
  const parts: string[] = []
  let cur = ''
  for (const ch of line) {
    const limit = parts.length === 0 ? 75 : 74
    if (enc.encode(cur + ch).length > limit) {
      parts.push(cur)
      cur = ch
    } else cur += ch
  }
  parts.push(cur)
  return parts.join('\r\n ')
}

const stamp = (iso: string) => iso.replace(/[-:]/g, '').replace('T', 'T') + '00'

function addMinutes(startsAt: string, min: number) {
  const t = Date.UTC(+startsAt.slice(0, 4), +startsAt.slice(5, 7) - 1, +startsAt.slice(8, 10), +startsAt.slice(11, 13), +startsAt.slice(14, 16) + min)
  return new Date(t).toISOString().slice(0, 16)
}

export function buildIcs(events: IcsEvent[], now = new Date()): string {
  const dtstamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TripPilot//Appointments//EN', 'CALSCALE:GREGORIAN']
  for (const e of events) {
    const label = e.status === 'confirmed' ? '' : e.status === 'pending' ? '(Pending) ' : '(Requested) '
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.id}@trippilot`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART:${stamp(e.startsAt)}`,
      `DTEND:${stamp(addMinutes(e.startsAt, e.durationMin ?? 60))}`,
      `SUMMARY:${esc(label + e.title)}`,
      `STATUS:${e.status === 'confirmed' ? 'CONFIRMED' : 'TENTATIVE'}`,
    )
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`)
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`)
    if (e.reminderDays) {
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Appointment reminder', `TRIGGER:-P${e.reminderDays}D`, 'END:VALARM')
    }
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}

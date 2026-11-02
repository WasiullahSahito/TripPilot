import type { AppointmentDto } from '@/features/appointments/appointments-api'
import { typeLabel } from '@/features/appointments/appointments-api'
import type { BookingDto } from '@/features/bookings/bookings-api'
import { findDestination, isWorkVisaCategory } from '@/features/visa/destinations'
import { formCompletion, mergeFormData, monthsBetween } from '@/features/visa/form-schema'
import type { ApplicationDto } from '@/features/visa/visa-api'

export type NotificationLevel = 'action' | 'warning' | 'info'

export interface AppNotification {
  id: string
  level: NotificationLevel
  title: string
  detail: string
  href: string
}

interface Input {
  applications: ApplicationDto[]
  bookings: BookingDto[]
  appointments: AppointmentDto[]
  /** Local "today" as YYYY-MM-DD. */
  today: string
}

const dayDiff = (a: string, b: string) => {
  const t = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))
  return Math.round((t(b) - t(a)) / 86_400_000)
}
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
const order: Record<NotificationLevel, number> = { action: 0, warning: 1, info: 2 }

/** Derives reminders from the user's own data. Nothing is sent anywhere; this runs in the browser. */
export function buildNotifications({ applications, bookings, appointments, today }: Input): AppNotification[] {
  const out: AppNotification[] = []

  for (const a of appointments) {
    const days = dayDiff(today, a.startsAt.slice(0, 10))
    if (days < 0) continue
    const what = `${typeLabel[a.type]} at ${a.center}`
    if (days <= 7) {
      out.push({
        id: `appt-soon-${a.id}`, level: 'action', href: '/app/appointments',
        title: days === 0 ? `Appointment today: ${what}` : `Appointment in ${plural(days, 'day')}: ${what}`,
        detail: a.status === 'confirmed' ? 'Confirmed. Check your preparation checklist.' : `Status is "${a.status}". It is not secured until the official provider confirms it.`,
      })
    } else if (a.status !== 'confirmed' && days <= 30) {
      out.push({
        id: `appt-unconfirmed-${a.id}`, level: 'warning', href: '/app/appointments',
        title: `Appointment not confirmed: ${what}`,
        detail: `It is ${plural(days, 'day')} away and still ${a.status}. Record the official confirmation reference once you have it.`,
      })
    }
  }

  for (const app of applications) {
    const dest = findDestination(app.destinationId)
    if (!dest) continue
    const data = mergeFormData(app.data)
    const link = `/app/visa/${app.destinationId}/${app.categoryId}?nationality=${encodeURIComponent(app.nationality)}&residence=${encodeURIComponent(app.residence)}`
    if (app.status === 'draft') {
      const c = formCompletion(data, isWorkVisaCategory(app.categoryId))
      out.push({ id: `visa-draft-${app.id}`, level: 'info', href: link, title: `${dest.name} visa preparation is ${c.percent}% complete`, detail: `${c.done} of ${c.total} sections done. Continue where you left off.` })
    } else if (app.status === 'ready') {
      out.push({ id: `visa-ready-${app.id}`, level: 'action', href: link, title: `${dest.name} application is prepared`, detail: 'Next: submit on the official portal. TripPilot does not submit for you.' })
    }
    const expiry = data.passport.expiryDate
    const departure = data.travel.departureDate
    if (expiry) {
      const left = monthsBetween(today, expiry)
      if (left < 0) out.push({ id: `passport-expired-${app.id}`, level: 'warning', href: link, title: 'Your passport appears to have expired', detail: 'Check the expiry date you entered, and renew if needed.' })
      else if (left < 6) out.push({ id: `passport-soon-${app.id}`, level: 'warning', href: link, title: `Passport expires in about ${plural(left, 'month')}`, detail: 'Many destinations expect several months of remaining validity.' })
      else if (departure && dest.passportValidityMonths > 0 && monthsBetween(departure, expiry) < dest.passportValidityMonths) {
        out.push({ id: `passport-trip-${app.id}`, level: 'warning', href: link, title: `Passport validity may be short for ${dest.name}`, detail: `It may expire less than ${dest.passportValidityMonths} months after your departure.` })
      }
    }
  }

  for (const b of bookings) {
    if (b.status !== 'requested') continue
    const days = dayDiff(today, b.startDate)
    if (days >= 0 && days <= 30) {
      out.push({ id: `booking-pending-${b.id}`, level: 'warning', href: '/app/bookings', title: `Not confirmed yet: ${b.title}`, detail: `Starts in ${plural(days, 'day')}. Add the provider's confirmation reference once you have it.` })
    }
  }

  return out.sort((a, b) => order[a.level] - order[b.level] || a.id.localeCompare(b.id))
}

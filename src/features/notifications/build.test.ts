import type { AppointmentDto } from '@/features/appointments/appointments-api'
import type { BookingDto } from '@/features/bookings/bookings-api'
import type { ApplicationDto } from '@/features/visa/visa-api'
import { buildNotifications } from './build'

const today = '2026-12-01'
const base = { applications: [] as ApplicationDto[], bookings: [] as BookingDto[], appointments: [] as AppointmentDto[], today }

const appt = (over: Partial<AppointmentDto>): AppointmentDto => ({
  id: 'a1', destinationId: 'france', center: 'Centre', type: 'biometrics', startsAt: '2026-12-03T10:00', preferredTimes: '', status: 'requested',
  officialRef: null, reminderDays: 0, notes: '', checklist: {}, documents: [], ...over,
})
const booking = (over: Partial<BookingDto>): BookingDto => ({
  id: 'b1', kind: 'hotel', status: 'requested', source: 'user-entered', title: 'Hotel Lumiere', startDate: '2026-12-10', endDate: null,
  confirmationRef: null, details: {}, documents: [], ...over,
})
const app = (over: Partial<ApplicationDto>): ApplicationDto => ({
  id: 'v1', destinationId: 'france', categoryId: 'schengen-visitor', nationality: 'India', residence: 'India', status: 'draft',
  checklist: {}, data: {}, updatedAt: '2026-11-01', ...over,
})

describe('buildNotifications', () => {
  it('flags appointments within a week as actions and never calls an unconfirmed one secured', () => {
    const [n] = buildNotifications({ ...base, appointments: [appt({})] })
    expect(n!.level).toBe('action')
    expect(n!.title).toMatch(/in 2 days/)
    expect(n!.detail).toMatch(/not secured/)
  })

  it('says "today" and treats confirmed appointments differently', () => {
    const [n] = buildNotifications({ ...base, appointments: [appt({ startsAt: '2026-12-01T09:00', status: 'confirmed', officialRef: 'R1' })] })
    expect(n!.title).toMatch(/today/)
    expect(n!.detail).toMatch(/Confirmed/)
  })

  it('warns about far-off unconfirmed appointments but ignores past and distant ones', () => {
    const list = buildNotifications({
      ...base,
      appointments: [appt({ id: 'p', startsAt: '2026-11-01T10:00' }), appt({ id: 'f', startsAt: '2026-12-20T10:00' }), appt({ id: 'x', startsAt: '2027-06-01T10:00' })],
    })
    expect(list.map((n) => n.id)).toEqual(['appt-unconfirmed-f'])
    expect(list[0]!.level).toBe('warning')
  })

  it('reports visa draft progress and a prepared application', () => {
    const draft = buildNotifications({ ...base, applications: [app({})] })
    expect(draft[0]!.title).toMatch(/0% complete/)
    const ready = buildNotifications({ ...base, applications: [app({ status: 'ready' })] })
    expect(ready[0]!.level).toBe('action')
    expect(ready[0]!.detail).toMatch(/does not submit/)
  })

  it('warns when the passport expires soon, has expired, or is short for the trip', () => {
    const soon = buildNotifications({ ...base, applications: [app({ data: { passport: { expiryDate: '2027-03-01' } } })] })
    expect(soon.some((n) => n.id === 'passport-soon-v1')).toBe(true)
    const expired = buildNotifications({ ...base, applications: [app({ data: { passport: { expiryDate: '2026-01-01' } } })] })
    expect(expired.some((n) => n.id === 'passport-expired-v1')).toBe(true)
    const trip = buildNotifications({
      ...base,
      applications: [app({ destinationId: 'usa', categoryId: 'b2', data: { passport: { expiryDate: '2027-08-01' }, travel: { departureDate: '2027-06-01' } } })],
    })
    expect(trip.some((n) => n.id === 'passport-trip-v1')).toBe(true)
  })

  it('warns about requested bookings starting within 30 days, not confirmed ones', () => {
    const list = buildNotifications({ ...base, bookings: [booking({}), booking({ id: 'c', status: 'confirmed', confirmationRef: 'X' })] })
    expect(list.map((n) => n.id)).toEqual(['booking-pending-b1'])
  })

  it('does not create reminders from sample-only plans', () => {
    const list = buildNotifications({ ...base, bookings: [booking({ status: 'sample', source: 'demo' })] })
    expect(list).toEqual([])
    expect(buildNotifications({ ...base, bookings: [booking({ status: 'sample', source: 'demo' }), booking({ id: 'r', status: 'confirmed', confirmationRef: 'X', startDate: '2027-05-01' })] })).toEqual([])
  })

  it('sorts actions before warnings before info', () => {
    const list = buildNotifications({ ...base, applications: [app({})], appointments: [appt({})], bookings: [booking({})] })
    const levels = list.map((n) => n.level)
    expect(levels).toEqual([...levels].sort((a, b) => ['action', 'warning', 'info'].indexOf(a) - ['action', 'warning', 'info'].indexOf(b)))
  })

  it('returns nothing for a user with no data', () => {
    expect(buildNotifications(base)).toEqual([])
  })
})

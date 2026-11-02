import type { AppointmentDto } from '@/features/appointments/appointments-api'
import { typeLabel } from '@/features/appointments/appointments-api'
import type { BookingDto } from '@/features/bookings/bookings-api'
import { buildChecklist } from '@/features/visa/checklist'
import { findDestination } from '@/features/visa/destinations'
import { mergeFormData } from '@/features/visa/form-schema'
import type { ApplicationDto } from '@/features/visa/visa-api'
import type { BadgeKind, PackageItem, SectionId, TextEntry } from './package-builder'

export interface DocumentMeta {
  id: string
  filename: string
  mime: string
  size: number
  ownerId: string
  /** Checklist item (visa uploads) or 'booking' / 'appointment'. */
  itemId: string
  owner: { kind: 'visa' | 'flight' | 'hotel' | 'insurance' | 'appointment'; label: string }
}

export interface AssembleInput {
  applications: ApplicationDto[]
  bookings: BookingDto[]
  appointments: AppointmentDto[]
  documents: DocumentMeta[]
  loadFile(docId: string): Promise<Uint8Array>
  /** Lazily builds the visa application summary PDF bytes. */
  buildVisaSummary(app: ApplicationDto, uploads: Record<string, string[]>): Promise<Uint8Array>
}

const SECTION_ORDER: SectionId[] = ['visa', 'flights', 'hotels', 'insurance', 'appointments', 'supporting']

export function bookingStatusLine(b: Pick<BookingDto, 'status' | 'confirmationRef'>) {
  if (b.status === 'sample') return 'SAMPLE PLAN - not a booking, ticket or valid travel document'
  if (b.status === 'requested') return 'REQUESTED - not confirmed by the provider'
  return `CONFIRMED - reference ${b.confirmationRef ?? '(missing)'} (entered by the traveller; verify against the original)`
}

export function appointmentStatusLine(a: Pick<AppointmentDto, 'status' | 'officialRef'>) {
  if (a.status === 'requested') return 'REQUESTED - not secured'
  if (a.status === 'pending') return 'PENDING - awaiting the official provider'
  return `CONFIRMED - reference ${a.officialRef ?? '(missing)'} (entered by the traveller)`
}

const applicationStatusLine = (s: ApplicationDto['status']) =>
  s === 'draft' ? 'DRAFT - incomplete preparation summary'
    : s === 'ready' ? 'PREPARED - not submitted'
    : 'SUBMITTED on the official portal (self-reported)'

function badgeFor(status: BookingDto['status']): { kind: BadgeKind; label: string } {
  return { sample: { kind: 'sample' as const, label: 'SAMPLE - not a booking' }, requested: { kind: 'requested' as const, label: 'REQUESTED' }, confirmed: { kind: 'confirmed' as const, label: 'CONFIRMED (user-entered reference)' } }[status]
}

function bookingEntry(b: BookingDto): TextEntry {
  const lines = [`${b.startDate}${b.endDate ? ` to ${b.endDate}` : ''}`]
  for (const [k, v] of Object.entries(b.details)) lines.push(`${k}: ${v}`)
  return { heading: b.title.replace(/^(Sample( quote| stay)?|Policy): ?/, ''), status: bookingStatusLine(b), lines }
}

const KIND_SECTION = { flight: 'flights', hotel: 'hotels', insurance: 'insurance' } as const
const KIND_NAME = { flight: 'Flight', hotel: 'Hotel', insurance: 'Insurance' } as const

export function assembleItems(input: AssembleInput): PackageItem[] {
  const items: PackageItem[] = []

  // ---- visa ----
  for (const app of input.applications) {
    const dest = findDestination(app.destinationId)
    const category = dest?.categories.find((c) => c.id === app.categoryId)
    if (!dest || !category) continue
    const name = `${dest.name} - ${category.label}`
    const uploads: Record<string, string[]> = {}
    for (const d of input.documents.filter((x) => x.ownerId === app.id)) {
      ;(uploads[d.itemId || 'other'] ??= []).push(d.filename)
    }
    items.push({
      id: `visa-${app.id}`, section: 'visa', title: `Visa application summary: ${name}`,
      detail: 'Generated from your saved application data.',
      badge: { kind: 'generated', label: applicationStatusLine(app.status) },
      selected: true,
      source: { type: 'file', mime: 'application/pdf', load: () => input.buildVisaSummary(app, uploads) },
    })
    const data = mergeFormData(app.data)
    const list = buildChecklist(dest, app.categoryId, data.travel.purpose || category.purposes[0] || '')
    items.push({
      id: `checklist-${app.id}`, section: 'supporting', title: `Supporting-document checklist: ${dest.name}`,
      badge: { kind: 'generated', label: 'CHECKLIST - your own progress' }, selected: true,
      source: {
        type: 'text',
        entries: [{
          heading: name,
          status: 'General guidance only; confirm requirements on the official site.',
          lines: list.map((i) => `${app.checklist[i.id] ? '[x]' : '[ ]'} ${i.label}${i.required ? '' : ' (optional)'}`),
        }],
      },
    })
  }

  // ---- bookings: confirmed/requested are kept separate from sample plans ----
  for (const kind of ['flight', 'hotel', 'insurance'] as const) {
    const all = input.bookings.filter((b) => b.kind === kind)
    const real = all.filter((b) => b.status !== 'sample')
    const samples = all.filter((b) => b.status === 'sample')
    const section = KIND_SECTION[kind]
    if (real.length) {
      const allConfirmed = real.every((b) => b.status === 'confirmed')
      items.push({
        id: `${kind}-records`, section, title: `${KIND_NAME[kind]} reservations`,
        badge: allConfirmed ? badgeFor('confirmed') : badgeFor('requested'), selected: true,
        source: { type: 'text', entries: real.map(bookingEntry) },
      })
    }
    if (samples.length) {
      items.push({
        id: `${kind}-samples`, section, title: `${KIND_NAME[kind]} - sample plans (planning only)`,
        detail: 'Not bookings. Include only if you want your planning notes in the package.',
        badge: badgeFor('sample'), selected: false,
        source: { type: 'text', entries: samples.map(bookingEntry) },
      })
    }
  }

  // ---- appointments ----
  if (input.appointments.length) {
    const allConfirmed = input.appointments.every((a) => a.status === 'confirmed')
    items.push({
      id: 'appointments', section: 'appointments', title: 'Appointments',
      badge: allConfirmed ? { kind: 'confirmed', label: 'CONFIRMED (user-entered reference)' } : { kind: 'pending', label: 'INCLUDES UNCONFIRMED' },
      selected: true,
      source: {
        type: 'text',
        entries: input.appointments.map((a) => ({
          heading: `${typeLabel[a.type]} - ${a.center}`,
          status: appointmentStatusLine(a),
          lines: [a.startsAt.replace('T', ' at '), ...(a.notes ? [a.notes] : [])],
        })),
      },
    })
  }

  // ---- uploaded files ----
  for (const d of input.documents) {
    const mime = d.mime as 'application/pdf' | 'image/png' | 'image/jpeg'
    const section: SectionId =
      d.owner.kind === 'flight' ? 'flights' : d.owner.kind === 'hotel' ? 'hotels' : d.owner.kind === 'insurance' ? 'insurance'
      : d.owner.kind === 'appointment' ? 'appointments' : 'supporting'
    items.push({
      id: `file-${d.id}`, section, title: d.filename, detail: `Attached to: ${d.owner.label}`,
      badge: { kind: 'uploaded', label: 'UPLOADED FILE - not verified by TripPilot' }, selected: true,
      source: { type: 'file', mime, load: () => input.loadFile(d.id) },
    })
  }

  return items
    .map((it, i) => ({ it, i }))
    .sort((a, b) => SECTION_ORDER.indexOf(a.it.section) - SECTION_ORDER.indexOf(b.it.section) || a.i - b.i)
    .map((x) => x.it)
}

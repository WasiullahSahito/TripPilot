import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import type { ChecklistItem } from './checklist'
import type { DestinationConfig } from './destinations'
import { safeText, wrapText } from '@/lib/pdf-text'
import { stepLabels, STEP_IDS, type FormData } from './form-schema'

export interface SummaryInput {
  destination: DestinationConfig
  categoryLabel: string
  nationality: string
  residence: string
  data: FormData
  checklist: ChecklistItem[]
  checked: Record<string, boolean>
  /** Filenames uploaded per checklist item id. */
  uploads: Record<string, string[]>
  workVisa?: boolean
  generatedAt?: Date
  /** Set false when the PDF is embedded in a package that adds its own page numbers. */
  footer?: boolean
}

const FIELD_LABELS: Record<string, string> = {
  givenNames: 'Given names', surname: 'Surname', dateOfBirth: 'Date of birth', placeOfBirth: 'Place of birth',
  email: 'Email', phone: 'Phone', address: 'Home address', number: 'Passport number', issuingCountry: 'Issuing country',
  issueDate: 'Issue date', expiryDate: 'Expiry date', purpose: 'Purpose', arrivalDate: 'Arrival date',
  departureDate: 'Departure date', name: 'Name', bookingStatus: 'Booking status', plan: 'Itinerary',
  jobTitle: 'Intended job title', workLocation: 'Intended work location', employerName: 'Employer or sponsor',
  offerStatus: 'Job offer status', details: 'Employment notes',
}

const BOOKING_LABEL: Record<string, string> = {
  planned: 'Planned — not a confirmed reservation',
  confirmed: 'Confirmed by the user (verify with the booking document)',
}

const safe = safeText
const wrap = wrapText

export async function buildApplicationSummary(input: SummaryInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(`Visa application summary — ${input.destination.name}`)
  pdf.setCreator('TripPilot')
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const W = 595, H = 842, M = 50
  const navy = rgb(0.043, 0.122, 0.227)
  const grey = rgb(0.33, 0.38, 0.48)

  let page!: PDFPage
  let y = 0
  const newPage = () => {
    page = pdf.addPage([W, H])
    y = H - M
  }
  const ensure = (h: number) => {
    if (y - h < M + 20) newPage()
  }
  const text = (s: string, o: { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb>; x?: number } = {}) => {
    const size = o.size ?? 10
    const f = o.f ?? font
    for (const l of wrap(s, f, size, W - M * 2 - (o.x ?? 0))) {
      ensure(size + 4)
      page.drawText(l, { x: M + (o.x ?? 0), y: y - size, size, font: f, color: o.color ?? navy })
      y -= size + 4
    }
  }
  const heading = (s: string) => {
    ensure(40)
    y -= 10
    text(s, { size: 13, f: bold })
    page.drawLine({ start: { x: M, y: y + 2 }, end: { x: W - M, y: y + 2 }, thickness: 0.6, color: grey })
    y -= 6
  }
  const row = (label: string, value: string) => {
    ensure(16)
    const top = y
    page.drawText(safe(label), { x: M, y: top - 10, size: 9, font, color: grey })
    const before = y
    const lines = wrap(value || '—', font, 10, W - M * 2 - 150)
    for (const l of lines) {
      ensure(14)
      page.drawText(l, { x: M + 150, y: y - 10, size: 10, font, color: navy })
      y -= 14
    }
    if (y === before) y -= 14
  }

  newPage()
  text('Visa application summary', { size: 22, f: bold })
  y -= 4
  text(`${input.destination.name} — ${input.categoryLabel}`, { size: 12 })
  text(`Nationality: ${input.nationality || '—'}   Residence: ${input.residence || '—'}`, { color: grey })
  y -= 6
  ensure(60)
  page.drawRectangle({ x: M, y: y - 52, width: W - M * 2, height: 52, color: rgb(1, 0.97, 0.88), borderColor: rgb(0.9, 0.75, 0.3), borderWidth: 0.8 })
  const noticeTop = y
  y -= 6
  text('Preparation summary only. This is NOT an application, a submission, or a confirmation of any booking or appointment. Submit through the official portal listed below, which is the authoritative source.', { size: 9, x: 8 })
  y = noticeTop - 60

  const sections = input.workVisa
    ? ['applicant', 'passport', 'employment'] as const
    : STEP_IDS
  for (const id of sections) {
    heading(stepLabels[id])
    const entries = Object.entries(input.data[id])
    if (!entries.length) row('Not completed', '')
    for (const [k, v] of entries) row(FIELD_LABELS[k] ?? k, k === 'bookingStatus' ? (BOOKING_LABEL[v] ?? v) : v)
  }

  heading('Document checklist')
  for (const item of input.checklist) {
    ensure(18)
    const done = input.checked[item.id]
    const files = input.uploads[item.id] ?? []
    text(`${done ? '[x]' : '[ ]'} ${item.label}${item.required ? '' : ' (optional)'}${files.length ? ` — ${files.join(', ')}` : ''}`)
  }

  heading('Official sources')
  for (const l of input.destination.officialLinks) text(`${l.label}: ${l.url}`)
  for (const n of input.destination.notes) text(`Note: ${n}`, { color: grey })

  const stamp = (input.generatedAt ?? new Date()).toISOString().slice(0, 10)
  const pages = pdf.getPages()
  if (input.footer !== false) pages.forEach((p, i) => {
    p.drawText(`Generated ${stamp} by TripPilot  |  Page ${i + 1} of ${pages.length}`, { x: M, y: 28, size: 8, font, color: grey })
  })
  return pdf.save()
}

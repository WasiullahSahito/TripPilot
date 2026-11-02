import type { BookingDto } from '@/features/bookings/bookings-api'
import type { ApplicationDto } from '@/features/visa/visa-api'
import { assembleItems, bookingStatusLine, type AssembleInput, type DocumentMeta } from './assemble-items'

const booking = (over: Partial<BookingDto>): BookingDto => ({
  id: 'b', kind: 'flight', status: 'sample', source: 'demo', title: 'Sample: DEL to CDG', startDate: '2026-12-01', endDate: null,
  confirmationRef: null, details: {}, documents: [], ...over,
})

const app: ApplicationDto = {
  id: 'app1', destinationId: 'france', categoryId: 'schengen-visitor', nationality: 'India', residence: 'India', status: 'draft',
  checklist: { passport: true }, data: {}, updatedAt: '2026-10-01',
}

const base: AssembleInput = {
  applications: [], bookings: [], appointments: [], documents: [],
  loadFile: async () => new Uint8Array(),
  buildVisaSummary: async () => new Uint8Array(),
}

describe('assembleItems', () => {
  it('keeps sample plans separate from real reservations and unselected by default', () => {
    const items = assembleItems({
      ...base,
      bookings: [
        booking({ id: '1', status: 'sample' }),
        booking({ id: '2', status: 'confirmed', confirmationRef: 'XK29LQ' }),
        booking({ id: '3', status: 'requested' }),
      ],
    })
    const samples = items.find((i) => i.id === 'flight-samples')!
    const records = items.find((i) => i.id === 'flight-records')!
    expect(samples.selected).toBe(false)
    expect(samples.badge.kind).toBe('sample')
    expect(records.selected).toBe(true)
    // a mixed confirmed + requested group is not labelled as confirmed
    expect(records.badge.kind).toBe('requested')
    if (records.source.type !== 'text') throw new Error('expected text')
    expect(records.source.entries).toHaveLength(2)
    expect(records.source.entries.map((e) => e.status).join(' ')).toContain('CONFIRMED - reference XK29LQ')
  })

  it('labels every booking status truthfully', () => {
    expect(bookingStatusLine({ status: 'sample', confirmationRef: null })).toMatch(/not a booking/)
    expect(bookingStatusLine({ status: 'requested', confirmationRef: null })).toMatch(/not confirmed/)
    expect(bookingStatusLine({ status: 'confirmed', confirmationRef: 'ABC' })).toMatch(/entered by the traveller/)
  })

  it('creates a visa summary and checklist for a known destination and skips unknown ones', () => {
    const items = assembleItems({ ...base, applications: [app, { ...app, id: 'x', destinationId: 'narnia' }] })
    expect(items.map((i) => i.id)).toEqual(['visa-app1', 'checklist-app1'])
    expect(items[0]!.badge.label).toMatch(/DRAFT/)
  })

  it('orders sections and attaches uploaded files to the right section', () => {
    const docs: DocumentMeta[] = [
      { id: 'd1', filename: 'ticket.pdf', mime: 'application/pdf', size: 10, ownerId: 'b', itemId: 'booking', owner: { kind: 'flight', label: 'Flight' } },
      { id: 'd2', filename: 'passport.pdf', mime: 'application/pdf', size: 10, ownerId: 'app1', itemId: 'passport', owner: { kind: 'visa', label: 'france' } },
    ]
    const items = assembleItems({ ...base, applications: [app], documents: docs })
    const sections = items.map((i) => i.section)
    expect(sections.indexOf('visa')).toBeLessThan(sections.indexOf('flights'))
    expect(sections.indexOf('flights')).toBeLessThan(sections.indexOf('supporting'))
    expect(items.find((i) => i.id === 'file-d1')!.section).toBe('flights')
    expect(items.find((i) => i.id === 'file-d2')!.section).toBe('supporting')
    expect(items.find((i) => i.id === 'file-d1')!.badge.kind).toBe('uploaded')
  })

  it('flags appointments that are not all confirmed', () => {
    const items = assembleItems({
      ...base,
      appointments: [
        { id: 'a', destinationId: 'france', center: 'Centre', type: 'visa', startsAt: '2026-12-02T10:00', preferredTimes: '', status: 'pending', officialRef: null, reminderDays: 0, notes: '', checklist: {}, documents: [] },
      ],
    })
    expect(items[0]!.badge.kind).toBe('pending')
  })
})

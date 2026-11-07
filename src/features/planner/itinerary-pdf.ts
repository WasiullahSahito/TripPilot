import { PDFDocument } from 'pdf-lib'
import { COLORS, embedFonts, FlowWriter } from '@/lib/pdf-text'
import { dayDate, type PlanDay } from './planner'

export interface ItineraryPdfInput {
  traveller: string
  destination: string
  startDate?: string
  accommodation?: string
  plan: PlanDay[]
}

/** A clean day-by-day itinerary the traveller can attach to a visa file. It is a plan, not a booking confirmation. */
export async function buildItineraryPdf(input: ItineraryPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(`Travel itinerary - ${input.destination}`)
  pdf.setCreator('TripPilot')
  const w = new FlowWriter(pdf, await embedFonts(pdf))
  w.text('Travel itinerary', { size: 20, bold: true })
  w.space(4)
  w.text(`Destination: ${input.destination}`, { size: 11, bold: true })
  if (input.traveller.trim()) w.text(`Traveller: ${input.traveller.trim()}`, { size: 11 })
  const end = dayDate(input.startDate, input.plan.length - 1)
  if (input.startDate && end) w.text(`Dates: ${input.startDate} to ${end} (${input.plan.length} days)`, { size: 11 })
  else w.text(`Length of stay: ${input.plan.length} days`, { size: 11 })
  if (input.accommodation?.trim()) w.text(`Accommodation: ${input.accommodation.trim()}`, { size: 11 })
  w.space(6)
  w.rule()
  for (const d of input.plan) {
    const date = dayDate(input.startDate, d.day - 1)
    w.space(4)
    w.text(`Day ${d.day}${date ? ` - ${date}` : ''}`, { size: 12, bold: true })
    for (const i of d.items) {
      w.text(`${i.slot}: ${i.title}${i.kind === 'suggestion' ? ' (free time)' : ''}`, { size: 10, indent: 10 })
    }
  }
  w.space(10)
  w.rule()
  w.text('This itinerary is a plan prepared by the traveller. It is not a booking confirmation; attach your flight and accommodation reservations separately.', { size: 8, color: COLORS.grey })
  return pdf.save()
}

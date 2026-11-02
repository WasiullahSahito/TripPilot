import { api } from '@/lib/api'
import { uploadFile } from '@/lib/upload'

export type BookingStatus = 'sample' | 'requested' | 'confirmed'

export interface BookingDocument {
  id: string
  filename: string
  size: number
}

export interface BookingDto {
  id: string
  kind: 'flight' | 'hotel' | 'insurance'
  status: BookingStatus
  source: 'demo' | 'user-entered' | 'provider'
  title: string
  startDate: string
  endDate: string | null
  confirmationRef: string | null
  details: Record<string, string | number>
  documents: BookingDocument[]
}

export type NewBooking = Omit<BookingDto, 'id' | 'documents' | 'source'> & { source: 'demo' | 'user-entered' }

const BASE = import.meta.env.VITE_API_BASE_URL ?? ''

export const bookingsApi = {
  list: () => api<{ bookings: BookingDto[] }>('/bookings').then((r) => r.bookings),
  create: (b: NewBooking) => api<{ booking: BookingDto }>('/bookings', { method: 'POST', body: b }).then((r) => r.booking),
  remove: (id: string) => api<void>(`/bookings/${id}`, { method: 'DELETE' }),
  documentUrl: (docId: string) => `${BASE}/api/bookings/documents/${docId}`,

  async attach(id: string, file: File) {
    await uploadFile({ kind: 'booking', ownerId: id }, file)
  },
}

export const statusInfo: Record<BookingStatus, { label: string; tone: 'neutral' | 'warning' | 'accent'; help: string }> = {
  sample: { label: 'Sample plan — not a booking', tone: 'neutral', help: 'Planning only. Not a reservation, ticket or valid travel document.' },
  requested: { label: 'Requested — awaiting provider', tone: 'warning', help: 'You asked a provider for this. It is not secured until they confirm.' },
  confirmed: { label: 'Confirmed by provider (entered by you)', tone: 'accent', help: 'You entered the confirmation reference from your provider.' },
}

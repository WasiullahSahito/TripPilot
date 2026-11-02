import { api } from '@/lib/api'
import { uploadFile } from '@/lib/upload'

export type AppointmentStatus = 'requested' | 'pending' | 'confirmed'
export type AppointmentType = 'visa' | 'biometrics' | 'interview' | 'other'

export interface AppointmentDto {
  id: string
  destinationId: string
  center: string
  type: AppointmentType
  startsAt: string
  preferredTimes: string
  status: AppointmentStatus
  officialRef: string | null
  reminderDays: number
  notes: string
  checklist: Record<string, boolean>
  documents: { id: string; filename: string; size: number }[]
}

export type NewAppointment = Omit<AppointmentDto, 'id' | 'documents'>

const BASE = import.meta.env.VITE_API_BASE_URL ?? ''

export const appointmentsApi = {
  list: () => api<{ appointments: AppointmentDto[] }>('/appointments').then((r) => r.appointments),
  create: (a: NewAppointment) => api<{ appointment: AppointmentDto }>('/appointments', { method: 'POST', body: a }),
  update: (id: string, patch: Partial<NewAppointment>) => api<{ appointment: AppointmentDto }>(`/appointments/${id}`, { method: 'PATCH', body: patch }),
  remove: (id: string) => api<void>(`/appointments/${id}`, { method: 'DELETE' }),
  documentUrl: (docId: string) => `${BASE}/api/bookings/documents/${docId}`,

  async attach(id: string, file: File) {
    await uploadFile({ kind: 'appointment', ownerId: id }, file)
  },
}

export const statusMeta: Record<AppointmentStatus, { label: string; help: string; tone: 'neutral' | 'warning' | 'accent'; chip: string }> = {
  requested: { label: 'Requested', help: 'You have asked for or are planning this slot. It is not secured.', tone: 'neutral', chip: 'bg-muted text-ink' },
  pending: { label: 'Pending', help: 'Submitted to the provider; waiting for their confirmation.', tone: 'warning', chip: 'bg-amber-100 text-amber-900' },
  confirmed: { label: 'Confirmed', help: 'Confirmed by the official provider (reference entered by you).', tone: 'accent', chip: 'bg-accent-50 text-accent-700 ring-1 ring-accent-500' },
}

export const typeLabel: Record<AppointmentType, string> = {
  visa: 'Visa application', biometrics: 'Biometrics', interview: 'Interview', other: 'Other',
}

export const checklistByType: Record<AppointmentType, { id: string; label: string }[]> = {
  visa: [
    { id: 'passport', label: 'Original passport' },
    { id: 'form', label: 'Printed application form / confirmation' },
    { id: 'photos', label: 'Passport photos' },
    { id: 'fee', label: 'Visa fee payment proof' },
    { id: 'supporting', label: 'Supporting documents (see visa checklist)' },
  ],
  biometrics: [
    { id: 'passport', label: 'Original passport' },
    { id: 'confirmation', label: 'Appointment confirmation' },
    { id: 'photo-id', label: 'Photo ID' },
  ],
  interview: [
    { id: 'passport', label: 'Original passport' },
    { id: 'confirmation', label: 'Appointment confirmation' },
    { id: 'supporting', label: 'Supporting documents' },
    { id: 'itinerary', label: 'Travel plans / itinerary' },
  ],
  other: [{ id: 'confirmation', label: 'Appointment confirmation' }],
}

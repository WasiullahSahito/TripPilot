export type Role = 'user' | 'admin'

export interface User {
  id: string
  email: string
  name: string
  passwordHash: string
  role: Role
  emailVerifiedAt: string | null
  verifyToken: string | null
  /** Set by an administrator: the account cannot log in and existing sessions stop working. */
  disabledAt?: string | null
  createdAt: string
}

export interface Profile {
  userId: string
  nationality: string
  residenceCountry: string
  homeAirport: string
  interests: string[]
  onboardedAt: string | null
  /** Opt-in: delete uploaded files this many days after the related trip, appointment or booking. null = keep until deleted. */
  retentionDays?: number | null
}

export type TripStatus = 'planning' | 'ready' | 'completed'

export interface Trip {
  id: string
  userId: string
  destination: string
  departOn: string
  returnOn: string
  purpose: string
  budget: number | null
  status: TripStatus
  createdAt: string
}

export type PublicUser = Pick<User, 'id' | 'email' | 'name' | 'role'> & { emailVerified: boolean }

export type ApplicationStatus = 'draft' | 'ready' | 'submitted_on_portal'

export interface VisaApplication {
  id: string
  userId: string
  destinationId: string
  categoryId: string
  nationality: string
  residence: string
  status: ApplicationStatus
  checklist: Record<string, boolean>
  /** Form data (passport number, dates of birth, ...) encrypted with AES-256-GCM. */
  dataEnc: string
  createdAt: string
  updatedAt: string
}

export interface StoredDocument {
  id: string
  userId: string
  applicationId: string
  itemId: string
  filename: string
  mime: string
  size: number
  uploadedAt: string
}

export type BookingStatus = 'sample' | 'requested' | 'confirmed'
export type BookingSource = 'demo' | 'user-entered' | 'provider'

export interface Booking {
  id: string
  userId: string
  kind: 'flight' | 'hotel' | 'insurance'
  status: BookingStatus
  source: BookingSource
  title: string
  startDate: string
  endDate: string | null
  /** Only ever a value the user copied from their provider, or one issued by a live provider integration. */
  confirmationRef: string | null
  details: Record<string, string | number>
  createdAt: string
}

export interface Appointment {
  id: string
  userId: string
  destinationId: string
  center: string
  type: 'visa' | 'biometrics' | 'interview' | 'other'
  startsAt: string
  preferredTimes: string
  status: 'requested' | 'pending' | 'confirmed'
  officialRef: string | null
  reminderDays: number
  notes: string
  checklist: Record<string, boolean>
  createdAt: string
}

export type ExpenseStatus = 'estimated' | 'paid'

export interface Expense {
  id: string
  userId: string
  /** Optional link to one of the user's trips; cleared (not deleted) if the trip is removed. */
  tripId: string | null
  category: string
  description: string
  /** Amount in `currency` units. No exchange rates are applied anywhere. */
  amount: number
  currency: string
  spentOn: string
  status: ExpenseStatus
  createdAt: string
}

/** Audit entries hold ids and small flags only: never names, emails, passport data or file names. */
export interface AuditEntry {
  id: string
  at: string
  actorId: string | null
  action: string
  targetId: string | null
  meta: Record<string, string | number | boolean>
}

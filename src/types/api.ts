export interface User {
  id: string
  email: string
  name: string
  role: 'user' | 'admin'
  emailVerified: boolean
}

export interface Profile {
  userId: string
  nationality: string
  residenceCountry: string
  homeAirport: string
  interests: string[]
  onboardedAt: string | null
  /** Opt-in: delete uploaded files this many days after the related trip. null = keep until deleted. */
  retentionDays?: number | null
}

export type TripStatus = 'planning' | 'ready' | 'completed'

export interface Trip {
  id: string
  destination: string
  departOn: string
  returnOn: string
  purpose: string
  budget: number | null
  status: TripStatus
}

export type NewTrip = Omit<Trip, 'id' | 'status'>

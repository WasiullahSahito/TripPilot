export type StayKind = 'hotel' | 'hostel' | 'guesthouse' | 'motel' | 'apartment' | 'chalet'

export const STAY_KIND_LABEL: Record<StayKind, string> = {
  hotel: 'Hotel', hostel: 'Hostel', guesthouse: 'Guest house', motel: 'Motel', apartment: 'Apartment', chalet: 'Chalet',
}

/** A real property from OpenStreetMap. It deliberately has no price, rating or availability: those only come from partners. */
export interface HotelListing {
  id: string
  name: string
  kind: StayKind
  stars: number | null
  lat: number
  lng: number
  distanceKm: number
  address: string
  website: string | null
  phone: string | null
  wifi: boolean | null
  wheelchair: 'yes' | 'limited' | 'no' | null
  osmUrl: string
}

export interface HotelSearchParams {
  city: string
  checkIn: string
  checkOut: string
  guests: number
  rooms: number
}

export interface DirectoryResult {
  listings: HotelListing[]
  cached: boolean
  source: string
  notice: string
}

export type Cabin = 'economy' | 'premium' | 'business' | 'first'

export interface FlightSearchParams {
  origin: string // IATA code
  destination: string
  departDate: string // YYYY-MM-DD
  returnDate: string | null
  adults: number
  children: number
  cabin: Cabin
}

export interface FlightLeg {
  from: string
  to: string
  departAt: string // local time, YYYY-MM-DDTHH:mm
  arriveAt: string
  durationMin: number
  stops: number
  via: string[]
}

export interface FareOption {
  id: string
  name: string
  /** Total for all passengers. */
  price: number
  cabinBag: string
  checkedBag: string
  /** null = the source does not say; never guess. */
  changeable: boolean | null
  refundable: boolean | null
}

export interface FlightOffer {
  id: string
  airline: string
  outbound: FlightLeg
  inbound: FlightLeg | null
  fares: FareOption[]
  currency: 'USD'
  /** Partner page where the fare can actually be booked (live results only). */
  bookUrl?: string
}

export interface FlightSearchResult {
  mode: 'live'
  offers: FlightOffer[]
  notice: string
}

export interface FlightProvider {
  search(params: FlightSearchParams): Promise<FlightSearchResult>
}

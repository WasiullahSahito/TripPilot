import type { FlightOffer } from '@/services/flights'

export interface FlightFilters {
  maxStops: 0 | 1 | 2
  airlines: string[] // empty = all
  maxPrice: number | null
}

export type FlightSort = 'price' | 'duration' | 'departure'

export const cheapestFare = (o: FlightOffer) => Math.min(...o.fares.map((f) => f.price))
export const totalDuration = (o: FlightOffer) => o.outbound.durationMin + (o.inbound?.durationMin ?? 0)
const maxStopsOf = (o: FlightOffer) => Math.max(o.outbound.stops, o.inbound?.stops ?? 0)

export function filterFlights(offers: FlightOffer[], f: FlightFilters) {
  return offers.filter(
    (o) =>
      maxStopsOf(o) <= f.maxStops &&
      (f.airlines.length === 0 || f.airlines.includes(o.airline)) &&
      (f.maxPrice === null || cheapestFare(o) <= f.maxPrice),
  )
}

export function sortFlights(offers: FlightOffer[], by: FlightSort) {
  const key = { price: cheapestFare, duration: totalDuration, departure: (o: FlightOffer) => o.outbound.departAt }[by]
  return [...offers].sort((a, b) => {
    const ka = key(a)
    const kb = key(b)
    return ka < kb ? -1 : ka > kb ? 1 : cheapestFare(a) - cheapestFare(b)
  })
}

export function formatDuration(min: number) {
  return `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`
}

export const timeOf = (iso: string) => iso.slice(11, 16)

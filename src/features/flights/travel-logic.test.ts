import type { FlightOffer } from '@/services/flights'
import { cheapestFare, filterFlights, formatDuration, sortFlights } from './filter'

const flight = (id: string, airline: string, price: number, stops: number, durationMin: number): FlightOffer => ({
  id,
  airline,
  outbound: { from: 'DEL', to: 'CDG', departAt: '2026-12-01T10:00', arriveAt: '2026-12-01T18:00', durationMin, stops, via: [] },
  inbound: null,
  fares: [{ id: `${id}-fare`, name: 'Economy', price, cabinBag: '1', checkedBag: '0', changeable: null, refundable: null }],
  currency: 'USD',
})

describe('flight filters and sorting', () => {
  const offers = [flight('a', 'Air One', 300, 0, 600), flight('b', 'Air Two', 200, 1, 500)]

  it('filters by stops, airline and price', () => {
    expect(filterFlights(offers, { maxStops: 0, airlines: [], maxPrice: null }).map((o) => o.id)).toEqual(['a'])
    expect(filterFlights(offers, { maxStops: 2, airlines: ['Air One'], maxPrice: null }).map((o) => o.id)).toEqual(['a'])
    expect(filterFlights(offers, { maxStops: 2, airlines: [], maxPrice: 250 }).map((o) => o.id)).toEqual(['b'])
  })

  it('sorts by cheapest fare and formats durations', () => {
    expect(sortFlights(offers, 'price').map(cheapestFare)).toEqual([200, 300])
    expect(formatDuration(125)).toBe('2h 05m')
  })
})

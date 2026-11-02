import { formatKm, haversineKm } from './geo'
import { cityCenter, mapCities, poisForCity } from './poi'
import { airports, findAirport } from '@/services/travel/reference'

describe('geo helpers', () => {
  it('computes great-circle distance', () => {
    // Paris -> London is roughly 340 km
    const d = haversineKm({ lat: 48.8566, lng: 2.3522 }, { lat: 51.5074, lng: -0.1278 })
    expect(d).toBeGreaterThan(330)
    expect(d).toBeLessThan(350)
    expect(haversineKm({ lat: 1, lng: 1 }, { lat: 1, lng: 1 })).toBe(0)
  })

  it('formats distances', () => {
    expect(formatKm(0.42)).toBe('420 m')
    expect(formatKm(3.456)).toBe('3.5 km')
  })
})

describe('poi data', () => {
  it('provides a map destination for every supported city and validates curated coordinates', () => {
    expect(mapCities).toEqual(airports.map((airport) => airport.city))
    expect(new Set(mapCities).size).toBe(mapCities.length)
    for (const c of mapCities) {
      const pois = poisForCity(c)
      const center = cityCenter(c)
      expect(center.lat).toBeGreaterThanOrEqual(-90)
      expect(center.lat).toBeLessThanOrEqual(90)
      expect(center.lng).toBeGreaterThanOrEqual(-180)
      expect(center.lng).toBeLessThanOrEqual(180)
      expect(pois.every((p) =>
        p.kind === 'attraction' &&
        p.detail.includes('approximate') &&
        p.lat >= -90 && p.lat <= 90 &&
        p.lng >= -180 && p.lng <= 180,
      )).toBe(true)
    }
  })
})

describe('city and airport reference', () => {
  it('contains unique airport codes and supports case-insensitive lookup', () => {
    expect(new Set(airports.map((a) => a.code)).size).toBe(airports.length)
    expect(airports.length).toBeGreaterThan(80)
    for (const airport of airports) {
      expect(findAirport(airport.code)).toEqual(airport)
      expect(findAirport(airport.city)).toEqual(airport)
      expect(airport.lat).toBeGreaterThanOrEqual(-90)
      expect(airport.lat).toBeLessThanOrEqual(90)
      expect(airport.lng).toBeGreaterThanOrEqual(-180)
      expect(airport.lng).toBeLessThanOrEqual(180)
    }
  })

  it('includes major Arab, European, American, Asian and Australian city destinations', () => {
    const cities = new Set(airports.map((airport) => airport.city))
    for (const city of ['Cairo', 'Amman', 'Riyadh', 'Casablanca', 'Paris', 'Rome', 'New York', 'Toronto', 'Tokyo', 'Beijing', 'Sydney']) {
      expect(cities.has(city)).toBe(true)
    }
  })
})

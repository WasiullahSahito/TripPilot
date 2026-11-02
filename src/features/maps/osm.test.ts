import { parseNominatim, parseOsrm } from './osm'

describe('parseNominatim', () => {
  it('reads the first hit and converts string coordinates', () => {
    const hit = parseNominatim([{ lat: '38.7167', lon: '-9.1333', display_name: 'Lisbon, Portugal' }])
    expect(hit).toEqual({ lat: 38.7167, lng: -9.1333, label: 'Lisbon, Portugal' })
  })
  it('returns null for empty or malformed responses', () => {
    expect(parseNominatim([])).toBeNull()
    expect(parseNominatim({})).toBeNull()
    expect(parseNominatim([{ lat: 'x', lon: 'y' }])).toBeNull()
  })
})

describe('parseOsrm', () => {
  const sample = {
    routes: [{ distance: 12345, duration: 1500, geometry: { coordinates: [[2.29, 48.85], [2.34, 48.86]] } }],
  }
  it('converts metres/seconds and flips GeoJSON [lng,lat] to lat/lng', () => {
    const r = parseOsrm(sample)!
    expect(r.distanceKm).toBe(12.3)
    expect(r.durationMin).toBe(25)
    expect(r.line[0]).toEqual({ lat: 48.85, lng: 2.29 })
  })
  it('returns null when there is no route', () => {
    expect(parseOsrm({ routes: [] })).toBeNull()
    expect(parseOsrm(null)).toBeNull()
  })
})

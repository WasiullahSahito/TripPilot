import { parseJourneys, parsePlaces } from './transit'

describe('transit parsing', () => {
  it('parses geocode hits with exponent-notation coordinates', () => {
    expect(parsePlaces([{ name: 'Lyon', lat: 4.57578137e1, lon: 4.8320114, country: 'FR' }, { name: 'bad' }])).toEqual([{ name: 'Lyon', lat: 45.7578137, lon: 4.8320114, country: 'FR' }])
    expect(parsePlaces(null)).toEqual([])
  })

  it('parses itineraries and legs', () => {
    const j = parseJourneys({ itineraries: [{
      duration: 7200, startTime: '2026-12-10T09:00:00Z', endTime: '2026-12-10T11:00:00Z', transfers: 0,
      legs: [
        { mode: 'WALK', from: { name: 'START' }, to: { name: 'Paris Gare de Lyon' }, startTime: '2026-12-10T09:00:00Z', endTime: '2026-12-10T09:05:00Z' },
        { mode: 'HIGHSPEED_RAIL', from: { name: 'Paris Gare de Lyon' }, to: { name: 'Lyon Part-Dieu' }, startTime: '2026-12-10T09:10:00Z', endTime: '2026-12-10T11:00:00Z', displayName: 'TGV 6601', agencyName: 'SNCF' },
      ],
    }, { startTime: 'x' }] })
    expect(j).toHaveLength(1)
    expect(j[0]!.minutes).toBe(120)
    expect(j[0]!.legs[1]).toMatchObject({ line: 'TGV 6601', agency: 'SNCF', to: 'Lyon Part-Dieu' })
  })
})

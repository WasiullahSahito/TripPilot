import type { HotelListing } from '@/services/hotels'
import { daysBetween } from '@/services/travel/reference'
import { filterListings, sortListings } from './filter'
import { buildStay22Embed } from './stay22'

const listing = (over: Partial<HotelListing>): HotelListing => ({
  id: 'node/1', name: 'Hotel A', kind: 'hotel', stars: 4, lat: 1, lng: 1, distanceKm: 1, address: '1 Main Street, Paris', website: 'https://a.test/',
  phone: null, wifi: null, wheelchair: null, osmUrl: 'https://www.openstreetmap.org/node/1', ...over,
})

const items = [
  listing({ id: 'a', name: 'Alpha Hotel', stars: 5, distanceKm: 3 }),
  listing({ id: 'b', name: 'Beta Hostel', kind: 'hostel', stars: null, distanceKm: 1, website: null }),
  listing({ id: 'c', name: 'Gamma Guest House', kind: 'guesthouse', stars: 3, distanceKm: 2, address: '9 Rose Lane' }),
]

describe('filterListings', () => {
  const none = { kinds: [], minStars: 0, withWebsite: false, query: '' }
  it('returns everything with no filters', () => {
    expect(filterListings(items, none)).toHaveLength(3)
  })
  it('filters by type, stars (excluding unrated), website and text', () => {
    expect(filterListings(items, { ...none, kinds: ['hostel'] }).map((l) => l.id)).toEqual(['b'])
    expect(filterListings(items, { ...none, minStars: 4 }).map((l) => l.id)).toEqual(['a'])
    expect(filterListings(items, { ...none, withWebsite: true }).map((l) => l.id)).toEqual(['a', 'c'])
    expect(filterListings(items, { ...none, query: 'rose' }).map((l) => l.id)).toEqual(['c'])
    expect(filterListings(items, { ...none, query: '  GAMMA ' }).map((l) => l.id)).toEqual(['c'])
  })
})

describe('sortListings', () => {
  it('sorts by distance, name and stars (unrated last) without mutating the input', () => {
    const copy = [...items]
    expect(sortListings(items, 'distance').map((l) => l.id)).toEqual(['b', 'c', 'a'])
    expect(sortListings(items, 'name').map((l) => l.id)).toEqual(['a', 'b', 'c'])
    expect(sortListings(items, 'stars').map((l) => l.id)).toEqual(['a', 'c', 'b'])
    expect(items).toEqual(copy)
  })
})

describe('buildStay22Embed', () => {
  it('builds the documented embed URL with coordinates taking priority over the address', () => {
    const url = buildStay22Embed('myaid', { address: 'Paris', lat: 48.86, lng: 2.35, checkin: '2026-12-01', checkout: '2026-12-05' })!
    const u = new URL(url)
    expect(u.origin + u.pathname).toBe('https://www.stay22.com/embed/gm')
    expect(u.searchParams.get('aid')).toBe('myaid')
    expect(u.searchParams.get('lat')).toBe('48.86')
    expect(u.searchParams.get('address')).toBeNull()
    expect(u.searchParams.get('checkin')).toBe('2026-12-01')
  })
  it('falls back to the address and omits invalid dates', () => {
    const u = new URL(buildStay22Embed('myaid', { address: 'Kuala Lumpur', checkin: 'tomorrow' })!)
    expect(u.searchParams.get('address')).toBe('Kuala Lumpur')
    expect(u.searchParams.has('checkin')).toBe(false)
  })
  it('returns null without a valid affiliate id or without a location', () => {
    expect(buildStay22Embed(undefined, { address: 'Paris' })).toBeNull()
    expect(buildStay22Embed('', { address: 'Paris' })).toBeNull()
    expect(buildStay22Embed('bad id!', { address: 'Paris' })).toBeNull()
    expect(buildStay22Embed('myaid', {})).toBeNull()
  })
})

describe('nights', () => {
  it('counts nights between dates', () => {
    expect(daysBetween('2026-12-01', '2026-12-05')).toBe(4)
  })
})

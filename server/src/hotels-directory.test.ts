// @vitest-environment node
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from './app.ts'
import { buildQuery, clearDirectoryCache, parseOverpass, safeUrl } from './integrations/osm-hotels.ts'
import { JsonStore } from './models/store.ts'

const center = { lat: 48.8566, lng: 2.3522 }

// Shaped like Overpass API JSON (nodes carry lat/lon; ways and relations carry a center).
const sample = {
  elements: [
    { type: 'node', id: 1, lat: 48.86, lon: 2.35, tags: { name: 'Hotel Lumiere', tourism: 'hotel', stars: '4', website: 'lumiere.example', 'addr:housenumber': '12', 'addr:street': 'Rue Exemple', 'addr:city': 'Paris', internet_access: 'wlan', wheelchair: 'yes' } },
    { type: 'way', id: 2, center: { lat: 48.9, lon: 2.4 }, tags: { name: 'Guest House Rose', tourism: 'guest_house', stars: 'none', website: 'javascript:alert(1)' } },
    { type: 'node', id: 3, lat: 48.85, lon: 2.34, tags: { tourism: 'hotel' } }, // no name: skipped
    { type: 'node', id: 4, lat: 48.85, lon: 2.34, tags: { name: 'A Museum', tourism: 'museum' } }, // not accommodation
    { type: 'node', id: 5, tags: { name: 'No Location', tourism: 'hotel' } }, // no coordinates: skipped
  ],
}

describe('parseOverpass', () => {
  it('keeps named accommodation with a location, sorted by distance', () => {
    const l = parseOverpass(sample, center)
    expect(l.map((x) => x.name)).toEqual(['Hotel Lumiere', 'Guest House Rose'])
    expect(l[0]).toMatchObject({ id: 'node/1', kind: 'hotel', stars: 4, wifi: true, wheelchair: 'yes', address: '12 Rue Exemple, Paris', osmUrl: 'https://www.openstreetmap.org/node/1' })
    expect(l[0]!.distanceKm).toBeLessThan(l[1]!.distanceKm)
    expect(l[1]).toMatchObject({ kind: 'guesthouse', stars: null })
  })

  it('only ever returns http(s) website links', () => {
    const l = parseOverpass(sample, center)
    expect(l[0]!.website).toBe('https://lumiere.example/')
    expect(l[1]!.website).toBeNull()
    expect(safeUrl('ftp://x.test')).toBeNull()
    expect(safeUrl('not a url ::')).toBeNull()
  })

  it('invents no prices, ratings or availability', () => {
    const l = parseOverpass(sample, center)[0]!
    expect(Object.keys(l)).not.toEqual(expect.arrayContaining(['price', 'pricePerNight', 'rating', 'reviews']))
  })

  it('rejects an unexpected response shape', () => {
    expect(() => parseOverpass({ nope: 1 }, center)).toThrow(/Unexpected response/)
  })

  it('builds a bounded query', () => {
    const q = buildQuery(48.85, 2.35, 5000)
    expect(q).toContain('around:5000,48.85,2.35')
    expect(q).toContain('out center 300')
  })
})

describe('GET /api/hotels/directory', () => {
  beforeEach(() => clearDirectoryCache())
  afterEach(() => vi.unstubAllGlobals())

  async function signedIn() {
    const a = request.agent(createApp(new JsonStore()))
    await a.post('/api/auth/register').send({ name: 'T', email: 'hotel@example.com', password: 'correct-horse-battery' }).expect(201)
    return a
  }

  it('requires authentication and validates coordinates', async () => {
    await request(createApp(new JsonStore())).get('/api/hotels/directory?lat=1&lng=1').expect(401)
    const a = await signedIn()
    await a.get('/api/hotels/directory?lat=100&lng=1').expect(400)
    await a.get('/api/hotels/directory?lat=1&lng=abc').expect(400)
    await a.get('/api/hotels/directory?lat=1&lng=1&radius=999999').expect(400)
  })

  it('identifies the app and serves repeats from the cache', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify(sample), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const a = await signedIn()
    const first = (await a.get('/api/hotels/directory?lat=48.8566&lng=2.3522').expect(200)).body
    expect(first.listings).toHaveLength(2)
    expect(first.cached).toBe(false)
    expect(first.notice).toMatch(/Prices, availability and reviews are not included/)
    const second = (await a.get('/api/hotels/directory?lat=48.8566&lng=2.3522').expect(200)).body
    expect(second.cached).toBe(true)
    const callsAfterFirst = fetchMock.mock.calls.length
    await a.get('/api/hotels/directory?lat=48.8566&lng=2.3522').expect(200)
    expect(fetchMock).toHaveBeenCalledTimes(callsAfterFirst)
    for (const call of fetchMock.mock.calls) expect(((call[1] as RequestInit).headers as Record<string, string>)['User-Agent']).toMatch(/TripPilot/)
  })

  it('still lists hotels from Nominatim when every Overpass server is failing', async () => {
    const nominatim = [{
      osm_type: 'node', osm_id: 7, name: 'Hotel Khalidiya', lat: '24.4558', lon: '54.3188', category: 'tourism', type: 'hotel',
      address: { road: 'Corniche', city: 'Abu Dhabi' }, extratags: { stars: '5', website: 'https://example.com' },
    }, { osm_type: 'node', osm_id: 8, name: 'A Shop', lat: '24.4', lon: '54.3', category: 'shop', type: 'mall' }]
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) =>
      String(url).includes('nominatim') ? new Response(JSON.stringify(nominatim), { status: 200 }) : new Response('blocked', { status: 406 })))
    const a = await signedIn()
    const body = (await a.get('/api/hotels/directory?lat=24.4539&lng=54.3773').expect(200)).body
    expect(body.listings).toHaveLength(1)
    expect(body.listings[0]).toMatchObject({ name: 'Hotel Khalidiya', stars: 5, kind: 'hotel', address: 'Corniche, Abu Dhabi' })
  })

  it('maps a busy or failing upstream to a retryable error', async () => {
    const a = await signedIn()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('busy', { status: 429 })))
    await a.get('/api/hotels/directory?lat=10&lng=10').expect(503)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
    await a.get('/api/hotels/directory?lat=11&lng=11').expect(502)
  })

  it('no longer pretends to offer priced hotel search', async () => {
    const a = await signedIn()
    await a.post('/api/hotels/search').send({}).expect(404)
  })
})

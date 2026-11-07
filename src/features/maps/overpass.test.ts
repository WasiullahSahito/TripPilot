import { parsePlaces } from './overpass'

describe('parsePlaces', () => {
  it('reads names, prefers English names, dedupes and ranks famous places first', () => {
    const out = parsePlaces({
      elements: [
        { type: 'node', id: 1, lat: 1, lon: 2, tags: { name: 'Small Museum', tourism: 'museum' } },
        { type: 'way', id: 2, center: { lat: 3, lon: 4 }, tags: { name: 'برج', 'name:en': 'Big Tower', tourism: 'attraction', wikidata: 'Q1' } },
        { type: 'node', id: 3, lat: 5, lon: 6, tags: { name: 'Small Museum', tourism: 'museum' } },
        { type: 'node', id: 4, lat: 7, lon: 8, tags: { amenity: 'restaurant' } },
        { type: 'node', id: 5, lat: 9, lon: 9, tags: { name: 'Cafe Rio', amenity: 'restaurant' } },
      ],
    })
    expect(out.map((p) => p.title)).toEqual(['Big Tower', 'Small Museum', 'Cafe Rio'])
    expect(out[2]!.category).toBe('food')
    expect(out[0]!.lat).toBe(3)
  })
  it('returns [] for junk', () => expect(parsePlaces(null)).toEqual([]))
})

import { parseWikipediaPlaces } from './overpass'

describe('parseWikipediaPlaces', () => {
  it('keeps visitable landmarks and drops stations, hospitals and lists', () => {
    const out = parseWikipediaPlaces({
      query: { geosearch: [
        { pageid: 1, title: 'Blue Mosque, Istanbul', lat: 1, lon: 1 },
        { pageid: 2, title: 'Intendente Station', lat: 1, lon: 1 },
        { pageid: 3, title: 'Hospital de Santa Marta', lat: 1, lon: 1 },
        { pageid: 4, title: 'Convent of the Incarnation (Lisbon)', lat: 1, lon: 1 },
        { pageid: 5, title: 'Jardim da Estrela', lat: 1, lon: 1 },
      ] },
    })
    expect(out.map((p) => p.title)).toEqual(['Blue Mosque, Istanbul', 'Convent of the Incarnation', 'Jardim da Estrela'])
    expect(out[2]!.category).toBe('park')
  })
})

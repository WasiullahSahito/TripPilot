import { buildLink, fillTemplate } from './links'

describe('fillTemplate', () => {
  it('substitutes and URL-encodes placeholders', () => {
    expect(fillTemplate('https://x.test/?q={city}', { city: 'New York & Co' })).toBe('https://x.test/?q=New%20York%20%26%20Co')
  })
  it('formats compact dates and lowercases airport codes', () => {
    const u = fillTemplate('/{origin}/{destination}/{departYYMMDD}/{returnYYMMDD}', { origin: 'DEL', destination: 'CDG', depart: '2026-12-01', return: '2026-12-10' })
    expect(u).toBe('/del/cdg/261201/261210')
  })
  it('defaults adults and rooms to 1 and leaves unknown placeholders empty', () => {
    expect(fillTemplate('a={adults}&r={rooms}&z={nope}', {})).toBe('a=1&r=1&z=')
  })
})

describe('buildLink', () => {
  it('uses a plain untracked link when no affiliate template is configured', () => {
    const l = buildLink('viator', { city: 'Paris' }, {})!
    expect(l.url).toBe('https://www.viator.com/searchResults/all?text=Paris')
    expect(l.affiliate).toBe(false)
  })

  it('prefers a configured affiliate template and flags it as affiliate', () => {
    const l = buildLink('viator', { city: 'Paris' }, { VITE_AFF_VIATOR_URL: 'https://tracked.test/go?pid=123&q={city}' })!
    expect(l.url).toBe('https://tracked.test/go?pid=123&q=Paris')
    expect(l.affiliate).toBe(true)
  })

  it('builds a Skyscanner search from route and dates', () => {
    const l = buildLink('skyscanner', { origin: 'DEL', destination: 'CDG', depart: '2026-12-01', return: '2026-12-10', adults: 2 }, {})!
    expect(l.url).toBe('https://www.skyscanner.net/transport/flights/del/cdg/261201/261210/?adultsv2=2')
  })

  it('tidies the path for a one-way Skyscanner search', () => {
    const l = buildLink('skyscanner', { origin: 'DEL', destination: 'CDG', depart: '2026-12-01' }, {})!
    expect(l.url).toBe('https://www.skyscanner.net/transport/flights/del/cdg/261201/?adultsv2=1')
  })

  it('returns null for partners that need an affiliate template (Stay22) until configured', () => {
    expect(buildLink('stay22', { city: 'Paris' }, {})).toBeNull()
    expect(buildLink('stay22', { city: 'Paris' }, { VITE_AFF_STAY22_URL: 'https://www.stay22.com/allez/booking?aid=x&address={city}' })).not.toBeNull()
  })

  it('refuses non-https templates', () => {
    expect(buildLink('agoda', {}, { VITE_AFF_AGODA_URL: 'javascript:alert(1)' })).toBeNull()
    expect(buildLink('agoda', {}, { VITE_AFF_AGODA_URL: 'http://insecure.test/' })).toBeNull()
  })
})

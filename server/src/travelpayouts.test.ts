// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { travelpayoutsFlights, parseTickets } from './integrations/travelpayouts.ts'

const q = { origin: 'DEL', destination: 'CDG', departDate: '2026-12-01', returnDate: '2026-12-10', adults: 2, children: 0, cabin: 'economy' as const }

// Shaped after the public API documentation (not captured from the live service).
const sample = {
  success: true,
  data: [
    { origin: 'DEL', destination: 'CDG', price: 420, airline: 'AF', departure_at: '2026-12-01T10:30:00+05:30', return_at: '2026-12-10T14:00:00+01:00', transfers: 0, return_transfers: 1, duration_to: 520, duration_back: 600, link: '/search/DEL0112CDG10121?t=abc' },
    { origin: 'DEL', destination: 'CDG', price: 390, airline: 'TK', departure_at: '2026-12-01T22:10:00+05:30', transfers: 1, duration: 760, link: 'https://evil.test/phish' },
  ],
}

afterEach(() => vi.unstubAllGlobals())

describe('parseTickets', () => {
  it('maps cached fares to offers, multiplying by passengers and marking unknown fare rules', () => {
    const r = parseTickets(sample, q, 'MARK1')
    expect(r.mode).toBe('live')
    expect(r.notice).toMatch(/Cached/)
    const o = r.offers[0]!
    expect(o.fares[0]!.price).toBe(840)
    expect(o.fares[0]!.refundable).toBeNull()
    expect(o.outbound.departAt).toBe('2026-12-01T10:30')
    expect(o.outbound.arriveAt).toBe('2026-12-01T19:10') // depart + 520 min, local arithmetic
    expect(o.inbound!.stops).toBe(1)
    expect(o.bookUrl).toBe('https://www.aviasales.com/search/DEL0112CDG10121?t=abc&marker=MARK1')
  })

  it('only accepts partner links on the expected host/path and never invents a one-way return', () => {
    const o = parseTickets(sample, q).offers[1]!
    expect(o.bookUrl).toBeUndefined()
    expect(o.inbound).toBeNull()
    expect(o.outbound.durationMin).toBe(760)
  })

  it('rejects an unexpected response shape', () => {
    expect(() => parseTickets({ nope: true }, q)).toThrow(/Unexpected response/)
  })
})

describe('travelpayoutsFlights', () => {
  it('calls the data API with the token and the validated query', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(sample), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const res = (await travelpayoutsFlights('TOKEN123', 'M').search(q)) as { offers: unknown[] }
    expect(res.offers).toHaveLength(2)
    const url = new URL(String(fetchMock.mock.calls[0]![0]))
    expect(url.host).toBe('api.travelpayouts.com')
    expect(url.searchParams.get('token')).toBe('TOKEN123')
    expect(url.searchParams.get('origin')).toBe('DEL')
    expect(url.searchParams.get('return_at')).toBe('2026-12-10')
  })

  it('rejects invalid queries before calling out', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(travelpayoutsFlights('T').search({ ...q, origin: 'delhi' })).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

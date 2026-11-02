import { clearHandoff, loadHandoff, saveHandoff } from './handoff'

const base = { kind: 'hotel' as const, title: 'Hotel Lumiere', startDate: '2026-12-01', endDate: '2026-12-05', partner: 'Booking.com' }

beforeEach(() => sessionStorage.clear())

describe('booking handoff', () => {
  it('round-trips a handoff and clears it', () => {
    saveHandoff(base, 1000)
    expect(loadHandoff(2000)).toEqual({ ...base, at: 1000 })
    clearHandoff()
    expect(loadHandoff(2000)).toBeNull()
  })

  it('expires after 24 hours and removes the stale entry', () => {
    saveHandoff(base, 0)
    expect(loadHandoff(24 * 60 * 60 * 1000 + 1)).toBeNull()
    expect(sessionStorage.getItem('tp.booking-handoff')).toBeNull()
  })

  it('rejects tampered or malformed data instead of trusting it', () => {
    for (const bad of [
      '{"kind":"car","title":"x","startDate":"2026-12-01","endDate":null,"partner":"p","at":1}',
      '{"kind":"hotel","title":"x","startDate":"soon","endDate":null,"partner":"p","at":1}',
      '{"kind":"hotel","title":5,"startDate":"2026-12-01","endDate":null,"partner":"p","at":1}',
      'not json',
    ]) {
      sessionStorage.setItem('tp.booking-handoff', bad)
      expect(loadHandoff(2)).toBeNull()
    }
  })

  it('never stores a confirmation reference or any status', () => {
    saveHandoff(base)
    const stored = JSON.parse(sessionStorage.getItem('tp.booking-handoff')!)
    expect(Object.keys(stored).sort()).toEqual(['at', 'endDate', 'kind', 'partner', 'startDate', 'title'])
  })
})

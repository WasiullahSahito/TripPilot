import { addDays, addMonths, dateOf, monthGrid, startOfWeek, timeOf, weekDays } from './dates'
import { buildIcs, fold } from './ics'

describe('calendar dates', () => {
  it('finds Monday as the start of the week', () => {
    expect(startOfWeek('2026-12-02')).toBe('2026-11-30') // Wednesday -> Monday
    expect(startOfWeek('2026-11-30')).toBe('2026-11-30')
    expect(startOfWeek('2026-12-06')).toBe('2026-11-30') // Sunday belongs to the previous Monday
  })

  it('builds a 6x7 month grid with correct in-month flags', () => {
    const g = monthGrid('2026-12-15')
    expect(g).toHaveLength(6)
    expect(g.every((w) => w.length === 7)).toBe(true)
    expect(g[0]![0]!.date).toBe('2026-11-30')
    expect(g.flat().filter((d) => d.inMonth)).toHaveLength(31)
    expect(g.flat().find((d) => d.date === '2026-12-01')!.inMonth).toBe(true)
  })

  it('adds days and months across boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-01')
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-01')
  })

  it('lists seven week days and splits date-times', () => {
    expect(weekDays('2026-12-02')).toHaveLength(7)
    expect(dateOf('2026-12-02T10:30')).toBe('2026-12-02')
    expect(timeOf('2026-12-02T10:30')).toBe('10:30')
  })
})

describe('ICS export', () => {
  const ev = { id: 'abc', title: 'Biometrics, Centre; A', startsAt: '2026-12-02T10:30', status: 'requested' as const, reminderDays: 3, description: 'Bring\npassport' }

  it('produces a valid, escaped calendar with CRLF endings', () => {
    const ics = buildIcs([ev], new Date('2026-10-01T00:00:00Z'))
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(ics).toContain('DTSTART:20261202T103000')
    expect(ics).toContain('DTEND:20261202T113000')
    expect(ics).toContain('SUMMARY:(Requested) Biometrics\\, Centre\\; A')
    expect(ics).toContain('STATUS:TENTATIVE')
    expect(ics).toContain('TRIGGER:-P3D')
    expect(ics).toContain('DESCRIPTION:Bring\\npassport')
  })

  it('marks only confirmed appointments as CONFIRMED with no prefix', () => {
    const ics = buildIcs([{ ...ev, status: 'confirmed', reminderDays: 0 }])
    expect(ics).toContain('STATUS:CONFIRMED')
    expect(ics).toContain('SUMMARY:Biometrics')
    expect(ics).not.toContain('VALARM')
  })

  it('rolls over midnight for DTEND', () => {
    const ics = buildIcs([{ ...ev, startsAt: '2026-12-31T23:30' }])
    expect(ics).toContain('DTEND:20270101T003000')
  })

  it('folds long lines at 75 octets', () => {
    const folded = fold('X:' + 'a'.repeat(200))
    for (const l of folded.split('\r\n')) expect(l.length).toBeLessThanOrEqual(75)
  })
})

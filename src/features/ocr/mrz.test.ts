import { candidateLines, checkDigit, looksLikeMrz, parseMrz } from './mrz'

// ICAO Doc 9303 specimen passport (fictional person "ANNA MARIA ERIKSSON" of "UTOPIA").
const L1 = 'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<'
const L2 = 'L898902C36UTO7408122F1204159ZE184226B<<<<<10'
const NOW = new Date('2026-10-16T00:00:00Z')

describe('checkDigit', () => {
  it('matches the ICAO specimen values', () => {
    expect(checkDigit('L898902C3')).toBe(6)
    expect(checkDigit('740812')).toBe(2)
    expect(checkDigit('120415')).toBe(9)
    expect(checkDigit('ZE184226B<<<<<')).toBe(1)
  })
  it('returns -1 for illegal characters', () => {
    expect(checkDigit('AB-1')).toBe(-1)
  })
})

describe('parseMrz', () => {
  it('parses the specimen and verifies every check digit', () => {
    const p = parseMrz(`${L1}\n${L2}`, NOW)!
    expect(p.surname).toBe('ERIKSSON')
    expect(p.givenNames).toBe('ANNA MARIA')
    expect(p.passportNumber).toBe('L898902C3')
    expect(p.issuingCountry).toBe('UTO')
    expect(p.nationality).toBe('UTO')
    expect(p.dateOfBirth).toBe('1974-08-12')
    expect(p.expiryDate).toBe('2012-04-15')
    expect(p.sex).toBe('F')
    expect(p.checks).toEqual({ passportNumber: true, dateOfBirth: true, expiryDate: true, composite: true })
    expect(p.allChecksPass).toBe(true)
  })

  it('tolerates OCR noise around the zone and look-alike glyphs in numeric fields', () => {
    const noisy = `PASSPORT\nSome header text\n${L1}\n${L2.replace('7408122', '74O8I22')}\nfooter`
    const p = parseMrz(noisy, NOW)!
    expect(p.dateOfBirth).toBe('1974-08-12')
    expect(p.checks.dateOfBirth).toBe(true)
  })

  it('flags a corrupted check digit instead of trusting the data', () => {
    const bad = L2.replace('L898902C36', 'L898902C37')
    const p = parseMrz(`${L1}\n${bad}`, NOW)!
    expect(p.checks.passportNumber).toBe(false)
    expect(p.checks.composite).toBe(false)
    expect(p.allChecksPass).toBe(false)
  })

  it('does not place a birth date in the future', () => {
    const p = parseMrz(`${L1}\n${L2.replace('7408122', '2608122')}`, NOW)!
    expect(p.dateOfBirth).toBe('2026-08-12')
    const q = parseMrz(`${L1}\n${L2.replace('7408122', '2708122')}`, NOW)!
    expect(q.dateOfBirth).toBe('1927-08-12')
  })

  it('rejects an impossible date rather than guessing', () => {
    const p = parseMrz(`${L1}\n${L2.replace('7408122', '7413322')}`, NOW)!
    expect(p.dateOfBirth).toBeNull()
  })

  it('returns null when there is no MRZ', () => {
    expect(parseMrz('just some text\nnothing here', NOW)).toBeNull()
    expect(parseMrz('', NOW)).toBeNull()
  })

  it('handles « as a filler glyph and short lines padded with fillers', () => {
    const p = parseMrz(`${L1.replace(/</g, '«')}\n${L2}`, NOW)!
    expect(p.surname).toBe('ERIKSSON')
  })
})

describe('looksLikeMrz / candidateLines', () => {
  it('detects an MRZ but not ordinary text', () => {
    expect(looksLikeMrz(`${L1}\n${L2}`)).toBe(true)
    expect(looksLikeMrz('Dear consulate, I would like to request a visa for my trip.')).toBe(false)
  })
  it('keeps only long candidate lines', () => {
    expect(candidateLines('short\n' + L1)).toHaveLength(1)
  })
})

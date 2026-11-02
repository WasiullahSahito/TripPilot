import { tripSearchSchema, toVisaQuery } from './search-schema'

const valid = { destination: 'France', nationality: 'India', departure: '2026-12-01', returnDate: '2026-12-10', purpose: 'Tourism' as const }

describe('tripSearchSchema', () => {
  it('accepts a valid search', () => {
    expect(tripSearchSchema.safeParse(valid).success).toBe(true)
  })
  it('rejects a return date before departure', () => {
    const r = tripSearchSchema.safeParse({ ...valid, returnDate: '2026-11-01' })
    expect(r.success).toBe(false)
  })
  it('rejects an empty destination', () => {
    expect(tripSearchSchema.safeParse({ ...valid, destination: ' ' }).success).toBe(false)
  })
  it('builds an encoded query string', () => {
    expect(toVisaQuery({ ...valid, destination: 'Côte d’Ivoire' })).toContain('destination=C%C3%B4te')
  })
})

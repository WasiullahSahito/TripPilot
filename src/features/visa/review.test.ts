import { destinations } from './destinations'
import { reviewProblems, reviews, reviewStatus, REVIEW_MAX_AGE_DAYS, type DestinationReview } from './review'

const today = '2027-06-01'
const good: DestinationReview = { lastReviewed: '2027-05-01', reviewedBy: 'A. Reviewer', sources: ['https://example.gov/visa'] }

describe('reviewStatus', () => {
  it('says plainly when nothing has been reviewed', () => {
    const s = reviewStatus(undefined, today)
    expect(s).toMatchObject({ state: 'unreviewed', ageDays: null })
    expect(s.label).toMatch(/Not yet reviewed/)
  })

  it('is current within the window, stale after it, and exact at the boundary', () => {
    expect(reviewStatus(good, today)).toMatchObject({ state: 'current', ageDays: 31 })
    const edge = new Date(Date.UTC(2027, 5, 1) - REVIEW_MAX_AGE_DAYS * 86_400_000).toISOString().slice(0, 10)
    expect(reviewStatus({ ...good, lastReviewed: edge }, today).state).toBe('current')
    const over = new Date(Date.UTC(2027, 5, 1) - (REVIEW_MAX_AGE_DAYS + 1) * 86_400_000).toISOString().slice(0, 10)
    const stale = reviewStatus({ ...good, lastReviewed: over }, today)
    expect(stale.state).toBe('stale')
    expect(stale.label).toMatch(/may be out of date/)
  })

  it('names the reviewer in the label', () => {
    expect(reviewStatus(good, today).label).toContain('A. Reviewer')
  })
})

describe('reviewProblems', () => {
  it('accepts a complete record', () => {
    expect(reviewProblems('france', good, today)).toEqual([])
  })
  it('rejects bad dates, future dates, missing reviewer, missing or insecure sources', () => {
    expect(reviewProblems('x', { ...good, lastReviewed: '2027-13-45' }, today).join()).toMatch(/real YYYY-MM-DD/)
    expect(reviewProblems('x', { ...good, lastReviewed: '2028-01-01' }, today).join()).toMatch(/future/)
    expect(reviewProblems('x', { ...good, reviewedBy: '  ' }, today).join()).toMatch(/reviewedBy/)
    expect(reviewProblems('x', { ...good, sources: [] }, today).join()).toMatch(/official pages/)
    expect(reviewProblems('x', { ...good, sources: ['http://insecure.test'] }, today).join()).toMatch(/https/)
  })
})

describe('the shipped review data', () => {
  const ids = new Set(destinations.map((d) => d.id))
  it('refers only to destinations that exist, and every record is complete', () => {
    const now = new Date().toISOString().slice(0, 10)
    for (const [id, r] of Object.entries(reviews)) {
      expect(ids.has(id), `unknown destination ${id}`).toBe(true)
      expect(reviewProblems(id, r, now)).toEqual([])
    }
  })

  it('every destination has an official https link to compare against', () => {
    for (const d of destinations) {
      expect(d.officialLinks.length, d.id).toBeGreaterThan(0)
      for (const l of d.officialLinks) expect(l.url, `${d.id} ${l.label}`).toMatch(/^https:\/\//)
    }
  })
})

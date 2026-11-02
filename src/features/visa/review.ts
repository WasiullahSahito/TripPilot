/**
 * Review sign-offs for destination guidance. A destination is "reviewed" only when a named person has compared its
 * checklist and notes with the official sources and recorded it here. Nothing in this repository has been reviewed
 * by a person yet, so `reviews` is deliberately empty and every destination shows as "not yet reviewed".
 * See docs/DESTINATION_REVIEW.md for the procedure.
 */
export interface DestinationReview {
  /** YYYY-MM-DD: the day the comparison with the official sources was done. */
  lastReviewed: string
  reviewedBy: string
  /** The official pages the guidance was compared with (https URLs). */
  sources: string[]
  notes?: string
}

/** Government rules change often: a review older than this is shown as stale. */
export const REVIEW_MAX_AGE_DAYS = 90

/** destination id -> its latest review. Add an entry only after a real review. */
export const reviews: Record<string, DestinationReview> = {}

export type ReviewState = 'unreviewed' | 'current' | 'stale'

export interface ReviewStatus {
  state: ReviewState
  label: string
  ageDays: number | null
}

const day = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000

export function reviewStatus(review: DestinationReview | undefined, today: string): ReviewStatus {
  if (!review) {
    return {
      state: 'unreviewed',
      ageDays: null,
      label: 'Not yet reviewed by a person against the official sources. Treat this checklist as a starting point and confirm everything on the official site.',
    }
  }
  const ageDays = Math.max(0, Math.round(day(today) - day(review.lastReviewed)))
  if (ageDays > REVIEW_MAX_AGE_DAYS) {
    return { state: 'stale', ageDays, label: `Last reviewed ${review.lastReviewed} by ${review.reviewedBy} (${ageDays} days ago). Rules change often, so this may be out of date.` }
  }
  return { state: 'current', ageDays, label: `Reviewed ${review.lastReviewed} by ${review.reviewedBy} against the official sources listed below. Still confirm on the official site before you apply.` }
}

/** Problems with a review record, for the data test and for anyone editing the file. */
export function reviewProblems(id: string, r: DestinationReview, today: string): string[] {
  const out: string[] = []
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.lastReviewed) || Number.isNaN(Date.parse(r.lastReviewed))) out.push(`${id}: lastReviewed must be a real YYYY-MM-DD date`)
  else if (r.lastReviewed > today) out.push(`${id}: lastReviewed is in the future`)
  if (!r.reviewedBy.trim()) out.push(`${id}: reviewedBy must name the person`)
  if (r.sources.length === 0) out.push(`${id}: list the official pages that were compared`)
  for (const s of r.sources) if (!/^https:\/\//.test(s)) out.push(`${id}: source "${s}" must be an https URL`)
  return out
}

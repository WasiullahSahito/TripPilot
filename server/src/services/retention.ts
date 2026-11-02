import type { Store } from '../models/store.ts'
import type { BlobStore } from './blobs.ts'
import { audit } from './audit.ts'
import { decryptJson } from './crypto.ts'

/** Retention periods a user can choose. Anything else is rejected. */
export const RETENTION_CHOICES = [30, 60, 90, 180, 365] as const

const DAY_MS = 86_400_000
const isoDay = (d: Date) => d.toISOString().slice(0, 10)
const dayNumber = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / DAY_MS
const validDay = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s)

export interface RetentionReport {
  users: number
  documentsDeleted: number
  failures: number
  /** Abandoned direct uploads (never finalized, older than a day) that were removed. */
  pendingSwept?: number
}

/**
 * Deletes uploaded files that have outlived the owner's chosen retention period. Only users who opted in are
 * touched. A file's clock starts on the date of the thing it belongs to:
 *  - booking: its end date (or start date), appointment: its date,
 *  - visa application: the departure date entered on the form (else the day it was last saved),
 *  - anything whose owner no longer exists: the day it was uploaded.
 * The file is removed from storage before its record, so a storage failure leaves the record to be retried next
 * run instead of leaving an untracked file behind.
 */
export async function runRetention(store: Store, blobs: BlobStore, now = new Date()): Promise<RetentionReport> {
  const report: RetentionReport = { users: 0, documentsDeleted: 0, failures: 0 }
  const today = dayNumber(isoDay(now))

  for (const profile of await store.listRetentionProfiles()) {
    const days = profile.retentionDays
    if (typeof days !== 'number' || days < 1) continue
    const userId = profile.userId
    const docs = await store.listDocuments(userId)
    if (docs.length === 0) continue

    const anchors = new Map<string, string>()
    for (const a of await store.listApplications(userId)) {
      let day = a.updatedAt.slice(0, 10)
      try {
        const data = decryptJson<Record<string, Record<string, string>>>(a.dataEnc)
        const dep = data.travel?.departureDate
        if (validDay(dep)) day = dep.slice(0, 10)
      } catch {
        /* unreadable data: fall back to the last-saved date */
      }
      anchors.set(a.id, day)
    }
    for (const b of await store.listBookings(userId)) anchors.set(b.id, b.endDate ?? b.startDate)
    for (const ap of await store.listAppointments(userId)) anchors.set(ap.id, ap.startsAt.slice(0, 10))

    let deleted = 0
    for (const doc of docs) {
      const anchor = anchors.get(doc.applicationId) ?? doc.uploadedAt.slice(0, 10)
      if (!validDay(anchor) || today - dayNumber(anchor.slice(0, 10)) <= days) continue
      try {
        await blobs.remove(userId, doc.id)
        await store.deleteDocument(userId, doc.id)
        deleted++
      } catch {
        report.failures++
      }
    }
    if (deleted > 0) {
      report.users++
      report.documentsDeleted += deleted
      await audit(store, { actorId: null, action: 'retention.deleted_files', targetId: userId, meta: { documents: deleted, afterDays: days } })
    }
  }
  // Uploads that were started but never finished leave a file in the pending area: clear anything older than a day.
  if (blobs.direct) {
    try {
      const swept = await blobs.direct.sweep(24 * 60 * 60 * 1000)
      if (swept > 0) report.pendingSwept = swept
    } catch {
      report.failures++
    }
  }
  return report
}

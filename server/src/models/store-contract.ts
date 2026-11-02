import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { Store } from './store.ts'
import type { Appointment, AuditEntry, Booking, Expense, StoredDocument, Trip, User, VisaApplication } from './types.ts'

const now = () => new Date().toISOString()

const user = (over: Partial<User> = {}): User => ({
  id: randomUUID(), email: `${randomUUID()}@example.com`, name: 'Test', passwordHash: 'hash', role: 'user',
  emailVerifiedAt: null, verifyToken: randomUUID(), createdAt: now(), ...over,
})

/** Behaviour every Store implementation must satisfy (JSON file store and Supabase alike). */
export function storeContract(name: string, make: () => Store, opts: { skip?: boolean } = {}) {
  describe.skipIf(opts.skip)(`Store contract: ${name}`, () => {
    it('finds users by id, email (case-insensitive) and verify token', async () => {
      const store = make()
      const u = user({ email: `${randomUUID()}@Example.com`.toLowerCase() })
      await store.saveUser(u)
      expect((await store.findUserById(u.id))?.email).toBe(u.email)
      expect((await store.findUserByEmail(u.email.toUpperCase()))?.id).toBe(u.id)
      expect((await store.findUserByVerifyToken(u.verifyToken!))?.id).toBe(u.id)
      await store.saveUser({ ...u, emailVerifiedAt: now(), verifyToken: null })
      expect((await store.findUserById(u.id))?.verifyToken).toBeNull()
      await store.deleteUserData(u.id)
    })

    it('stores trips per user, ordered by departure, and isolates users', async () => {
      const store = make()
      const a = user(), b = user()
      await store.saveUser(a)
      await store.saveUser(b)
      const trip = (departOn: string): Trip => ({
        id: randomUUID(), userId: a.id, destination: 'France', departOn, returnOn: '2027-12-31', purpose: 'Tourism', budget: 1200.5,
        status: 'planning', createdAt: now(),
      })
      await store.saveTrip(trip('2027-06-01'))
      await store.saveTrip(trip('2027-02-01'))
      const list = await store.listTrips(a.id)
      expect(list.map((t) => t.departOn)).toEqual(['2027-02-01', '2027-06-01'])
      expect(list[0]!.budget).toBe(1200.5)
      expect(await store.listTrips(b.id)).toEqual([])
      expect(await store.deleteTrip(b.id, list[0]!.id)).toBe(false)
      expect(await store.deleteTrip(a.id, list[0]!.id)).toBe(true)
      await store.deleteUserData(a.id)
      await store.deleteUserData(b.id)
    })

    it('upserts applications and removes their documents with them', async () => {
      const store = make()
      const u = user()
      await store.saveUser(u)
      const app: VisaApplication = {
        id: randomUUID(), userId: u.id, destinationId: 'france', categoryId: 'tourism', nationality: 'India', residence: 'India',
        status: 'draft', checklist: { passport: true }, dataEnc: 'v1.x.y.z', createdAt: now(), updatedAt: now(),
      }
      await store.saveApplication(app)
      await store.saveApplication({ ...app, status: 'ready' })
      expect((await store.listApplications(u.id))).toHaveLength(1)
      expect((await store.getApplication(u.id, app.id))?.status).toBe('ready')
      expect((await store.getApplication(u.id, app.id))?.checklist).toEqual({ passport: true })

      const doc: StoredDocument = { id: randomUUID(), userId: u.id, applicationId: app.id, itemId: 'passport', filename: 'p.pdf', mime: 'application/pdf', size: 10, uploadedAt: now() }
      await store.saveDocument(doc)
      expect(await store.listDocuments(u.id, app.id)).toHaveLength(1)
      expect(await store.deleteApplication(u.id, app.id)).toBe(true)
      expect(await store.listDocuments(u.id)).toHaveLength(0)
      await store.deleteUserData(u.id)
    })

    it('stores bookings and appointments and returns them in date order', async () => {
      const store = make()
      const u = user()
      await store.saveUser(u)
      const booking = (startDate: string): Booking => ({
        id: randomUUID(), userId: u.id, kind: 'hotel', status: 'sample', source: 'demo', title: 'Sample stay', startDate, endDate: null,
        confirmationRef: null, details: { nights: 3 }, createdAt: now(),
      })
      await store.saveBooking(booking('2027-05-01'))
      await store.saveBooking(booking('2027-03-01'))
      const bookings = await store.listBookings(u.id)
      expect(bookings.map((b) => b.startDate)).toEqual(['2027-03-01', '2027-05-01'])
      expect(bookings[0]!.details).toEqual({ nights: 3 })
      expect(bookings[0]!.endDate).toBeNull()

      const appt = (startsAt: string): Appointment => ({
        id: randomUUID(), userId: u.id, destinationId: 'france', center: 'Centre', type: 'visa', startsAt, preferredTimes: '', status: 'requested',
        officialRef: null, reminderDays: 1, notes: '', checklist: {}, createdAt: now(),
      })
      await store.saveAppointment(appt('2027-03-02T10:30'))
      await store.saveAppointment(appt('2027-03-01T09:00'))
      expect((await store.listAppointments(u.id)).map((a) => a.startsAt)).toEqual(['2027-03-01T09:00', '2027-03-02T10:30'])
      await store.deleteUserData(u.id)
    })

    it('deleteUserData removes every record belonging to the user and nothing else', async () => {
      const store = make()
      const a = user(), b = user()
      await store.saveUser(a)
      await store.saveUser(b)
      await store.saveTrip({ id: randomUUID(), userId: a.id, destination: 'X', departOn: '2027-01-01', returnOn: '2027-01-02', purpose: 'p', budget: null, status: 'planning', createdAt: now() })
      await store.saveTrip({ id: randomUUID(), userId: b.id, destination: 'Y', departOn: '2027-01-01', returnOn: '2027-01-02', purpose: 'p', budget: null, status: 'planning', createdAt: now() })
      await store.deleteUserData(a.id)
      expect(await store.findUserById(a.id)).toBeUndefined()
      expect(await store.listTrips(a.id)).toEqual([])
      expect(await store.listTrips(b.id)).toHaveLength(1)
      await store.deleteUserData(b.id)
    })

    it('reports aggregate statistics by status', async () => {
      const store = make()
      const before = await store.stats()
      const u = user()
      await store.saveUser(u)
      await store.saveBooking({ id: randomUUID(), userId: u.id, kind: 'flight', status: 'sample', source: 'demo', title: 't', startDate: '2027-01-01', endDate: null, confirmationRef: null, details: {}, createdAt: now() })
      await store.saveAppointment({ id: randomUUID(), userId: u.id, destinationId: '', center: 'c', type: 'visa', startsAt: '2027-01-01T10:00', preferredTimes: '', status: 'pending', officialRef: null, reminderDays: 0, notes: '', checklist: {}, createdAt: now() })
      const after = await store.stats()
      expect(after.users).toBe(before.users + 1)
      expect(after.bookings.sample).toBe(before.bookings.sample! + 1)
      expect(after.appointments.pending).toBe(before.appointments.pending! + 1)
      expect(Object.keys(after.applications)).toEqual(['draft', 'ready', 'submitted_on_portal'])
      await store.deleteUserData(u.id)
    })

    it('stores expenses, lists newest first, and unlinks them (does not delete them) when their trip is deleted', async () => {
      const store = make()
      const u = user()
      await store.saveUser(u)
      const trip: Trip = { id: randomUUID(), userId: u.id, destination: 'X', departOn: '2027-01-01', returnOn: '2027-01-02', purpose: 'p', budget: 500, status: 'planning', createdAt: now() }
      await store.saveTrip(trip)
      const expense = (spentOn: string, tripId: string | null): Expense => ({ id: randomUUID(), userId: u.id, tripId, category: 'food', description: 'd', amount: 12.34, currency: 'EUR', spentOn, status: 'paid', createdAt: now() })
      const older = expense('2027-01-01', trip.id)
      await store.saveExpense(older)
      await store.saveExpense(expense('2027-01-05', null))
      const all = await store.listExpenses(u.id)
      expect(all.map((e) => e.spentOn)).toEqual(['2027-01-05', '2027-01-01'])
      expect(all[1]!.amount).toBe(12.34)
      expect(await store.listExpenses(u.id, trip.id)).toHaveLength(1)
      await store.deleteTrip(u.id, trip.id)
      const afterDelete = await store.listExpenses(u.id)
      expect(afterDelete).toHaveLength(2)
      expect(afterDelete.every((e) => e.tripId === null)).toBe(true)
      expect(await store.deleteExpense(u.id, older.id)).toBe(true)
      await store.deleteUserData(u.id)
      expect(await store.listExpenses(u.id)).toEqual([])
    })

    it('lists users with search and paging, newest first, and finds several by id', async () => {
      const store = make()
      const tag = randomUUID().slice(0, 8)
      const mk = (name: string, createdAt: string) => user({ name: `${name} ${tag}`, email: `${name.toLowerCase()}.${tag}@example.com`, createdAt })
      const a = mk('Alpha', '2027-01-01T00:00:00.000Z')
      const b = mk('Bravo', '2027-02-01T00:00:00.000Z')
      for (const u of [a, b]) await store.saveUser(u)
      const found = await store.listUsers({ query: tag, limit: 10, offset: 0 })
      expect(found.total).toBe(2)
      expect(found.users.map((u) => u.id)).toEqual([b.id, a.id])
      expect((await store.listUsers({ query: `bravo.${tag}`, limit: 10, offset: 0 })).users.map((u) => u.id)).toEqual([b.id])
      expect((await store.listUsers({ query: tag, limit: 1, offset: 1 })).users.map((u) => u.id)).toEqual([a.id])
      // search text is user input: filter-syntax characters must not break or widen the query
      expect((await store.listUsers({ query: `${tag}),email.ilike.%`, limit: 10, offset: 0 })).total).toBeLessThanOrEqual(2)
      expect((await store.findUsersByIds([a.id, b.id, randomUUID()])).map((u) => u.id).sort()).toEqual([a.id, b.id].sort())
      expect(await store.findUsersByIds([])).toEqual([])
      await store.deleteUserData(a.id)
      await store.deleteUserData(b.id)
    })

    it('persists the disabled flag', async () => {
      const store = make()
      const u = user()
      await store.saveUser(u)
      expect((await store.findUserById(u.id))?.disabledAt ?? null).toBeNull()
      const at = new Date().toISOString()
      await store.saveUser({ ...u, disabledAt: at })
      expect(typeof (await store.findUserById(u.id))?.disabledAt).toBe('string')
      await store.saveUser({ ...u, disabledAt: null })
      expect((await store.findUserById(u.id))?.disabledAt ?? null).toBeNull()
      await store.deleteUserData(u.id)
    })

    it('stores audit entries, newest first, filterable by action, surviving user deletion', async () => {
      const store = make()
      const u = user()
      await store.saveUser(u)
      const action = `test.${randomUUID().slice(0, 8)}`
      const entry = (at: string, actorId: string | null): AuditEntry => ({ id: randomUUID(), at, actorId, action, targetId: u.id, meta: { n: 1, flag: true, note: 'x' } })
      await store.addAudit(entry('2027-01-01T00:00:00.000Z', u.id))
      await store.addAudit(entry('2027-01-02T00:00:00.000Z', null))
      const list = await store.listAudit({ limit: 10, offset: 0, action })
      expect(list.map((e) => e.at)).toEqual(['2027-01-02T00:00:00.000Z', '2027-01-01T00:00:00.000Z'])
      expect(list[0]!.actorId).toBeNull()
      expect(list[1]!.meta).toEqual({ n: 1, flag: true, note: 'x' })
      expect(await store.listAudit({ limit: 1, offset: 1, action })).toHaveLength(1)
      await store.deleteUserData(u.id)
      expect(await store.listAudit({ limit: 10, offset: 0, action })).toHaveLength(2)
    })

    it('lists only profiles that opted in to retention', async () => {
      const store = make()
      const a = user(), b = user()
      await store.saveUser(a)
      await store.saveUser(b)
      const profile = (userId: string, retentionDays: number | null) => ({ userId, nationality: '', residenceCountry: '', homeAirport: '', interests: [], onboardedAt: null, retentionDays })
      await store.saveProfile(profile(a.id, 60))
      await store.saveProfile(profile(b.id, null))
      const ids = (await store.listRetentionProfiles()).map((p) => p.userId)
      expect(ids).toContain(a.id)
      expect(ids).not.toContain(b.id)
      expect((await store.getProfile(a.id))?.retentionDays).toBe(60)
      await store.deleteUserData(a.id)
      await store.deleteUserData(b.id)
    })
  })
}

import type { SupabaseClient } from '@supabase/supabase-js'
import { DatabaseError } from './database-error.ts'
import type { Store, StoreStats } from './store.ts'
import type { Appointment, AuditEntry, Booking, Expense, Profile, StoredDocument, Trip, User, VisaApplication } from './types.ts'

/**
 * PostgreSQL (Supabase) implementation of Store. The server connects with the service-role key, which
 * never leaves the server; row-level security is enabled on every table with no public policies, so the
 * anon/public API cannot read anything.
 */

type Row = Record<string, unknown>

function ok<T>(res: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (res.error) throw new DatabaseError(res.error.message, res.error.code ?? null)
  return res.data as T
}

const s = (v: unknown) => v as string
const sn = (v: unknown) => (v === null || v === undefined ? null : (v as string))

const userFrom = (r: Row): User => ({
  id: s(r.id), email: s(r.email), name: s(r.name), passwordHash: s(r.password_hash), role: r.role as User['role'],
  emailVerifiedAt: sn(r.email_verified_at), verifyToken: sn(r.verify_token), disabledAt: sn(r.disabled_at), createdAt: s(r.created_at),
})
const userTo = (u: User): Row => ({
  id: u.id, email: u.email, name: u.name, password_hash: u.passwordHash, role: u.role,
  email_verified_at: u.emailVerifiedAt, verify_token: u.verifyToken, disabled_at: u.disabledAt ?? null, created_at: u.createdAt,
})

const profileFrom = (r: Row): Profile => ({
  userId: s(r.user_id), nationality: s(r.nationality), residenceCountry: s(r.residence_country), homeAirport: s(r.home_airport),
  interests: (r.interests as string[]) ?? [], onboardedAt: sn(r.onboarded_at),
  retentionDays: r.retention_days === null || r.retention_days === undefined ? null : Number(r.retention_days),
})
const profileTo = (p: Profile): Row => ({
  user_id: p.userId, nationality: p.nationality, residence_country: p.residenceCountry, home_airport: p.homeAirport,
  interests: p.interests, onboarded_at: p.onboardedAt, retention_days: p.retentionDays ?? null,
})

const tripFrom = (r: Row): Trip => ({
  id: s(r.id), userId: s(r.user_id), destination: s(r.destination), departOn: s(r.depart_on), returnOn: s(r.return_on),
  purpose: s(r.purpose), budget: r.budget === null || r.budget === undefined ? null : Number(r.budget),
  status: r.status as Trip['status'], createdAt: s(r.created_at),
})
const tripTo = (t: Trip): Row => ({
  id: t.id, user_id: t.userId, destination: t.destination, depart_on: t.departOn, return_on: t.returnOn, purpose: t.purpose,
  budget: t.budget, status: t.status, created_at: t.createdAt,
})

const appFrom = (r: Row): VisaApplication => ({
  id: s(r.id), userId: s(r.user_id), destinationId: s(r.destination_id), categoryId: s(r.category_id), nationality: s(r.nationality),
  residence: s(r.residence), status: r.status as VisaApplication['status'], checklist: (r.checklist as Record<string, boolean>) ?? {},
  dataEnc: s(r.data_enc), createdAt: s(r.created_at), updatedAt: s(r.updated_at),
})
const appTo = (a: VisaApplication): Row => ({
  id: a.id, user_id: a.userId, destination_id: a.destinationId, category_id: a.categoryId, nationality: a.nationality,
  residence: a.residence, status: a.status, checklist: a.checklist, data_enc: a.dataEnc, created_at: a.createdAt, updated_at: a.updatedAt,
})

const docFrom = (r: Row): StoredDocument => ({
  id: s(r.id), userId: s(r.user_id), applicationId: s(r.owner_id), itemId: s(r.item_id), filename: s(r.filename),
  mime: s(r.mime), size: Number(r.size), uploadedAt: s(r.uploaded_at),
})
const docTo = (d: StoredDocument): Row => ({
  id: d.id, user_id: d.userId, owner_id: d.applicationId, item_id: d.itemId, filename: d.filename, mime: d.mime, size: d.size,
  uploaded_at: d.uploadedAt,
})

const bookingFrom = (r: Row): Booking => ({
  id: s(r.id), userId: s(r.user_id), kind: r.kind as Booking['kind'], status: r.status as Booking['status'],
  source: r.source as Booking['source'], title: s(r.title), startDate: s(r.start_date), endDate: sn(r.end_date),
  confirmationRef: sn(r.confirmation_ref), details: (r.details as Booking['details']) ?? {}, createdAt: s(r.created_at),
})
const bookingTo = (b: Booking): Row => ({
  id: b.id, user_id: b.userId, kind: b.kind, status: b.status, source: b.source, title: b.title, start_date: b.startDate,
  end_date: b.endDate, confirmation_ref: b.confirmationRef, details: b.details, created_at: b.createdAt,
})

const apptFrom = (r: Row): Appointment => ({
  id: s(r.id), userId: s(r.user_id), destinationId: s(r.destination_id), center: s(r.center), type: r.type as Appointment['type'],
  startsAt: s(r.starts_at), preferredTimes: s(r.preferred_times), status: r.status as Appointment['status'],
  officialRef: sn(r.official_ref), reminderDays: Number(r.reminder_days), notes: s(r.notes),
  checklist: (r.checklist as Record<string, boolean>) ?? {}, createdAt: s(r.created_at),
})
const apptTo = (a: Appointment): Row => ({
  id: a.id, user_id: a.userId, destination_id: a.destinationId, center: a.center, type: a.type, starts_at: a.startsAt,
  preferred_times: a.preferredTimes, status: a.status, official_ref: a.officialRef, reminder_days: a.reminderDays,
  notes: a.notes, checklist: a.checklist, created_at: a.createdAt,
})

const auditFrom = (r: Row): AuditEntry => ({
  // Postgres returns +00:00; normalise to the same ISO form the local store uses so both behave identically.
  id: s(r.id), at: new Date(s(r.at)).toISOString(), actorId: sn(r.actor_id), action: s(r.action), targetId: sn(r.target_id), meta: (r.meta as AuditEntry['meta']) ?? {},
})

const expenseFrom = (r: Row): Expense => ({
  id: s(r.id), userId: s(r.user_id), tripId: sn(r.trip_id), category: s(r.category), description: s(r.description),
  amount: Number(r.amount), currency: s(r.currency), spentOn: s(r.spent_on), status: r.status as Expense['status'], createdAt: s(r.created_at),
})
const expenseTo = (e: Expense): Row => ({
  id: e.id, user_id: e.userId, trip_id: e.tripId, category: e.category, description: e.description, amount: e.amount,
  currency: e.currency, spent_on: e.spentOn, status: e.status, created_at: e.createdAt,
})

export class SupabaseStore implements Store {
  private readonly db: SupabaseClient
  constructor(client: SupabaseClient) {
    this.db = client
  }

  private async one<T>(table: string, match: Record<string, string>, from: (r: Row) => T): Promise<T | undefined> {
    const rows = ok(await this.db.from(table).select('*').match(match).limit(1)) as Row[]
    return rows[0] ? from(rows[0]) : undefined
  }
  private async many<T>(table: string, match: Record<string, string>, from: (r: Row) => T, order?: { col: string; asc: boolean }): Promise<T[]> {
    let q = this.db.from(table).select('*').match(match)
    if (order) q = q.order(order.col, { ascending: order.asc })
    return (ok(await q) as Row[]).map(from)
  }
  private async upsert(table: string, row: Row, onConflict = 'id') {
    ok(await this.db.from(table).upsert(row, { onConflict }).select('*'))
  }
  private async remove(table: string, match: Record<string, string>): Promise<boolean> {
    const rows = ok(await this.db.from(table).delete().match(match).select('*')) as Row[]
    return rows.length > 0
  }

  findUserByEmail = (email: string) => this.one('users', { email: email.toLowerCase() }, userFrom)
  findUserById = (id: string) => this.one('users', { id }, userFrom)
  findUserByVerifyToken = (token: string) => this.one('users', { verify_token: token }, userFrom)
  saveUser = (u: User) => this.upsert('users', userTo(u))
  async countUsers() {
    // A normal select (not HEAD): HEAD requests report no error when the table is missing.
    const res = await this.db.from('users').select('id', { count: 'exact' }).limit(1)
    if (res.error) throw new DatabaseError(res.error.message, res.error.code ?? null)
    return res.count ?? 0
  }

  getProfile = (userId: string) => this.one('profiles', { user_id: userId }, profileFrom)
  saveProfile = (p: Profile) => this.upsert('profiles', profileTo(p), 'user_id')

  listTrips = (userId: string) => this.many('trips', { user_id: userId }, tripFrom, { col: 'depart_on', asc: true })
  getTrip = (userId: string, id: string) => this.one('trips', { user_id: userId, id }, tripFrom)
  saveTrip = (t: Trip) => this.upsert('trips', tripTo(t))
  deleteTrip = (userId: string, id: string) => this.remove('trips', { user_id: userId, id })

  listApplications = (userId: string) => this.many('visa_applications', { user_id: userId }, appFrom, { col: 'updated_at', asc: false })
  getApplication = (userId: string, id: string) => this.one('visa_applications', { user_id: userId, id }, appFrom)
  saveApplication = (a: VisaApplication) => this.upsert('visa_applications', appTo(a))
  async deleteApplication(userId: string, id: string) {
    const removed = await this.remove('visa_applications', { user_id: userId, id })
    if (removed) await this.remove('documents', { user_id: userId, owner_id: id })
    return removed
  }

  listDocuments(userId: string, ownerId?: string) {
    return this.many('documents', ownerId ? { user_id: userId, owner_id: ownerId } : { user_id: userId }, docFrom)
  }
  getDocument = (userId: string, id: string) => this.one('documents', { user_id: userId, id }, docFrom)
  saveDocument = (d: StoredDocument) => this.upsert('documents', docTo(d))
  deleteDocument = (userId: string, id: string) => this.remove('documents', { user_id: userId, id })

  listBookings = (userId: string) => this.many('bookings', { user_id: userId }, bookingFrom, { col: 'start_date', asc: true })
  getBooking = (userId: string, id: string) => this.one('bookings', { user_id: userId, id }, bookingFrom)
  saveBooking = (b: Booking) => this.upsert('bookings', bookingTo(b))
  deleteBooking = (userId: string, id: string) => this.remove('bookings', { user_id: userId, id })

  listAppointments = (userId: string) => this.many('appointments', { user_id: userId }, apptFrom, { col: 'starts_at', asc: true })
  getAppointment = (userId: string, id: string) => this.one('appointments', { user_id: userId, id }, apptFrom)
  saveAppointment = (a: Appointment) => this.upsert('appointments', apptTo(a))
  deleteAppointment = (userId: string, id: string) => this.remove('appointments', { user_id: userId, id })

  async listExpenses(userId: string, tripId?: string) {
    const rows = await this.many('expenses', tripId === undefined ? { user_id: userId } : { user_id: userId, trip_id: tripId }, expenseFrom)
    return rows.sort((a, b) => b.spentOn.localeCompare(a.spentOn) || b.createdAt.localeCompare(a.createdAt))
  }
  getExpense = (userId: string, id: string) => this.one('expenses', { user_id: userId, id }, expenseFrom)
  saveExpense = (e: Expense) => this.upsert('expenses', expenseTo(e))
  deleteExpense = (userId: string, id: string) => this.remove('expenses', { user_id: userId, id })

  async deleteUserData(userId: string) {
    for (const t of ['expenses', 'documents', 'appointments', 'bookings', 'visa_applications', 'trips', 'profiles']) {
      await this.remove(t, { user_id: userId })
    }
    await this.remove('users', { id: userId })
  }

  private async count(table: string, status?: string): Promise<number> {
    let q = this.db.from(table).select('id', { count: 'exact' }).limit(1)
    if (status) q = q.eq('status', status)
    const res = await q
    if (res.error) throw new DatabaseError(res.error.message, res.error.code ?? null)
    return res.count ?? 0
  }

  async stats(): Promise<StoreStats> {
    const byStatus = async (table: string, keys: string[]) =>
      Object.fromEntries(await Promise.all(keys.map(async (k) => [k, await this.count(table, k)] as const)))
    return {
      users: await this.count('users'),
      documents: await this.count('documents'),
      applications: await byStatus('visa_applications', ['draft', 'ready', 'submitted_on_portal']),
      bookings: await byStatus('bookings', ['sample', 'requested', 'confirmed']),
      appointments: await byStatus('appointments', ['requested', 'pending', 'confirmed']),
    }
  }

  async listUsers(opts: { query?: string; limit: number; offset: number }) {
    // Strip characters that have meaning inside a PostgREST filter expression: the search text is user input.
    const q = (opts.query ?? '').replace(/[,()%*\\:"']/g, ' ').trim()
    let req = this.db.from('users').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(opts.offset, opts.offset + opts.limit - 1)
    if (q) req = req.or(`email.ilike.%${q}%,name.ilike.%${q}%`)
    const res = await req
    if (res.error) throw new DatabaseError(res.error.message, res.error.code ?? null)
    return { users: (res.data as Row[]).map(userFrom), total: res.count ?? 0 }
  }
  async findUsersByIds(ids: string[]) {
    if (ids.length === 0) return []
    const rows = ok(await this.db.from('users').select('*').in('id', ids)) as Row[]
    return rows.map(userFrom)
  }
  async addAudit(e: AuditEntry) {
    ok(await this.db.from('audit_log').insert({ id: e.id, at: e.at, actor_id: e.actorId, action: e.action, target_id: e.targetId, meta: e.meta }).select('id'))
  }
  async listAudit(opts: { limit: number; offset: number; action?: string }) {
    let req = this.db.from('audit_log').select('*').order('at', { ascending: false }).range(opts.offset, opts.offset + opts.limit - 1)
    if (opts.action) req = req.eq('action', opts.action)
    return (ok(await req) as Row[]).map(auditFrom)
  }
  async listRetentionProfiles() {
    const rows = ok(await this.db.from('profiles').select('*').not('retention_days', 'is', null)) as Row[]
    return rows.map(profileFrom)
  }
}

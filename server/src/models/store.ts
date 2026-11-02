import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Appointment, AuditEntry, Booking, Expense, Order, Profile, StoredDocument, Trip, User, VisaApplication } from './types.ts'

/**
 * Persistence boundary. The shipped implementation is a JSON-file store for local
 * development; a PostgreSQL implementation of this interface (schema in
 * server/migrations) is the production target.
 */
export interface Store {
  findUserByEmail(email: string): Promise<User | undefined>
  findUserById(id: string): Promise<User | undefined>
  findUserByVerifyToken(token: string): Promise<User | undefined>
  saveUser(user: User): Promise<void>
  countUsers(): Promise<number>
  getProfile(userId: string): Promise<Profile | undefined>
  saveProfile(profile: Profile): Promise<void>
  listTrips(userId: string): Promise<Trip[]>
  getTrip(userId: string, id: string): Promise<Trip | undefined>
  saveTrip(trip: Trip): Promise<void>
  deleteTrip(userId: string, id: string): Promise<boolean>
  deleteUserData(userId: string): Promise<void>
  listApplications(userId: string): Promise<VisaApplication[]>
  getApplication(userId: string, id: string): Promise<VisaApplication | undefined>
  saveApplication(app: VisaApplication): Promise<void>
  deleteApplication(userId: string, id: string): Promise<boolean>
  listDocuments(userId: string, applicationId?: string): Promise<StoredDocument[]>
  getDocument(userId: string, id: string): Promise<StoredDocument | undefined>
  saveDocument(doc: StoredDocument): Promise<void>
  deleteDocument(userId: string, id: string): Promise<boolean>
  listBookings(userId: string): Promise<Booking[]>
  getBooking(userId: string, id: string): Promise<Booking | undefined>
  saveBooking(booking: Booking): Promise<void>
  deleteBooking(userId: string, id: string): Promise<boolean>
  listAppointments(userId: string): Promise<Appointment[]>
  getAppointment(userId: string, id: string): Promise<Appointment | undefined>
  saveAppointment(a: Appointment): Promise<void>
  deleteAppointment(userId: string, id: string): Promise<boolean>
  listExpenses(userId: string, tripId?: string): Promise<Expense[]>
  getExpense(userId: string, id: string): Promise<Expense | undefined>
  saveExpense(e: Expense): Promise<void>
  deleteExpense(userId: string, id: string): Promise<boolean>
  listOrders(userId: string): Promise<Order[]>
  getOrder(userId: string, id: string): Promise<Order | undefined>
  /** Webhooks arrive without a session, so they look orders up by id alone. */
  getOrderById(id: string): Promise<Order | undefined>
  saveOrder(order: Order): Promise<void>
  /** Atomically moves an order between statuses; false if it was not in `from` (someone else got there first). */
  claimOrder(id: string, from: Order['status'], to: Order['status']): Promise<boolean>
  /** Aggregate counts for the admin dashboard. */
  stats(): Promise<StoreStats>
  listUsers(opts: { query?: string; limit: number; offset: number }): Promise<{ users: User[]; total: number }>
  findUsersByIds(ids: string[]): Promise<User[]>
  addAudit(entry: AuditEntry): Promise<void>
  listAudit(opts: { limit: number; offset: number; action?: string }): Promise<AuditEntry[]>
  /** Profiles that opted in to automatic deletion of uploaded files. */
  listRetentionProfiles(): Promise<Profile[]>
}

export interface StoreStats {
  users: number
  documents: number
  applications: Record<string, number>
  bookings: Record<string, number>
  appointments: Record<string, number>
}

export const countBy = (rows: { status: string }[], keys: string[]) =>
  Object.fromEntries(keys.map((k) => [k, rows.filter((r) => r.status === k).length]))

interface Data {
  users: User[]
  profiles: Profile[]
  trips: Trip[]
  applications: VisaApplication[]
  documents: StoredDocument[]
  bookings: Booking[]
  appointments: Appointment[]
  expenses: Expense[]
  orders: Order[]
  audit: AuditEntry[]
}

export class JsonStore implements Store {
  private data: Data = { users: [], profiles: [], trips: [], applications: [], documents: [], bookings: [], appointments: [], expenses: [], orders: [], audit: [] }

  /** Pass no path for a purely in-memory store (used in tests). */
  private readonly filePath?: string

  constructor(filePath?: string) {
    this.filePath = filePath
    if (filePath && existsSync(filePath)) this.data = { ...this.data, ...(JSON.parse(readFileSync(filePath, 'utf8')) as Partial<Data>) }
  }

  private persist() {
    if (!this.filePath) return
    mkdirSync(dirname(this.filePath), { recursive: true })
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2))
  }

  async findUserByEmail(email: string) {
    return this.data.users.find((u) => u.email === email.toLowerCase())
  }
  async findUserById(id: string) {
    return this.data.users.find((u) => u.id === id)
  }
  async findUserByVerifyToken(token: string) {
    return this.data.users.find((u) => u.verifyToken === token)
  }
  async saveUser(user: User) {
    const i = this.data.users.findIndex((u) => u.id === user.id)
    if (i >= 0) this.data.users[i] = user
    else this.data.users.push(user)
    this.persist()
  }
  async countUsers() {
    return this.data.users.length
  }
  async getProfile(userId: string) {
    return this.data.profiles.find((p) => p.userId === userId)
  }
  async saveProfile(profile: Profile) {
    const i = this.data.profiles.findIndex((p) => p.userId === profile.userId)
    if (i >= 0) this.data.profiles[i] = profile
    else this.data.profiles.push(profile)
    this.persist()
  }
  async listTrips(userId: string) {
    return this.data.trips.filter((t) => t.userId === userId).sort((a, b) => a.departOn.localeCompare(b.departOn))
  }
  async getTrip(userId: string, id: string) {
    return this.data.trips.find((t) => t.userId === userId && t.id === id)
  }
  async saveTrip(trip: Trip) {
    const i = this.data.trips.findIndex((t) => t.id === trip.id)
    if (i >= 0) this.data.trips[i] = trip
    else this.data.trips.push(trip)
    this.persist()
  }
  async deleteTrip(userId: string, id: string) {
    const before = this.data.trips.length
    this.data.trips = this.data.trips.filter((t) => !(t.userId === userId && t.id === id))
    this.data.expenses = this.data.expenses.map((e) => (e.userId === userId && e.tripId === id ? { ...e, tripId: null } : e))
    this.persist()
    return this.data.trips.length < before
  }
  async deleteUserData(userId: string) {
    this.data.users = this.data.users.filter((u) => u.id !== userId)
    this.data.profiles = this.data.profiles.filter((p) => p.userId !== userId)
    this.data.trips = this.data.trips.filter((t) => t.userId !== userId)
    this.data.applications = this.data.applications.filter((a) => a.userId !== userId)
    this.data.documents = this.data.documents.filter((d) => d.userId !== userId)
    this.data.bookings = this.data.bookings.filter((b) => b.userId !== userId)
    this.data.appointments = this.data.appointments.filter((a) => a.userId !== userId)
    this.data.expenses = this.data.expenses.filter((e) => e.userId !== userId)
    this.data.orders = this.data.orders.filter((o) => o.userId !== userId)
    this.persist()
  }
  async listApplications(userId: string) {
    return this.data.applications.filter((a) => a.userId === userId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }
  async getApplication(userId: string, id: string) {
    return this.data.applications.find((a) => a.userId === userId && a.id === id)
  }
  async saveApplication(app: VisaApplication) {
    const i = this.data.applications.findIndex((a) => a.id === app.id)
    if (i >= 0) this.data.applications[i] = app
    else this.data.applications.push(app)
    this.persist()
  }
  async deleteApplication(userId: string, id: string) {
    const before = this.data.applications.length
    this.data.applications = this.data.applications.filter((a) => !(a.userId === userId && a.id === id))
    this.data.documents = this.data.documents.filter((d) => !(d.userId === userId && d.applicationId === id))
    this.persist()
    return this.data.applications.length < before
  }
  async listDocuments(userId: string, applicationId?: string) {
    return this.data.documents.filter((d) => d.userId === userId && (!applicationId || d.applicationId === applicationId))
  }
  async getDocument(userId: string, id: string) {
    return this.data.documents.find((d) => d.userId === userId && d.id === id)
  }
  async saveDocument(doc: StoredDocument) {
    this.data.documents.push(doc)
    this.persist()
  }
  async deleteDocument(userId: string, id: string) {
    const before = this.data.documents.length
    this.data.documents = this.data.documents.filter((d) => !(d.userId === userId && d.id === id))
    this.persist()
    return this.data.documents.length < before
  }
  async listBookings(userId: string) {
    return this.data.bookings.filter((b) => b.userId === userId).sort((a, b) => a.startDate.localeCompare(b.startDate))
  }
  async getBooking(userId: string, id: string) {
    return this.data.bookings.find((b) => b.userId === userId && b.id === id)
  }
  async saveBooking(booking: Booking) {
    const i = this.data.bookings.findIndex((b) => b.id === booking.id)
    if (i >= 0) this.data.bookings[i] = booking
    else this.data.bookings.push(booking)
    this.persist()
  }
  async deleteBooking(userId: string, id: string) {
    const before = this.data.bookings.length
    this.data.bookings = this.data.bookings.filter((b) => !(b.userId === userId && b.id === id))
    this.persist()
    return this.data.bookings.length < before
  }
  async listAppointments(userId: string) {
    return this.data.appointments.filter((a) => a.userId === userId).sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  }
  async getAppointment(userId: string, id: string) {
    return this.data.appointments.find((a) => a.userId === userId && a.id === id)
  }
  async saveAppointment(a: Appointment) {
    const i = this.data.appointments.findIndex((x) => x.id === a.id)
    if (i >= 0) this.data.appointments[i] = a
    else this.data.appointments.push(a)
    this.persist()
  }
  async deleteAppointment(userId: string, id: string) {
    const before = this.data.appointments.length
    this.data.appointments = this.data.appointments.filter((a) => !(a.userId === userId && a.id === id))
    this.persist()
    return this.data.appointments.length < before
  }
  async listExpenses(userId: string, tripId?: string) {
    return this.data.expenses
      .filter((e) => e.userId === userId && (tripId === undefined || e.tripId === tripId))
      .sort((a, b) => b.spentOn.localeCompare(a.spentOn) || b.createdAt.localeCompare(a.createdAt))
  }
  async getExpense(userId: string, id: string) {
    return this.data.expenses.find((e) => e.userId === userId && e.id === id)
  }
  async saveExpense(e: Expense) {
    const i = this.data.expenses.findIndex((x) => x.id === e.id)
    if (i >= 0) this.data.expenses[i] = e
    else this.data.expenses.push(e)
    this.persist()
  }
  async deleteExpense(userId: string, id: string) {
    const before = this.data.expenses.length
    this.data.expenses = this.data.expenses.filter((e) => !(e.userId === userId && e.id === id))
    this.persist()
    return this.data.expenses.length < before
  }
  async listOrders(userId: string) {
    return this.data.orders.filter((o) => o.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }
  async getOrder(userId: string, id: string) {
    return this.data.orders.find((o) => o.userId === userId && o.id === id)
  }
  async getOrderById(id: string) {
    return this.data.orders.find((o) => o.id === id)
  }
  async saveOrder(order: Order) {
    const i = this.data.orders.findIndex((o) => o.id === order.id)
    if (i >= 0) this.data.orders[i] = order
    else this.data.orders.push(order)
    this.persist()
  }
  async claimOrder(id: string, from: Order['status'], to: Order['status']) {
    const o = this.data.orders.find((x) => x.id === id)
    if (!o || o.status !== from) return false
    o.status = to
    o.updatedAt = new Date().toISOString()
    this.persist()
    return true
  }
  async stats(): Promise<StoreStats> {
    return {
      users: this.data.users.length,
      documents: this.data.documents.length,
      applications: countBy(this.data.applications, ['draft', 'ready', 'submitted_on_portal']),
      bookings: countBy(this.data.bookings, ['sample', 'requested', 'confirmed']),
      appointments: countBy(this.data.appointments, ['requested', 'pending', 'confirmed']),
    }
  }
  async listUsers(opts: { query?: string; limit: number; offset: number }) {
    const q = (opts.query ?? '').trim().toLowerCase()
    const all = this.data.users
      .filter((u) => !q || u.email.toLowerCase().includes(q) || u.name.toLowerCase().includes(q))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return { users: all.slice(opts.offset, opts.offset + opts.limit), total: all.length }
  }
  async findUsersByIds(ids: string[]) {
    const set = new Set(ids)
    return this.data.users.filter((u) => set.has(u.id))
  }
  async addAudit(entry: AuditEntry) {
    this.data.audit.push(entry)
    if (this.data.audit.length > 20_000) this.data.audit.splice(0, this.data.audit.length - 20_000)
    this.persist()
  }
  async listAudit(opts: { limit: number; offset: number; action?: string }) {
    return this.data.audit
      .filter((e) => !opts.action || e.action === opts.action)
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(opts.offset, opts.offset + opts.limit)
  }
  async listRetentionProfiles() {
    return this.data.profiles.filter((p) => typeof p.retentionDays === 'number')
  }
}

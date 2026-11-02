import { useCallback, useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, Input, Select } from '@/components/ui/field'
import { destinations } from '@/features/visa/destinations'
import { reviews, reviewStatus } from '@/features/visa/review'
import { api, ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'

interface Stats {
  users: number
  documents: number
  applications: Record<string, number>
  bookings: Record<string, number>
  appointments: Record<string, number>
}
interface AdminUser { id: string; name: string; email: string; role: 'user' | 'admin'; emailVerified: boolean; disabled: boolean; createdAt: string }
interface AuditRow { id: string; at: string; action: string; actor: string | null; target: string | null; meta: Record<string, string | number | boolean> }

const LABELS: Record<string, string> = {
  draft: 'Draft', ready: 'Prepared', submitted_on_portal: 'Submitted (self-reported)',
  sample: 'Sample plans', requested: 'Requested', pending: 'Pending', confirmed: 'Confirmed',
}

const ACTION_LABELS: Record<string, string> = {
  'auth.register': 'Account created', 'auth.login': 'Signed in', 'auth.login_failed': 'Failed sign-in', 'auth.login_blocked': 'Sign-in blocked (disabled)',
  'auth.password_changed': 'Password changed', 'account.deleted': 'Account deleted', 'admin.list_users': 'Admin viewed user list',
  'admin.user_disabled': 'Account disabled by admin', 'admin.user_enabled': 'Account re-enabled by admin', 'upload.blocked': 'Upload blocked by scan',
  'upload.scan_unavailable': 'Upload refused: scanner down', 'upload.unscanned': 'Upload accepted without scan', 'retention.deleted_files': 'Files auto-deleted',
  'profile.retention_changed': 'Auto-delete setting changed',
}

function Breakdown({ title, counts }: { title: string; counts: Record<string, number> }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  return (
    <Card className="p-5">
      <h2 className="font-semibold">{title} <span className="text-sm font-normal text-ink-soft">({total})</span></h2>
      <ul className="mt-4 space-y-3">
        {Object.entries(counts).map(([k, n]) => (
          <li key={k}>
            <div className="flex justify-between text-sm"><span>{LABELS[k] ?? k}</span><span className="font-medium">{n}</span></div>
            <div className="mt-1 h-2 rounded-full bg-muted" aria-hidden><div className="h-full rounded-full bg-accent-600" style={{ width: `${total ? (n / total) * 100 : 0}%` }} /></div>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function GuidanceReview() {
  const today = new Date().toISOString().slice(0, 10)
  const rows = destinations.map((d) => ({ d, s: reviewStatus(reviews[d.id], today) }))
  const count = (state: string) => rows.filter((r) => r.s.state === state).length
  return (
    <Card className="p-5">
      <h2 className="font-semibold">Visa guidance review</h2>
      <p className="mt-1 text-sm text-ink-soft">
        {count('current')} reviewed, {count('stale')} out of date, {count('unreviewed')} never reviewed by a person (of {rows.length} destinations).
        Record a review in <code>src/features/visa/review.ts</code> after comparing a destination with its official pages.
      </p>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-accent-700">Show destinations</summary>
        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
          {rows.map(({ d, s }) => (
            <li key={d.id} className="flex items-center justify-between gap-2"><span>{d.name}</span><Badge tone={s.state === 'current' ? 'accent' : 'warning'}>{s.state === 'current' ? 'Reviewed' : s.state === 'stale' ? 'Out of date' : 'Not reviewed'}</Badge></li>
          ))}
        </ul>
      </details>
    </Card>
  )
}

function Overview() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    api<Stats>('/admin/stats').then(setStats).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load'))
  }, [])
  if (error) return <p role="alert" className="text-red-700">{error}</p>
  if (!stats) return <p role="status" className="text-sm text-ink-soft">Loading…</p>
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-5"><p className="text-sm text-ink-soft">Registered users</p><p className="mt-1 text-3xl font-semibold">{stats.users}</p></Card>
        <Card className="p-5"><p className="text-sm text-ink-soft">Stored documents</p><p className="mt-1 text-3xl font-semibold">{stats.documents}</p></Card>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Breakdown title="Visa applications" counts={stats.applications} />
        <Breakdown title="Bookings" counts={stats.bookings} />
        <Breakdown title="Appointments" counts={stats.appointments} />
      </div>
      <GuidanceReview />
    </div>
  )
}

const PAGE = 25

function Users() {
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [draft, setDraft] = useState('')
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ limit: String(PAGE), offset: String(offset), ...(query ? { query } : {}) })
      const r = await api<{ users: AdminUser[]; total: number }>(`/admin/users?${qs}`)
      setUsers(r.users)
      setTotal(r.total)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load users')
    }
  }, [offset, query])
  useEffect(() => {
    void load()
  }, [load])

  const toggle = async (u: AdminUser) => {
    setBusy(u.id)
    setError(null)
    try {
      await api(`/admin/users/${u.id}/${u.disabled ? 'enable' : 'disable'}`, { method: 'POST' })
      setConfirming(null)
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not update the account')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-soft">Accounts only. Documents, applications and passport details are never shown here, and viewing this list is recorded in the audit log.</p>
      <form className="flex flex-wrap items-end gap-3" role="search" aria-label="Search users" onSubmit={(e) => { e.preventDefault(); setOffset(0); setQuery(draft.trim()) }}>
        <div className="w-full max-w-sm"><Field label="Search by name or email" htmlFor="u-q"><Input id="u-q" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={80} /></Field></div>
        <Button type="submit" variant="outline">Search</Button>
        {query && <Button type="button" variant="ghost" onClick={() => { setDraft(''); setQuery(''); setOffset(0) }}>Clear</Button>}
      </form>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {users === null && !error && <p role="status" className="text-sm text-ink-soft">Loading…</p>}
      {users && users.length === 0 && <Card className="p-8 text-center text-sm text-ink-soft">No accounts match.</Card>}
      {users && users.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full min-w-[640px] text-left text-sm">
            <caption className="sr-only">User accounts</caption>
            <thead className="border-b border-line text-xs text-ink-soft">
              <tr><th scope="col" className="p-3">Name</th><th scope="col">Email</th><th scope="col">Status</th><th scope="col">Joined</th><th scope="col" className="pr-3 text-right">Action</th></tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-line last:border-0">
                  <td className="p-3 font-medium">{u.name}</td>
                  <td>{u.email}</td>
                  <td className="space-x-1">
                    {u.role === 'admin' && <Badge tone="accent">Admin</Badge>}
                    {u.disabled ? <Badge tone="danger">Disabled</Badge> : <Badge>Active</Badge>}
                    {!u.emailVerified && <Badge tone="warning">Unverified</Badge>}
                  </td>
                  <td>{u.createdAt.slice(0, 10)}</td>
                  <td className="pr-3 text-right">
                    {u.role === 'admin' ? <span className="text-xs text-ink-soft">Protected</span> : confirming === u.id ? (
                      <span className="inline-flex gap-2">
                        <Button size="sm" variant="primary" className={cn(!u.disabled && 'bg-red-600 hover:bg-red-700')} disabled={busy === u.id} onClick={() => void toggle(u)}>
                          {u.disabled ? 'Confirm re-enable' : 'Confirm disable'}<span className="sr-only"> {u.email}</span>
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>Cancel</Button>
                      </span>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => setConfirming(u.id)}>
                        {u.disabled ? 'Re-enable' : 'Disable'}<span className="sr-only"> {u.email}</span>
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {total > PAGE && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-ink-soft" aria-live="polite">{offset + 1}–{Math.min(offset + PAGE, total)} of {total}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>Previous</Button>
            <Button size="sm" variant="outline" disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)}>Next</Button>
          </div>
        </div>
      )}
      <p className="text-xs text-ink-soft">Disabling blocks sign-in and ends the person's sessions within seconds. Administrator accounts cannot be disabled here.</p>
    </div>
  )
}

function Audit() {
  const [rows, setRows] = useState<AuditRow[] | null>(null)
  const [action, setAction] = useState('')
  const [offset, setOffset] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const qs = new URLSearchParams({ limit: String(PAGE), offset: String(offset), ...(action ? { action } : {}) })
    api<{ entries: AuditRow[] }>(`/admin/audit?${qs}`).then((r) => { setRows(r.entries); setError(null) }).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load the audit log'))
  }, [action, offset])

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-soft">Newest first. Entries hold ids and small flags only; email addresses are looked up when you view this page, so deleting an account removes its address here.</p>
      <div className="max-w-xs">
        <Field label="Filter by event" htmlFor="a-action">
          <Select id="a-action" value={action} onChange={(e) => { setAction(e.target.value); setOffset(0) }}>
            <option value="">All events</option>
            {Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {rows === null && !error && <p role="status" className="text-sm text-ink-soft">Loading…</p>}
      {rows && rows.length === 0 && <Card className="p-8 text-center text-sm text-ink-soft">No events{action ? ' of this kind' : ''} yet.</Card>}
      {rows && rows.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full min-w-[640px] text-left text-sm">
            <caption className="sr-only">Audit log</caption>
            <thead className="border-b border-line text-xs text-ink-soft">
              <tr><th scope="col" className="p-3">When</th><th scope="col">Event</th><th scope="col">By</th><th scope="col">About</th><th scope="col">Details</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line align-top last:border-0">
                  <td className="whitespace-nowrap p-3 text-xs">{new Date(r.at).toLocaleString()}</td>
                  <td>{ACTION_LABELS[r.action] ?? r.action}</td>
                  <td>{r.actor ?? <span className="text-ink-soft">system / not signed in</span>}</td>
                  <td>{r.target ?? '—'}</td>
                  <td className="text-xs text-ink-soft">{Object.entries(r.meta).map(([k, v]) => `${k}: ${v}`).join(', ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>Newer</Button>
        <Button size="sm" variant="outline" disabled={!rows || rows.length < PAGE} onClick={() => setOffset(offset + PAGE)}>Older</Button>
      </div>
    </div>
  )
}

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'users', label: 'Users' },
  { id: 'audit', label: 'Audit log' },
] as const

export default function AdminPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('overview')
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-10">
      <header>
        <h1 className="text-2xl font-semibold">Admin dashboard</h1>
        <p className="mt-1 text-sm text-ink-soft">Manage accounts and review activity. Personal documents and passport details are deliberately not visible here.</p>
      </header>
      <div role="tablist" aria-label="Admin sections" className="flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={cn('-mb-px border-b-2 px-4 py-2 text-sm font-medium', tab === t.id ? 'border-accent-600 text-ink' : 'border-transparent text-ink-soft hover:text-ink')}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'overview' && <Overview />}
        {tab === 'users' && <Users />}
        {tab === 'audit' && <Audit />}
      </div>
    </div>
  )
}

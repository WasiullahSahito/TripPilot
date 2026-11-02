import { Router } from 'express'
import { z } from 'zod'
import type { Store } from '../models/store.ts'
import type { User } from '../models/types.ts'
import { HttpError, requireAuth, requireRole } from '../middleware/security.ts'
import { invalidateSessionCache } from '../middleware/session-guard.ts'
import { audit } from '../services/audit.ts'

const paging = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
})
const userQuery = paging.extend({ query: z.string().trim().max(80).default('') })
const auditQuery = paging.extend({ action: z.string().regex(/^[a-z_.]{1,60}$/).optional() })
const id = z.string().uuid()

/** Deliberately narrow: an administrator sees who has accounts, never their documents, applications or passwords. */
const adminView = (u: User) => ({
  id: u.id, name: u.name, email: u.email, role: u.role, emailVerified: !!u.emailVerifiedAt, disabled: !!u.disabledAt, createdAt: u.createdAt,
})

export function adminRoutes(store: Store) {
  const r = Router()
  r.use(requireAuth, requireRole(store, 'admin'))

  r.get('/stats', async (_req, res) => {
    res.json(await store.stats())
  })

  r.get('/users', async (req, res) => {
    const q = userQuery.parse(req.query)
    const { users, total } = await store.listUsers({ query: q.query, limit: q.limit, offset: q.offset })
    await audit(store, { actorId: req.session!.sub, action: 'admin.list_users', meta: { count: users.length, searched: q.query.length > 0 } })
    res.json({ users: users.map(adminView), total })
  })

  const setDisabled = (disable: boolean) => async (req: import('express').Request, res: import('express').Response) => {
    const targetId = id.safeParse(req.params.id)
    if (!targetId.success) throw new HttpError(404, 'User not found')
    const actorId = req.session!.sub
    const target = await store.findUserById(targetId.data)
    if (!target) throw new HttpError(404, 'User not found')
    if (disable && target.id === actorId) throw new HttpError(400, 'You cannot disable your own account')
    if (disable && target.role === 'admin') throw new HttpError(403, 'Administrator accounts cannot be disabled here')
    const already = !!target.disabledAt === disable
    if (!already) {
      await store.saveUser({ ...target, disabledAt: disable ? new Date().toISOString() : null })
      invalidateSessionCache(target.id)
      await audit(store, { actorId, action: disable ? 'admin.user_disabled' : 'admin.user_enabled', targetId: target.id })
    }
    res.json({ user: adminView({ ...target, disabledAt: disable ? (target.disabledAt ?? new Date().toISOString()) : null }) })
  }
  r.post('/users/:id/disable', setDisabled(true))
  r.post('/users/:id/enable', setDisabled(false))

  r.get('/audit', async (req, res) => {
    const q = auditQuery.parse(req.query)
    const entries = await store.listAudit({ limit: q.limit, offset: q.offset, action: q.action })
    const ids = [...new Set(entries.flatMap((e) => [e.actorId, e.targetId]).filter((x): x is string => !!x))]
    const known = new Map((await store.findUsersByIds(ids)).map((u) => [u.id, u.email]))
    // Emails are resolved when the log is read, not stored in it, so deleting an account also removes its email here.
    const who = (uid: string | null) => (uid === null ? null : (known.get(uid) ?? '(deleted account)'))
    res.json({
      entries: entries.map((e) => ({ id: e.id, at: e.at, action: e.action, actor: who(e.actorId), target: who(e.targetId), meta: e.meta })),
    })
  })

  return r
}

import { Router, type Response } from 'express'
import { env } from '../config/env.ts'
import type { Store } from '../models/store.ts'
import type { Profile } from '../models/types.ts'
import { HttpError, SESSION_COOKIE, authLimiter, requireAuth } from '../middleware/security.ts'
import { audit } from '../services/audit.ts'
import { checkPassword, hashPassword, newUser, signSession, toPublicUser } from '../services/auth-service.ts'
import { loginSchema, registerSchema } from '../validators/schemas.ts'

function setSession(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProd,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  })
}

export function authRoutes(store: Store) {
  const r = Router()

  r.post('/register', authLimiter, async (req, res) => {
    const input = registerSchema.parse(req.body)
    if (await store.findUserByEmail(input.email)) throw new HttpError(409, 'An account with this email already exists')
    const user = newUser({ name: input.name, email: input.email, passwordHash: await hashPassword(input.password) })
    await store.saveUser(user)
    const profile: Profile = {
      userId: user.id, nationality: '', residenceCountry: '', homeAirport: '', interests: [], onboardedAt: null,
    }
    await store.saveProfile(profile)
    await audit(store, { actorId: user.id, action: 'auth.register', targetId: user.id })
    // No email provider is wired up yet: in development the verification link is printed instead of sent.
    if (!env.isProd) console.log(`[dev] verify link: ${env.clientOrigin}/verify-email?token=${user.verifyToken}`)
    setSession(res, signSession(user))
    res.status(201).json({ user: toPublicUser(user) })
  })

  r.post('/login', authLimiter, async (req, res) => {
    const input = loginSchema.parse(req.body)
    const user = await store.findUserByEmail(input.email)
    if (!user || !(await checkPassword(user, input.password))) {
      // Only attempts against real accounts are logged, by id: no email text is written for unknown addresses.
      if (user) await audit(store, { actorId: null, action: 'auth.login_failed', targetId: user.id })
      throw new HttpError(401, 'Incorrect email or password')
    }
    // Revealed only to someone who proved they know the password, so it does not expose which emails have accounts.
    if (user.disabledAt) {
      await audit(store, { actorId: null, action: 'auth.login_blocked', targetId: user.id })
      throw new HttpError(403, 'This account has been disabled. Contact support.')
    }
    await audit(store, { actorId: user.id, action: 'auth.login', targetId: user.id })
    setSession(res, signSession(user))
    res.json({ user: toPublicUser(user) })
  })

  r.post('/logout', (_req, res) => {
    res.clearCookie(SESSION_COOKIE, { path: '/' })
    res.status(204).end()
  })

  r.post('/verify-email', async (req, res) => {
    const token = typeof req.body?.token === 'string' ? req.body.token : ''
    const user = token ? await store.findUserByVerifyToken(token) : undefined
    if (!user) throw new HttpError(400, 'Invalid or expired verification link')
    const isAdmin = !!env.adminEmail && user.email === env.adminEmail
    await store.saveUser({ ...user, role: isAdmin ? 'admin' : user.role, emailVerifiedAt: new Date().toISOString(), verifyToken: null })
    res.json({ ok: true })
  })

  r.get('/me', requireAuth, async (req, res) => {
    const user = await store.findUserById(req.session!.sub)
    if (!user) throw new HttpError(401, 'Not signed in')
    const profile = await store.getProfile(user.id)
    res.json({ user: toPublicUser(user), profile })
  })

  return r
}

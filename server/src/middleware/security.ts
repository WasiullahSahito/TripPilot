import type { ErrorRequestHandler, RequestHandler } from 'express'
import rateLimit from 'express-rate-limit'
import { ZodError } from 'zod'
import { env } from '../config/env.ts'
import { verifySession } from '../services/auth-service.ts'
import { DatabaseError } from '../models/database-error.ts'
import type { Store } from '../models/store.ts'
import type { Role } from '../models/types.ts'

export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export const SESSION_COOKIE = 'tp_session'

/** Cookie auth relies on SameSite=Lax; this additionally rejects cross-origin state changes. */
export const originCheck: RequestHandler = (req, _res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()
  const origin = req.get('origin')
  if (origin && origin !== env.clientOrigin && !env.isTest) return next(new HttpError(403, 'Origin not allowed'))
  next()
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined
  const session = token ? verifySession(token) : null
  if (!session) return next(new HttpError(401, 'Not signed in'))
  req.session = session
  next()
}

/** Roles are read from the store on every call, so a demotion or promotion takes effect immediately. */
export const requireRole =
  (store: Pick<Store, 'findUserById'>, role: Role): RequestHandler =>
  async (req, _res, next) => {
    try {
      const user = req.session ? await store.findUserById(req.session.sub) : undefined
      next(user?.role === role ? undefined : new HttpError(403, 'Forbidden'))
    } catch (e) {
      next(e)
    }
  }

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.isTest,
  message: { error: 'Too many attempts. Try again later.' },
})

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.isTest,
  message: { error: 'Too many requests.' },
})

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Invalid input',
      fields: Object.fromEntries(err.issues.map((i) => [i.path.join('.') || '_', i.message])),
    })
    return
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message })
    return
  }
  // Body-parser errors (too large, malformed JSON) carry their own 4xx status.
  const status = (err as { status?: unknown })?.status
  if (typeof status === 'number' && status >= 400 && status < 500) {
    const msg = status === 413 ? 'File or request is too large' : status === 400 ? 'Malformed request' : 'Request rejected'
    res.status(status).json({ error: msg })
    return
  }
  if (err instanceof DatabaseError) {
    // Code and message only (no row details), so this is safe to log in every environment.
    console.error(`Database error [${err.code ?? 'no code'}]: ${err.message}`)
    res.status(503).json({ error: env.isProd ? 'The service is temporarily unavailable' : `Database error (${err.code ?? 'no code'}): ${err.message}` })
    return
  }
  // In production log only the error type: messages and bodies may contain personal data.
  // In development print the message and stack so problems can actually be diagnosed.
  if (env.isProd || env.isTest) console.error('Unhandled error:', err instanceof Error ? err.name : 'unknown')
  else console.error('Unhandled error:', err)
  res.status(500).json({ error: 'Something went wrong' })
}

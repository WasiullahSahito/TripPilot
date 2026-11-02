import type { RequestHandler } from 'express'
import { env } from '../config/env.ts'
import type { Store } from '../models/store.ts'
import { verifySession } from '../services/auth-service.ts'
import { SESSION_COOKIE } from './security.ts'

/**
 * Makes a login cookie worthless the moment its account is disabled or deleted, instead of staying valid until the
 * token expires. Runs on every API request that carries a session cookie.
 *
 * A short per-instance cache keeps this to roughly one database read per user every few seconds. Changes made on
 * the same instance (disable, delete) invalidate the cache immediately; on other serverless instances they take
 * effect within CACHE_MS.
 */
const CACHE_MS = env.isTest ? 0 : 10_000
const cache = new Map<string, { at: number; ok: boolean }>()

export const invalidateSessionCache = (userId?: string) => (userId ? cache.delete(userId) : cache.clear())

export function sessionGuard(store: Pick<Store, 'findUserById'>): RequestHandler {
  return async (req, res, next) => {
    try {
      const token = req.cookies?.[SESSION_COOKIE] as string | undefined
      const session = token ? verifySession(token) : null
      if (!token || !session) return next()

      let entry = cache.get(session.sub)
      if (!entry || Date.now() - entry.at >= CACHE_MS) {
        const user = await store.findUserById(session.sub)
        entry = { at: Date.now(), ok: !!user && !user.disabledAt }
        cache.set(session.sub, entry)
        if (cache.size > 5000) cache.delete(cache.keys().next().value!)
      }
      if (!entry.ok) {
        // Treat the request as signed out: protected routes answer 401, while login/register still work normally.
        delete req.cookies[SESSION_COOKIE]
        res.clearCookie(SESSION_COOKIE, { path: '/' })
      }
      next()
    } catch (e) {
      next(e)
    }
  }
}


import { timingSafeEqual } from 'node:crypto'
import { Router } from 'express'
import { env } from '../config/env.ts'
import type { Store } from '../models/store.ts'
import { HttpError } from '../middleware/security.ts'
import type { BlobStore } from '../services/blobs.ts'
import { runRetention } from '../services/retention.ts'

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/**
 * Scheduled jobs. Vercel Cron calls these with `Authorization: Bearer $CRON_SECRET`. With no CRON_SECRET configured
 * the endpoint does not exist, so it can never be triggered by strangers.
 */
export function cronRoutes(store: Store, blobs: BlobStore) {
  const r = Router()

  r.get('/retention', async (req, res) => {
    const secret = env.cronSecret
    if (!secret) throw new HttpError(404, 'Not found')
    const given = /^Bearer (.+)$/.exec(req.get('authorization') ?? '')?.[1] ?? ''
    if (!safeEqual(given, secret)) throw new HttpError(401, 'Unauthorized')
    res.json(await runRetention(store, blobs))
  })

  return r
}

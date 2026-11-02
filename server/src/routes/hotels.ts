import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { env } from '../config/env.ts'
import { fetchDirectory } from '../integrations/osm-hotels.ts'
import { requireAuth } from '../middleware/security.ts'

const query = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radius: z.coerce.number().int().min(500).max(15_000).default(5000),
})

const limiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.isTest,
  message: { error: 'Too many hotel searches. Slow down.' },
})

export function hotelRoutes() {
  const r = Router()
  r.use(requireAuth)

  r.get('/directory', limiter, async (req, res) => {
    const { lat, lng, radius } = query.parse(req.query)
    const { listings, cached } = await fetchDirectory(lat, lng, radius)
    res.json({
      listings,
      cached,
      source: 'OpenStreetMap contributors',
      notice: 'Real properties from OpenStreetMap. Prices, availability and reviews are not included: check them with a booking partner.',
    })
  })

  return r
}

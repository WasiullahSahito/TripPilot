import cookieParser from 'cookie-parser'
import express, { type RequestHandler } from 'express'
import helmet from 'helmet'
import type { Store } from './models/store.ts'
import { apiLimiter, errorHandler, originCheck } from './middleware/security.ts'
import { env } from './config/env.ts'
import { DiskBlobStore, type BlobStore } from './services/blobs.ts'
import { bookingRoutes } from './routes/bookings.ts'
import { requireProvider } from './integrations/providers.ts'
import { requireAuth } from './middleware/security.ts'
import { translateRoutes } from './routes/translate.ts'
import { providers } from './integrations/providers.ts'
import { travelpayoutsFlights } from './integrations/travelpayouts.ts'
import { documentRoutes } from './routes/documents.ts'
import { expenseRoutes } from './routes/expenses.ts'
import { hotelRoutes } from './routes/hotels.ts'
import { appointmentRoutes } from './routes/appointments.ts'
import { visaRoutes } from './routes/visa.ts'
import { authRoutes } from './routes/auth.ts'
import { adminRoutes } from './routes/admin.ts'
import { cronRoutes } from './routes/cron.ts'
import { uploadRoutes } from './routes/uploads.ts'
import { accountRoutes, profileRoutes, tripRoutes } from './routes/resources.ts'
import { sessionGuard } from './middleware/session-guard.ts'

/** Allows the browser app (and only it) to call the API from another origin, e.g. localhost:5173 -> localhost:4000. */
export const cors: RequestHandler = (req, res, next) => {
  const origin = req.get('origin')
  if (origin && origin === env.clientOrigin) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
    res.setHeader('Vary', 'Origin')
    if (req.method === 'OPTIONS') {
      res.status(204).end()
      return
    }
  }
  next()
}

export function createApp(store: Store, opts: { uploadDir?: string; blobs?: BlobStore } = {}) {
  const blobs = opts.blobs ?? new DiskBlobStore(opts.uploadDir ?? env.uploadDir)
  if (env.travelpayoutsToken && !providers.flights) providers.flights = travelpayoutsFlights(env.travelpayoutsToken, env.travelpayoutsMarker)
  const app = express()
  app.disable('x-powered-by')
  if (env.isProd) app.set('trust proxy', 1) // Vercel sits in front: needed for per-client rate limits
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
  app.use('/api', cors)
  app.use(express.json({ limit: '100kb' }))
  app.use(cookieParser())
  app.use('/api', apiLimiter, originCheck)
  app.use('/api', sessionGuard(store))

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true })
  })
  app.use('/api/auth', authRoutes(store))
  app.use('/api/profile', profileRoutes(store))
  app.use('/api/trips', tripRoutes(store))
  app.use('/api/visa', visaRoutes(store, blobs))
  app.use('/api/documents', documentRoutes(store, blobs))
  app.use('/api/appointments', appointmentRoutes(store, blobs))
  app.use('/api/bookings', bookingRoutes(store, blobs))
  app.post('/api/flights/search', requireAuth, async (req, res) => {
    res.json(await requireProvider('flights').search(req.body))
  })
  app.use('/api/hotels', hotelRoutes())
  app.use('/api/expenses', expenseRoutes(store))
  app.use('/api/translate', translateRoutes())
  app.use('/api/account', accountRoutes(store, blobs))
  app.use('/api/admin', adminRoutes(store))
  app.use('/api/cron', cronRoutes(store, blobs))
  app.use('/api/uploads', uploadRoutes(store, blobs))
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' })
  })
  app.use(errorHandler)
  return app
}

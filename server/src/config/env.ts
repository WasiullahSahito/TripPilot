import { randomBytes } from 'node:crypto'

const isProd = process.env.NODE_ENV === 'production'

if (isProd && (!process.env.JWT_SECRET || !process.env.DATA_KEY)) {
  throw new Error('JWT_SECRET and DATA_KEY must be set in production')
}

export const env = {
  isProd,
  isTest: process.env.NODE_ENV === 'test',
  port: Number(process.env.PORT ?? 4000),
  // Dev fallback is random per process, so sessions reset on restart rather than using a guessable secret.
  jwtSecret: process.env.JWT_SECRET ?? randomBytes(32).toString('hex'),
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  dataFile: process.env.DATA_FILE ?? 'server/.data/db.json',
  adminEmail: process.env.ADMIN_EMAIL?.toLowerCase(),
  // 32-byte hex key for encrypting application data at rest. The dev fallback is NOT secret.
  dataKey: process.env.DATA_KEY ?? '00'.repeat(32),
  uploadDir: process.env.UPLOAD_DIR ?? 'server/.data/uploads',
  // Vercel functions accept request bodies up to ~4.5 MB, so uploads are capped just below that everywhere.
  maxUploadBytes: 4 * 1024 * 1024,
  // Larger files go straight to storage (signed upload link), so they are not limited by the function body size.
  maxLargeUploadBytes: Math.min(Math.max(Number(process.env.MAX_LARGE_UPLOAD_MB ?? 25), 5), 100) * 1024 * 1024,
  // STORAGE_MODE=local ignores Supabase settings (development only), e.g. while the database is being set up.
  storageMode: process.env.STORAGE_MODE === 'local' ? ('local' as const) : ('auto' as const),
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  supabaseBucket: process.env.SUPABASE_BUCKET ?? 'documents',
  libreTranslateUrl: process.env.LIBRETRANSLATE_URL?.trim().replace(/\/+$/, '') || undefined,
  // Public Overpass server by default (light use only); point at your own instance for heavy or commercial use.
  // Optional ClamAV daemon (clamd) for real malware scanning. Without it only the built-in structural checks run.
  clamdHost: process.env.CLAMD_HOST || undefined,
  clamdPort: Number(process.env.CLAMD_PORT ?? 3310),
  // closed (default): refuse uploads when the scanner is configured but unreachable. open: store them anyway (logged).
  scanFailMode: process.env.SCAN_FAIL_MODE === 'open' ? ('open' as const) : ('closed' as const),
  // Required for the scheduled retention endpoint; without it the endpoint does not exist.
  cronSecret: process.env.CRON_SECRET || undefined,
  overpassUrl: process.env.OVERPASS_URL ?? 'https://overpass-api.de/api/interpreter',
  travelpayoutsToken: process.env.TRAVELPAYOUTS_TOKEN,
  travelpayoutsMarker: process.env.TRAVELPAYOUTS_MARKER,
  bcryptCost: process.env.NODE_ENV === 'test' ? 4 : 12,
}

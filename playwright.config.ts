import { defineConfig, devices } from '@playwright/test'

// End-to-end tests run against throwaway servers: local-file storage in server/.data/e2e (wiped at start), separate
// ports, and NEVER your .env or Supabase project (tsx is started without --env-file and Supabase vars are blanked).
const API = 4001
const WEB = 5174

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: { baseURL: `http://localhost:${WEB}`, trace: 'retain-on-failure', acceptDownloads: true },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: `node -e "require('fs').rmSync('server/.data/e2e',{recursive:true,force:true})" && npx tsx server/src/seed-admin.ts && npx tsx server/src/index.ts`,
      url: `http://localhost:${API}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        NODE_ENV: 'test', // disables rate limits, cheap password hashing
        PORT: String(API),
        CLIENT_ORIGIN: `http://localhost:${WEB}`,
        STORAGE_MODE: 'local',
        SUPABASE_URL: '',
        SUPABASE_SERVICE_ROLE_KEY: '',
        TRAVELPAYOUTS_TOKEN: '',
        LIBRETRANSLATE_URL: '',
        DATA_FILE: 'server/.data/e2e/db.json',
        UPLOAD_DIR: 'server/.data/e2e/uploads',
        JWT_SECRET: 'e2e-only-secret-not-for-real-use',
        // The e2e admin account is created by the seed script before the API starts.
        ADMIN_EMAIL: 'admin-e2e@example.com',
        ADMIN_PASSWORD: 'E2e-admin-pass-1234!',
      },
    },
    {
      command: `npx vite --port ${WEB} --strictPort`,
      url: `http://localhost:${WEB}`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { VITE_PROXY_TARGET: `http://localhost:${API}`, VITE_API_BASE_URL: '' },
    },
  ],
})

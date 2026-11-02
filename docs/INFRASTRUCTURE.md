# Infrastructure: Vercel + Supabase

## Read this first: two constraints on "$0"

1. **Vercel's free (Hobby) plan is for personal, non-commercial use only.** Vercel's guidelines count advertising and affiliate-style monetisation as commercial use. A site that earns affiliate commission is commercial, so production needs **Vercel Pro (about $20/user/month)** or another host. Hobby is fine for the private trial below if you earn nothing from it. Confirm with Vercel support if unsure. ([Vercel fair use guidelines](https://vercel.com/docs/limits/fair-use-guidelines))
2. **Supabase free projects pause after about 1 week of inactivity** (data kept, app offline until you restore it in the dashboard) and are limited to ~500 MB database / ~1 GB file storage / 2 active projects. A live site needs Supabase Pro ($25/month) to avoid the pause. ([Supabase pricing](https://supabase.com/pricing))

Everything else here runs at $0 during a trial.

## Architecture

| Piece | Where | Notes |
|---|---|---|
| React app | Vercel static hosting | HTTPS and HSTS automatic; headers in `vercel.json` |
| API (Express) | Vercel serverless function `api/index.ts` | Stateless; rate limits are per instance (see Limitations) |
| Database | Supabase Postgres | Schema: `server/migrations/001_init.sql`, `002_remaining_tables.sql` |
| Files (passports, tickets) | Supabase Storage, **private** bucket `documents` | Opened only via signed URLs valid 5 minutes |
| OCR | Tesseract.js in the **browser** | Photos are never uploaded for OCR |
| Translation | Self-hosted LibreTranslate (optional) | No paid API key required; the API proxies requests |

## Setup

1. **Supabase**: create a project. In the SQL editor run `001_init.sql`, then `002_remaining_tables.sql` (creates tables, constraints, RLS with no public policies, and the private `documents` bucket). Do **not** add storage policies for anonymous users.
2. Copy the project URL and the **service-role key** (Settings > API). The service-role key is a secret: server env only.
3. **Vercel**: import the repo. Framework preset "Vite". Add environment variables (`.env.example` lists all):
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET` (`openssl rand -hex 32`), `DATA_KEY` (`openssl rand -hex 32`, **back it up; losing it makes saved application data unreadable**), `CLIENT_ORIGIN` (your https URL), optional `ADMIN_EMAIL`, `TRAVELPAYOUTS_TOKEN`, `TRAVELPAYOUTS_MARKER`, and `LIBRETRANSLATE_URL` if translation is enabled.
   `VITE_OCR_ASSET_BASE` defaults to `/tesseract`; no Vercel setting is needed. The dev and production build scripts copy Tesseract's worker, WebAssembly cores, and all 10 selectable OCR language models into `public/tesseract`, which Vite deploys as same-origin static assets.
4. Deploy. In production the API refuses to start without Supabase and the secrets (it never falls back to local files).
5. Optional contract test against a **separate, empty** Supabase test project:
   `SUPABASE_TEST_URL=... SUPABASE_TEST_SERVICE_KEY=... npm test` (skipped otherwise).

## Self-hosted translation (no paid API key)

LibreTranslate is open source, but "free, self-hosted" means you provide the machine and bandwidth; a public no-key translation API is not a safe or reliable substitute. You can run it locally without Docker using Python, or use the optional Docker Compose setup.

### Windows, without Docker

Install Python 3.8 or newer and Git. LibreTranslate's documented Windows method uses its `run.bat` script. Clone it into a separate folder and start it with only the languages used by TripPilot:

```powershell
New-Item -ItemType Directory -Force "$env:LOCALAPPDATA\TripPilot" | Out-Null
git clone https://github.com/LibreTranslate/LibreTranslate "$env:LOCALAPPDATA\TripPilot\LibreTranslate"
Set-Location "$env:LOCALAPPDATA\TripPilot\LibreTranslate"
.\run.bat --load-only en,ar,fr,es,de,ru,tr,hi,zh,ja --host 127.0.0.1 --port 5000 --char-limit 5000 --threads 2
```

The first run installs dependencies and downloads translation models, so it may take time and disk space. Keep the PowerShell window open while using the app. In `.env`, set `LIBRETRANSLATE_URL=http://localhost:5000`, then restart the TripPilot API. Check `http://localhost:5000/languages`; the API proxies translations through `/api/translate`. The app sends no paid API key.

The Windows startup instructions have not been run on this machine. If setup fails because a Python dependency is unavailable on Windows, use the optional Docker setup below or install LibreTranslate on a Linux host. No TripPilot code change is needed to point to that service.

### Optional Docker setup

```powershell
docker compose -f docker-compose.translate.yml up -d
```

This Compose service is bound to loopback and is intended only for local development; it is not reachable from Vercel.

To enable translation from the deployed Vercel API, run LibreTranslate on an always-on host with HTTPS, then set Vercel's server-side `LIBRETRANSLATE_URL` to that endpoint and redeploy. Do not publish an unrestricted no-key instance to the public internet: anyone who finds it could consume your server resources. Put it behind network/access controls or a private gateway, and configure request limits. The browser never calls LibreTranslate directly. If your host cannot be securely reached from Vercel, leave translation unconfigured; the app reports this explicitly.

## Status: what has and hasn't been verified

- Verified by automated tests: the Store contract on the in-memory store, signed-URL redirects and deletion through a fake signing blob store, upload limits, security rules.
- **Not verified**: the Supabase store and Supabase Storage code against a real project, and the Vercel function entry (`api/index.ts` imports TypeScript with `.ts` extensions; if Vercel's bundler objects, build the server with `tsc`/`esbuild` first). Run the contract test and a preview deploy before trusting either.

## Limitations to plan for

- **Upload size**: 4 MB per file (Vercel functions accept ~4.5 MB request bodies). Larger files need direct-to-Supabase signed upload URLs (not built).
- **Rate limiting** uses memory per serverless instance, so it is a speed bump, not a hard limit. Use Vercel Firewall rules or a shared store (e.g. Upstash Redis free tier) for real enforcement.
- **Cold starts** add latency on the first request after idle.
- **Egress**: Supabase free includes limited bandwidth; heavy document downloads count against it.
- **Tesseract assets** (about 37 MB) are copied from locked npm dependencies into `public/tesseract` before development and production builds. OCR downloads the selected language model from the same origin; no third-party OCR asset host is required.

## Cost summary

| Item | Trial | Live site |
|---|---|---|
| Vercel | $0 (Hobby, non-commercial only) | ~$20/month (Pro) |
| Supabase | $0 (pauses when idle) | ~$25/month (Pro) |
| LibreTranslate | No paid API key; local use runs on your computer. An always-on self-hosted production server may have hosting and bandwidth charges. |
| Maps | $0 (OpenStreetMap, light use) | $0 light use; hosted provider for heavy traffic |
| Partner APIs / links | $0 to join; commission-based | same |

## Database migrations

Run in order in the Supabase SQL editor: `001_init.sql`, `002_remaining_tables.sql`, `003_expenses.sql` (or `all.sql` once on an empty project). **Already set up with 001 and 002? Run only `003_expenses.sql`**; the API refuses to start until the `expenses` table exists and `npm run db:check` tells you which file to run.

New optional settings: `OVERPASS_URL` (own Overpass server for the hotel directory) and `VITE_STAY22_AID` (Stay22 affiliate id for live hotel prices; also add `https://www.stay22.com` to the CSP `frame-src`, already present in `vercel.json`).

## Migration 004 and new settings
Run `server/migrations/004_admin_audit_retention.sql` (adds `users.disabled_at`, `profiles.retention_days` and the `audit_log` table). Already on 001 to 003? Run only 004. `npm run db:check` tells you which file you still need.

| Variable | Purpose |
|---|---|
| `CRON_SECRET` | Enables `/api/cron/retention`. Vercel Cron sends it as `Authorization: Bearer ...` (a daily schedule is in `vercel.json`). Generate with `openssl rand -hex 32`. |
| `MAX_LARGE_UPLOAD_MB` | Largest direct upload (default 25, max 100). Needs Supabase Storage. |
| `CLAMD_HOST`, `CLAMD_PORT`, `SCAN_FAIL_MODE` | Optional ClamAV scanning. A clamd server must be reachable from the API; it cannot run inside a Vercel function, so you need a small always-on host. `closed` (default) refuses uploads when clamd is down; `open` accepts and logs. |

Self-hosted (no Vercel): schedule `npm run retention:run` daily (Windows Task Scheduler or cron).

Abandoned direct uploads sit in `pending/` in the bucket until the daily job removes those older than a day; uploads that pass the checks are moved to the user's folder.

# TripPilot

A self-service travel and visa preparation platform: guided visa applications, flight and hotel planning, travel insurance, maps, appointment tracking, passport OCR, and a unified PDF document package, in one interface.

> **TripPilot prepares; it never submits.** The official government or embassy site stays in charge of submission, CAPTCHA, consent, identity checks and payment. Search results are shown only when a provider returns them; the app does not generate substitute offers. It never invents ticket numbers, policy numbers or appointment confirmations.

## Live data and provider availability

| Area | Status |
|---|---|
| Accounts, onboarding, trips, dashboard, notifications | **Working** |
| Visa workspace: tourism, visiting and work preparation, official links, checklists, autosave/resume, uploads, summary PDF | **Working** (general organizer, not an official rules engine; verify requirements with authorities) |
| Passport OCR (Tesseract.js, in-browser) with MRZ check digits | **Working**; photo never uploaded |
| PDF package builder (merge, reorder, preview, page numbers) | **Working** |
| Interface languages | **i18next configured** for English, Arabic, French, Spanish, German, Russian, Turkish, Hindi, Chinese and Japanese in app navigation and Settings; Arabic switches the document to right-to-left layout |
| Appointments (month/week/agenda, checklists, `.ics` export) | **Working** (reminders are saved preferences, not delivered) |
| Maps: OpenStreetMap, Nominatim search, OSRM directions | **Working**, free and keyless (light use only) |
| Flights | Provider-backed only; needs a **Travelpayouts** token for cached fare data. Confirm availability and price with the partner. |
| Hotels | **Real property directory** from OpenStreetMap (names, types, addresses, stars where mapped, websites, map view). **No prices or availability**: each property links to booking partners; an optional Stay22 map (your affiliate id in `VITE_STAY22_AID`) shows live prices. |
| Insurance | No quote API is connected; outbound insurer/partner links and user-entered policy records only. |
| Partner links (Skyscanner, WayAway, Agoda, Booking.com, Stay22, Ekta, Discover Cars, Viator, GetYourGuide, Airalo, AirHelp) | **Working as outbound links**; tracked affiliate templates need your partner accounts |
| Trip budget: expenses per trip and currency (estimated/paid), USD trip budget comparison, dashboard panel | **Working** (no currency conversion: totals are per currency) |
| Booking handoff: after you click through to a partner, Booking history offers to record it (prefilled, status "requested") | **Working**; only a reference you type makes a booking "confirmed" |
| Admin: user list with search, disable/re-enable accounts (sessions end immediately), audit log, overview counts | **Working** (personal documents are never visible to admins) |
| Upload safety: file-type check, structural scan (PDF scripts, appended payloads, image bombs), optional ClamAV | **Working**; real malware detection needs **your own ClamAV server** (`CLAMD_HOST`) |
| Large uploads (up to 25 MB) straight to Supabase Storage; large photos shrink automatically on local storage | **Working** (verified against a live Supabase project) |
| Automatic deletion of uploaded files N days after a trip (opt-in per user, daily job) | **Working**; on Vercel set `CRON_SECRET`; elsewhere run `npm run retention:run` |
| Document package: drag-and-drop ordering, optional photo size reduction | **Working** (uploaded PDFs are included unchanged: they cannot be recompressed here) |
| Visa guidance review tracking (who checked what, when) and an official-link checker | **Working**; **no destination has been reviewed by a person yet** |
| Browser assistant: teach it a site's fields yourself; Web Store package and listing text ready | **Working**; publishing needs your Chrome developer account; no real embassy adapters are bundled |
| Real booking, payment and ticketing: flights (Duffel), stays (Duffel Stays), insurance (provider adapter), card payment (Stripe for international customers, Safepay for customers in Pakistan), automatic refund if the provider fails, orders page | **Written and tested against mocks only**; needs your Duffel account plus Stripe and/or Safepay (test keys first); **the Safepay adapter is unverified against Safepay's docs**. **Insurance has no provider adapter yet**: see docs/COMMERCE.md. Without keys, the site keeps linking out to partners. |
| Translation | Self-hosted **LibreTranslate**, configured without a paid API key; run locally with Python (Docker optional) or use an HTTPS-hosted instance in production |
| Browser assistant (Chrome extension) | **Working**, optional; build and load it yourself |
| Supabase (Postgres + private Storage) and Vercel deployment | **Written, not yet verified** against live projects |
| Email delivery, password reset, 2FA | **Not built** |

## Quick start (no accounts or keys needed)

```bash
npm install
npm run dev:server     # API on http://localhost:4000 (local JSON file storage)
npm run dev            # website on http://localhost:5173
```

Open http://localhost:5173 and sign up (password: 10+ characters). The email verification link prints in the API terminal. Set `ADMIN_EMAIL` and verify that address to get an admin account.

To use Supabase instead of local files, copy `.env.example` to `.env`, fill the Supabase values, run `server/migrations/all.sql` in the Supabase SQL editor, then check with `npm run db:check`. `STORAGE_MODE=local` forces local files.

For self-hosted translation during local development, Docker is optional. On Windows, install Python and Git, then follow [the LibreTranslate setup guide](docs/INFRASTRUCTURE.md#self-hosted-translation-no-paid-api-key) and keep `LIBRETRANSLATE_URL=http://localhost:5000` in `.env`. The web app sends translation requests through the authenticated API; document photos remain in the browser, and passport MRZ text is blocked before forwarding.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` / `npm run dev:server` | Website / API with reload |
| `npm test` | Unit and API integration tests (Vitest) |
| `npm run test:e2e` | Real-browser journeys, accessibility (axe) and mobile checks (Playwright; first run: `npx playwright install chromium`) |
| `npm run typecheck` | Strict TypeScript across app, server and extension |
| `npm run build` | Production build into `dist/` |
| `npm run build:extension` | Bundle the browser assistant into `extension/dist/` |
| `npm run db:check` | Verify the Supabase project is ready |
| `npm run seed:admin` | Create (or repair) the admin account for `ADMIN_EMAIL`; prints a generated password once, or uses `ADMIN_PASSWORD` |
| `npm run retention:run` | Delete uploaded files for users who opted in to auto-deletion (schedule daily when not on Vercel) |
| `npm run check:links` | Check that every official visa link still opens (links only, not rules) |
| `npm run package:extension` | Build the browser assistant and write the Chrome Web Store ZIP (`icons:extension` regenerates the icons) |

E2E tests start throwaway servers on ports 4001/5174 with local storage in `server/.data/e2e`; they never use your `.env` or Supabase.

## Project layout

```
src/                 React 19 + TypeScript + Tailwind frontend (features/ per module)
server/src/          Express API: routes, middleware, validators, models (Store), services, integrations
server/migrations/   PostgreSQL schema (all.sql = one-paste setup)
api/index.js         Vercel serverless entry (generated by npm run build:api from server/src/vercel-entry.ts; commit it)
extension/           Chrome (MV3) browser assistant: src/, test-page/, manifest.json
tests/e2e/           Playwright specs
docs/                Architecture, API, costs, infrastructure, partners, security, trial plan
```

## Configuration

All variables are documented in [`.env.example`](.env.example). Secrets (`JWT_SECRET`, `DATA_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) are server-only: never put them in a `VITE_` variable. Back up `DATA_KEY`: losing it makes saved application data unreadable.

## Deployment

Frontend and API on Vercel, data in Supabase. See [docs/INFRASTRUCTURE.md](docs/INFRASTRUCTURE.md). **Vercel's free Hobby plan is non-commercial only**, so a site that earns affiliate commission needs a paid plan; Supabase's free tier pauses after about a week of inactivity. Cost breakdown: [docs/COSTS.md](docs/COSTS.md).

## Documentation

- [Architecture and roadmap](docs/ARCHITECTURE.md)
- [API reference](docs/API.md)
- [Security review and open items](docs/SECURITY_REVIEW.md) · [Privacy and security checklist](docs/SECURITY.md)
- [Infrastructure](docs/INFRASTRUCTURE.md) · [Costs](docs/COSTS.md) · [Partner integrations](docs/PARTNERS.md)
- [14-day trial plan](docs/TRIAL_PLAN.md)
- [Browser assistant](extension/README.md)

## Before real users

Have a lawyer review the privacy policy and terms (templates, not legal advice); verify visa guidance and official links against the relevant authorities; connect and test licensed travel/insurance providers before offering live hotel or insurance results; run the Supabase contract tests and a Vercel preview deploy; decide retention rules for stored documents; add email delivery and password reset.

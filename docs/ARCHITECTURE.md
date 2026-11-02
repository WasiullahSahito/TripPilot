# TripPilot — Architecture & Roadmap

## Status legend
- **Done**: working code. **Provider needed**: requires an external provider/key for live results.

| Area | Phase | Status |
|---|---|---|
| Design system, landing page, layouts, routing, trip search form | 1 | Done |
| Auth, onboarding, dashboard, trips | 2 | Done (JSON-file store; see notes) |
| Visa workflow, checklists, summary PDF | 3 | Done (see Phase 3 notes) |
| Flights / hotels | 4 | Flight adapter supports provider data; hotel provider not connected; no generated offers |
| Insurance, maps, appointments | 5 | Policy recording and partner links; no quote API; map landmarks are curated reference data |
| PDF package builder | 6 | Done |
| Chrome extension (user-directed autofill) | 7 | Done (see extension/README.md); server-side Playwright automation intentionally not built |
| Security review, tests, a11y, performance, deploy config | 8 | Done (see SECURITY_REVIEW.md); Supabase/Vercel paths need live verification |

## Architecture
- **Frontend**: Vite + React 19 + TS (strict), Tailwind v4 (tokens in `src/index.css`), React Router 7, feature-based folders under `src/features`.
- **Interface localization**: `src/i18n.ts` configures i18next with persistent English, Arabic, French, Spanish, German, Russian, Turkish, Hindi, Chinese and Japanese selection and RTL direction for Arabic. Navigation and Settings are localized; other page copy still needs translation resources and `t()` wiring.
- **Provider adapters** (`src/services/<domain>/`): flight and hotel searches call the API provider boundary. An unconfigured provider returns an explicit error; the client never inserts generated offers. Insurance currently has partner links and user-entered policy tracking, not quote integration. Historical sample booking records remain supported by the API, but the product no longer creates demo offers.
- **Backend** (`server/`, Phase 2+): Express + TS, PostgreSQL. Holds auth, sensitive data (passport, documents), rate limiting, provider secrets. Frontend never holds secrets.
- **Automation** (`extension/`, Phase 7): isolated MV3 extension, user-approved autofill only; no CAPTCHA/anti-bot bypass. Playwright only for authorized server-side tests.
- **Local-first**: IndexedDB for non-sensitive drafts (checklist progress, preferences). Passport numbers and identity docs are only persisted server-side.

## Journeys
1. Landing → trip search → visa workspace (prefilled via query) → checklist → summary PDF.
2. Sign up → onboarding → dashboard → add flight/hotel/insurance/appointment → document package → official portal.
3. Admin → user/application overview.

## Route map
Public: `/`, `/login`, `/signup`, `/onboarding`, `/help`. App (`/app/...`): dashboard, visa, flights, hotels, insurance, map, appointments, documents, bookings, profile, notifications. Admin: `/admin`. Protected-route and role guards land in Phase 2.

## Database schema (PostgreSQL, Phase 2)
`users(id, email, password_hash, role, email_verified_at, created_at)` ·
`profiles(user_id, nationality, residence_country, preferences jsonb)` ·
`trips(id, user_id, destination, depart_on, return_on, purpose)` ·
`visa_applications(id, trip_id, visa_type, status, data_encrypted bytea, updated_at)` ·
`bookings(id, trip_id, kind, status, source, provider_ref null, payload jsonb)` — `provider_ref` is only ever set from a provider response ·
`appointments(id, trip_id, center, starts_at, status, official_ref null)` ·
`documents(id, trip_id, kind, filename, storage_key, mime, size, verified bool)` ·
`audit_log(id, user_id, action, at)` (no PII payloads) ·
`consents(user_id, type, granted_at, revoked_at)`.

## Design system
Tokens: canvas `#faf9f6`, navy `#0b1f3a`, accent teal `#0d9488`, Inter, 16px card radius. Primitives in `src/components/ui` (Button, Card, Badge, Field/Input/Select, Accordion). Shared: `Reveal` (respects reduced motion), `SectionHeading`, `Logo`, `PagePlaceholder`.

## Phase 2 notes
- **Run**: `npm run dev:server` (API on :4000) and `npm run dev` (Vite proxies `/api`). Set `ADMIN_EMAIL` to get an admin account.
- **Auth**: bcrypt password hashes, HS256 JWT in an httpOnly SameSite=Lax cookie, origin check on mutations, rate limits on auth and API, helmet, zod validation, errors logged without request data.
- **Storage**: `server/src/models/store.ts` is a `Store` interface with a JSON-file implementation for development. `server/migrations/001_init.sql` is the PostgreSQL schema; **a pg-backed `Store` is not written yet** � the JSON file store is not suitable for production.
- **Email verification**: tokens and the verify endpoint work, but no email is sent; the link is printed to the server console in development.
- **Known gaps**: registration reveals whether an email exists (409); no password reset; no session revocation before expiry; dashboard depends on account data and shows empty states when none exists.

## Phase 3 notes
- **Config-driven**: `src/features/visa/destinations.ts` defines destinations, categories, official links, passport-validity guidance and extra checklist items. `checklist.ts` resolves the checklist from destination + category + purpose. Adding a destination needs no component changes.
- **Content caveat**: the initial sample destinations and the broader country catalogue carry general guidance only and may be out of date; the UI points to official starting points as authoritative. Review before any production use.
- **Persistence**: one draft per user + destination + category, autosaved (debounced) and resumable. Form data (including passport number) is AES-256-GCM encrypted at rest on the server with `DATA_KEY`; it is never put in browser storage. The dev fallback key is public - set `DATA_KEY` outside local development.
- **Uploads**: PDF/PNG/JPEG, 5 MB, type detected from file content (not the client header), sanitised filenames, private per-user directory, served as `attachment` with `nosniff`, removed with the application or account. No malware scanning yet.
- **Summary PDF**: generated in the browser with pdf-lib; carries an explicit "preparation summary, not an application" notice and labels accommodation as planned vs. confirmed by the user.
- **Status**: `draft` -> `ready` ("prepared") -> `submitted_on_portal` (self-reported). The platform never claims a submission or approval.
- **Work applications**: the organizer collects intended role/employer details and directs users to official route and document instructions. It does not claim to determine eligibility or provide country-specific work-permit requirements.
- **Not built**: browser-extension autofill (Phase 7); embedding official portals (links open in a new tab); per-nationality rule engines.

## Phase 4 notes
- **Adapters**: `src/services/{flights,hotels}` call `POST /api/flights|hotels/search`; the server answers 501 until a provider is registered in `server/src/integrations/providers.ts`. The client reports provider errors rather than falling back to synthetic results. Flight integration can return cached Travelpayouts fares; availability and final terms must be confirmed with the partner.
- **Current coverage**: there is no hotel provider connected. Hotel search is unavailable until an authorized provider is configured.
- **Booking integrity** (enforced server-side, tested): demo data can only be saved as `sample` and never with a reference; `confirmed` requires a user-supplied reference; clients cannot claim `source: provider`. Booking history separates confirmed / requested / sample.
- **Reservation documents**: PDF/PNG/JPEG attachments reuse the visa upload pipeline.
- **Not built**: real booking and payment (needs provider credentials and licensing); live hotel search; automatic inclusion of bookings in the PDF package (Phase 6).

## Phase 5 notes
- **Insurance**: there is no quote API or simulated premium calculation. Users follow an outbound insurer/partner link, then can record their own policy as a booking of kind `insurance` (a policy number is required to mark it confirmed) and attach the certificate. Whether a policy satisfies an embassy is never claimed.
- **Maps** (free, no API key, no billing): `features/maps` uses Leaflet with OpenStreetMap tiles, Nominatim for place search and the public OSRM server for driving directions. Leaflet is lazy-loaded with the map page. Limits: OSM's tile policy and Nominatim's ~1 request/second rule are for light, user-driven use only (requests happen only on explicit user actions); the OSRM demo server has no SLA. For production traffic, use a hosted tile/geocoding/routing provider with a free tier or self-host. Attribution to OpenStreetMap contributors is displayed as required.
- **POI data**: curated real landmarks are shown at approximate coordinates. Hotel and car-rental markers are not fabricated; dynamic points of interest are not yet connected.
- **Appointments**: server resource with `requested | pending | confirmed`; `confirmed` requires the provider's reference (server-enforced, tested). Month / week / agenda views, preparation checklists, document attachments, official booking links from the visa config, and `.ics` export (RFC 5545, escaped and folded; reminders as VALARM).
- **Not built**: delivery of reminders (email/push), live insurer quotes, automatic attachment of policy documents to the PDF package (Phase 6), calendar sync.

## Phase 6 notes
- **Flow**: `GET /api/documents` lists everything the user uploaded (visa checklist files, booking and appointment attachments) with owner kind. `assemble-items.ts` turns saved data into package items; `package-builder.ts` merges them with pdf-lib in the browser (files are fetched from the API only when building).
- **Content rules**: generated pages carry the true status (`SAMPLE PLAN - not a booking`, `REQUESTED`, `PENDING`, `CONFIRMED - reference ... (entered by the traveller)`). Confirmed/requested reservations and sample plans are separate items; sample plans are off by default. Mixed confirmed + requested groups are not labelled confirmed.
- **Fidelity**: uploaded PDFs are copied page-for-page; images are placed unscaled-up on A4. The only mark added to uploaded pages is the page number in the bottom margin (optional). Divider and contents pages are separate pages.
- **Errors**: a corrupt, password-protected or unreadable file is rolled back, reported by name with a reason, and the rest of the package still builds. Progress is reported per item.
- **Preview/export**: the built PDF is shown in an iframe from a blob URL and downloaded from the same blob; nothing is sent to a server.
- **Limits**: no drag-and-drop (up/down buttons), no in-package bookmarks, no OCR, no PDF compression; very large packages are built in memory.

## Phase 7 (infrastructure and partner layer) notes
See INFRASTRUCTURE.md, PARTNERS.md, SECURITY.md and TRIAL_PLAN.md. In short: Supabase Postgres + private Storage behind `Store`/`BlobStore` interfaces (signed 5-minute URLs), Vercel entry in `api/`, browser-side passport OCR with a checksum-validated MRZ parser, LibreTranslate proxy (MRZ blocked), affiliate link layer with disclosure, a Travelpayouts cached-fares adapter, and a rule-based trip planner. 

## Phases 7 and 8: what shipped
- **Extension** (`extension/`): MV3, `activeTab` only, preview-then-approve fill, strict safety rules, allowed-sites list, 30-minute in-memory data. Export from the web app's Assistant page. Server-side Playwright automation of third-party portals was deliberately not built: it would invite terms-of-service and anti-bot problems for no user benefit. Playwright is used for testing this product.
- **Pages completed**: notifications and dashboard (derived from account data, with loading and empty states), help center, privacy and terms templates, fuller admin dashboard (aggregate counts only).
- **Hardening**: see SECURITY_REVIEW.md (admin takeover fixed, role read from the database, trust proxy, password policy, health-check bug, error handling).
- **Testing**: unit and API tests, extension core tests, Playwright journeys, axe accessibility on every page, mobile overflow checks.
- **Performance**: first load is about 112 KB gzipped JavaScript plus 6 KB CSS; PDF generation (~171 KB gz), maps (~42 KB gz) and OCR load only when used.

## Hotel directory, budget and handoff
Hotels are now a real directory (OpenStreetMap) with partner price links and an optional Stay22 live-price map, replacing the removed demo offers. Trip budget (expenses per trip, per currency) replaces the sample dashboard budget. Booking handoff bridges partner click-throughs to recording what you booked. Insurance quotes and real booking/payment remain out of scope: they need licensed providers.

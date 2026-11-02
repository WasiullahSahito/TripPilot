# Cost breakdown

Figures are indicative and change: confirm on each vendor's pricing page before committing.

## Free (no card, no subscription)

| Item | Notes |
|---|---|
| Source code, all tests, local development | Everything runs locally with local-file storage. |
| OpenStreetMap tiles, Nominatim search, OSRM directions | Free for **light, user-driven** use under their usage policies; no SLA. |
| Tesseract.js (passport and document OCR) | Runs in the browser; downloads about 10 MB of data on first use. |
| Travelpayouts / Aviasales Data API | Free token; cached fares only. |
| Partner affiliate programmes (Skyscanner, WayAway, Agoda, Booking.com, Stay22, Ekta, Discover Cars, Viator, GetYourGuide, Airalo, AirHelp) | Free to join; they pay **you** commission. Some need approval and traffic. |
| Supabase Free | About 500 MB database, ~1 GB file storage, 2 projects; **pauses after about a week without activity**. |
| Vercel Hobby | Free but **personal, non-commercial use only**. |

## Required once you earn money or have real users

| Item | Approx. cost | Why |
|---|---|---|
| Vercel Pro | about $20 per user per month | Commercial use (affiliate commission counts). |
| Supabase Pro | $25 per month | No pausing, more storage and egress, backups. |
| Domain name | about $10-15 per year | Custom address. |
| Transactional email (Resend, Postmark, SES) | free tier then about $0-20 per month | Verification and password-reset emails (not built yet). |
| LibreTranslate software | No paid API key when self-hosted | Local development uses your own computer; production needs an always-on host and bandwidth, which may have a hosting charge. |
| ClamAV host (only if you want real malware scanning) | about $5-10 per month | A small always-on VPS running clamd (needs roughly 1-2 GB of RAM for its signature database). |
| Chrome Web Store developer account | one-time fee (about $5) | Only if you publish the browser assistant. |
| Legal review of privacy policy and terms | one-off, varies widely | Passports are sensitive data. |

## Possible later costs

| Item | Notes |
|---|---|
| Hosted map tiles/geocoding/routing | If you outgrow OpenStreetMap's free policy (many providers have free tiers). |
| Rate-limit store (Upstash Redis) | Free tier covers a small site. |
| Live booking/ticketing APIs, insurer APIs, payment processing | Licensing, approval and transaction fees; not built. |
| Error monitoring (Sentry etc.) | Free tiers exist. |

## Rough monthly totals

- **Private trial** (invited testers, nothing earned): **$0**.
- **Small live site** (affiliate income, a few hundred users): about **$45-60 per month** (Vercel Pro + Supabase Pro + domain/email), plus optional translation hosting.

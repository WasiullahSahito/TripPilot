# Partner integrations: what is built and what each needs

Principle: money-making links must be honest. We never claim a partner is "the cheapest", never show partner prices we do not have, and mark affiliate links `rel="sponsored"` with a visible disclosure. Search and result pages never present partner data as TripPilot's own bookings.

| Partner | Role | Status in this code | What you need |
|---|---|---|---|
| **Aviasales / WayAway (Travelpayouts)** | Flights | **Live adapter written** (cached cheapest fares via the free Aviasales Data API, `server/src/integrations/travelpayouts.ts`). Not verified against the live API. Plus outbound links. | Free Travelpayouts account, API token and marker. Fares are cached (about 48 hours) and may differ from live. WayAway has no public search-URL format here, so it is link-template only. |
| **Skyscanner** | Flights | Outbound **search link** only. | Skyscanner's API is gated behind manual approval (traffic and purpose reviewed), so an "API integration" is not possible without their approval. Affiliate links via their programme/Travelpayouts. ([overview](https://www.travelpayouts.com/blog/skyscanner-flight-affiliate-program/amp/)) |
| **Agoda** | Hotels | Outbound link (homepage; template for tracked deep links). | Agoda's affiliate API needs partner approval. Set `VITE_AFF_AGODA_URL` from their dashboard. |
| **Booking.com + Stay22** | Hotels | Booking.com property search links with your dates. **Stay22 live-price map embedded** when `VITE_STAY22_AID` is set (parameters per Stay22's docs: aid, lat/lng, check-in/out; guest count omitted as unverified). | Free Stay22 account and affiliate id; Booking.com affiliate id. |
| **Discover Cars** | Car rental | Outbound link. | Affiliate programme (via Travelpayouts or direct). No public search API is used. |
| **Ekta** | Insurance | Outbound link on the insurance page. | Ekta is a Travelpayouts programme (about 20% commission per their listing). Whether a policy meets an embassy's requirement is up to that embassy; we make no such claim. |
| **Viator / GetYourGuide** | Activities | Outbound search links. | Partner approval for their APIs; affiliate templates for tracking. |
| **Airalo** | eSIM | Outbound link. | Partner/affiliate approval for the API. We do not sell eSIMs or take payment. |
| **AirHelp** | Flight compensation | Outbound link with an honest explanation. | Affiliate programme. We cannot assess or file claims. |

## Making links earn

Each partner gives you a tracked URL. Put it in `VITE_AFF_<PARTNER>_URL`, using placeholders from `src/features/affiliate/links.ts` (`{origin}`, `{destination}`, `{departYYMMDD}`, `{city}`, `{checkin}` ...). With no template set, a plain untracked link is used (earns nothing but still works).

## Why some things were not done

- **Unofficial `google-translate-api` wrapper**: not used. It scrapes Google, breaches its terms, breaks without warning and would send document text to a third party. Use LibreTranslate (self-hosted) instead.
- **"Real prices from Skyscanner/Agoda/Viator/GetYourGuide/Airalo APIs"**: these require partner approval and credentials we cannot obtain. The adapter interfaces in `src/services/` and `server/src/integrations/providers.ts` are where a live implementation plugs in once you are approved.
- **Marketing claims** such as "cheapest in the world" or "visa-approved insurance from $1/day" are not made anywhere in the app; they are not verifiable and can breach advertising rules.

## Hotel directory (OpenStreetMap)

The Hotels page lists real properties from OpenStreetMap through the Overpass API (server-side, cached 6 hours, identified by User-Agent). It has **no prices, availability or reviews**: those exist only at booking partners, so every property links to Booking.com / Agoda searches and, with a Stay22 id, a live-price map. The public Overpass server is for light use; for heavy or commercial traffic set `OVERPASS_URL` to your own or a paid instance. Property data is mapped by volunteers: stars and websites are missing for many places. Data (c) OpenStreetMap contributors (ODbL).

## What cannot be built without a licensed provider

Insurance quotes and purchase, flight/hotel booking, payment and ticket issue all need a licensed insurer, airline or OTA connection (or an approved partner API). Generating them locally would mean inventing prices and confirmations, which TripPilot refuses to do. Instead it links to partners and records what you book (Booking history, with the confirmation reference you enter).

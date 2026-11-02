# Reviewing destination visa guidance

TripPilot's checklists are a **general organiser, not an official rules engine**. Nobody can honestly promise they match every authority's current requirements, because the rules differ by nationality and change without notice. What the platform can do is make clear which destinations a person has actually checked, and when.

## What the code does
- Every destination shows a status in the visa workspace: **Not reviewed** (the current state of every destination), **Reviewed** (a named person compared it with the official pages within the last 90 days), or **Out of date** (reviewed, but more than 90 days ago).
- Admins see the totals (reviewed / out of date / never reviewed) on the admin Overview, with a list of destinations.
- `npm run check:links` opens every official link and reports which are dead or cannot be checked automatically. It checks links, **not** whether the guidance is correct.
- Review records live in [`src/features/visa/review.ts`](../src/features/visa/review.ts) (the `reviews` object). A test rejects malformed records (bad or future dates, missing reviewer, non-https sources, unknown destinations).

## How to review one destination
1. Pick the destination and note the nationalities you are covering (rules vary by passport).
2. Open each official link listed for it and the pages it links to for visitors / business / study / work.
3. Compare, item by item, with `src/features/visa/destinations.ts`:
   - the document checklist (required vs optional) and anything missing,
   - passport validity and the insurance requirement,
   - category names and who needs a visa at all,
   - the notes and the official link itself.
4. Fix anything that differs in `destinations.ts`. If you are unsure, remove the claim rather than guess.
5. Record the review:
   ```ts
   reviews.france = {
     lastReviewed: '2027-02-14',
     reviewedBy: 'Your Name',
     sources: ['https://france-visas.gouv.fr/...'],   // the exact pages you compared
     notes: 'Checked for Indian citizens, short-stay tourism.',
   }
   ```
6. Run `npm test` and commit. Repeat at least every 90 days (the app shows "Out of date" after that).

## What a review does not mean
It is not legal advice and not a guarantee. The product still tells users to confirm everything on the official site, and that never changes. Get a lawyer or an immigration professional to sign off before marketing any destination as "verified".

## Link check results (last run)
Run on 2026-10-19 against 63 official links: 52 opened, 9 could not be verified automatically (the sites block automated requests, time out, or have certificate chains Node cannot verify), and 2 looked dead: **Comoros** (connection refused) and **Libya** (address does not resolve). Open the unverified ones in a browser and fix or remove any that are wrong. Re-run `npm run check:links` after changes.

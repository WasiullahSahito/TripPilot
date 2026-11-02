# 14-day trial test plan

> The brief contained only the heading for this item, so this plan is a proposal. Adjust the numbers to your goals.

**Goal**: find out whether the product is safe, understandable and worth continuing, using free tiers only, with **5-15 invited testers** (friends, colleagues, a few real travellers). No public launch, no paid traffic, no earnings (this keeps the Vercel Hobby plan within its non-commercial terms).

**Before day 1 (setup gate)**: Supabase project and migrations applied; Vercel preview deployed; secrets set; contract test passes against a Supabase test project; a preview deploy confirms signed URLs, uploads and login work; a visible "Trial" banner and a privacy notice say that data may be deleted after the trial.

| Days | Focus | Tasks | Pass criteria |
|---|---|---|---|
| 1 | Smoke test | Register, onboard, create a trip, log out/in, delete a test account | No errors; export and deletion work; deleted files no longer open |
| 2-3 | Security checks (you) | Try opening another user's document URL; reuse an expired signed URL after 6 minutes; upload a renamed `.exe` as `.pdf`; upload 5 MB; hit login repeatedly | All blocked or rejected; no private file reachable without a valid link |
| 3-4 | Passport OCR | 10+ real passport photos in varied lighting/angles (testers' own, on their own device) | Check digits verify on at least 7 of 10 good photos; a failed check always shows the warning; confirm in DevTools Network that **no request carries the image** |
| 5-6 | Visa workflow | Testers prepare an application for two destinations, save, return next day, download the summary PDF | Draft resumes; PDF opens; checklists match the official site for those two destinations (review manually) |
| 7 | Documents and PDF package | Build a package with mixed PDFs, photos and a corrupt file | Package builds; the corrupt file is reported and skipped; user-entered sample plans are labelled, never "confirmed" |
| 8-9 | Flights, hotels, insurance | Search 5 routes; compare provider fares with partner sites; confirm hotel search reports unavailability until a provider is connected; click through insurer links | No generated offers appear; cached flight data is clearly identified and verified with the partner; unavailable providers show an explicit error; disclosures are visible |
| 10 | Appointments, maps, translation | Record appointments in each status; export `.ics` into a calendar; run 10 map searches; translate 5 documents, including one with MRZ text | Status rules hold; calendar imports; MRZ is blocked from translation; map attribution is shown |
| 11 | Accessibility and mobile | Keyboard-only run through sign-up and visa form; screen reader spot check; test on a phone | No keyboard traps; focus visible; forms usable at 375px |
| 12 | Limits | Check Supabase usage (DB, storage, egress), Vercel function logs, Travelpayouts API responses | Usage under 50% of free limits; no repeated 5xx |
| 13 | Feedback | 15-minute call or form with each tester: what confused you, what would you pay for | At least 8 completed responses |
| 14 | Decide | Review metrics and bugs; delete all test data; export a report | Go / fix / stop decision recorded |

## Metrics to record
- Task completion (registered > trip > visa draft > PDF) and time taken.
- OCR success rate (check digits verified) by device and lighting.
- Errors per 100 requests (Vercel logs), slowest endpoints, cold-start delay.
- Storage used per user; projected users on 1 GB.
- Partner link clicks (only if you add analytics, with consent) and tester trust ratings (1-5) of the "planned vs confirmed" labels.

## Stop conditions (end the trial early)
- Any exposure of one user's document to another user.
- A private file reachable without a valid signed URL.
- Supabase paused mid-trial and data lost (check before you begin: free projects pause after about a week idle, so keep testers active or use the Pro plan).

## After the trial
Delete all tester data and files, rotate `JWT_SECRET` and the service-role key, and decide on: Vercel Pro and Supabase Pro for launch, legal review of privacy policy and terms, retention rules, and the partner approvals you still need.

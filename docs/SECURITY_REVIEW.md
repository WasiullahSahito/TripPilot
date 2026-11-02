# Security review (Phase 8)

Scope: the API, data layer, authentication, uploads, the web app, the browser extension, and deployment configuration. Method: code review, targeted tests, browser end-to-end tests with axe accessibility scans. This is a self-review, **not** an independent penetration test: get one before handling real passports.

## Findings and status

| ID | Severity | Finding | Status |
|---|---|---|---|
| F1 | **High** | Whoever registered the `ADMIN_EMAIL` address first became admin without proving they own it (account takeover of the admin role). | **Fixed.** Registration never grants admin; the role is granted only when that address's verification link is used. Tests: `hardening.test.ts`. |
| F2 | Medium | The admin role was copied into the session token, so demotion would not take effect until the token expired. | **Fixed.** `requireRole` reads the role from the database on each request; revocation is immediate (tested). |
| F3 | Medium | No `trust proxy` setting behind Vercel: all clients would share one IP for rate limiting. | **Fixed** (`trust proxy` = 1 in production). |
| F4 | Low | Weak passwords (common, repeated characters, containing the email name) were accepted. | **Fixed** (policy plus server field errors now shown in the form). |
| F5 | Medium | Supabase health check used HEAD/count requests, which report **no error for a missing table**, so a broken database looked healthy. | **Fixed.** Checks now use normal selects and report missing tables, wrong key, and a public bucket. |
| F6 | Low | Oversized uploads and malformed JSON returned HTTP 500 instead of 413/400. | **Fixed** (found by the signed-URL tests). |
| F7 | Low | Unexpected errors logged only their type, which hid real faults in development. | **Fixed.** Development logs message and stack; production still logs the type only. Database errors log code and message without row details. |
| F8 | Info | Onboarding Continue/Finish reused one button and flipped its type, so one click on Continue could submit the form early. | **Fixed** (found by Playwright). Not a security issue but a data-integrity one. |

Reviewed and found acceptable: password hashing (bcrypt cost 12), constant-time-ish login (dummy hash for unknown emails), cookie flags (`HttpOnly`, `SameSite=Lax`, `Secure` in production), origin check on state changes, zod validation on every body, per-user scoping on every query (cross-user access returns 404, tested), file validation by content signature, sanitised filenames and `attachment` downloads with `nosniff`, encryption of application data at rest, short-lived signed URLs, private bucket plus row-level security with no public policies, CORS limited to the exact client origin, passport text blocked from third-party translation.

## Browser extension threat model

- Runs only when the user clicks it; nothing is injected automatically and there are no host permissions (`activeTab` only).
- Page content is untrusted: labels and names are rendered with `textContent`, never HTML. Messages are accepted only from the extension itself.
- Personal data is held in `chrome.storage.session` (memory, trusted contexts only), expires after 30 minutes, is validated strictly on load (unknown keys dropped, size limits) and is removed by an alarm.
- It never clicks, submits, or fills password, file, payment, one-time-code, CAPTCHA or hidden fields; those rules are re-checked at fill time, and every value needs the user's approval in a preview.
- Residual risk: a malicious page could mimic ordinary-looking fields to receive approved values. The preview shows every value and its target field, and an allowed-sites list limits where the assistant runs.

## Open items (not fixed)

1. **No password reset, email delivery, or 2FA.** Verification links print to the server log in development.
2. **Registration reveals whether an email exists** (409). Fixing it properly needs email delivery.
3. **Sessions cannot be revoked before the 7-day expiry** (logout only clears the cookie).
4. **Rate limits are per serverless instance** (memory). Use Vercel Firewall or a shared store for real enforcement.
5. **CSP is in report-only mode** (`vercel.json`); validate it on a preview deploy, then switch to `Content-Security-Policy`.
6. **No malware scanning** of uploads; retention for stored documents is "until deleted".
7. **Supabase and Vercel code paths are unverified** against live projects; run the contract tests and a preview deploy.
8. **Tesseract and OpenStreetMap load from third-party hosts** unless self-hosted.
9. **JWT secret rotation, audit logging, and admin action history** are not implemented.
10. Legal documents are templates; passports are special-category data in many jurisdictions.

## Automated coverage that supports this review

Server integration tests (auth, ownership, uploads, signed URLs, integrity rules, admin role, CORS, translation guard), extension core tests (payload validation, safety rules, matching, fill behaviour), and Playwright journeys including axe scans of every page at WCAG 2.1 A/AA (serious and critical findings fail the build) and a 375 px no-horizontal-scroll check.

## Addendum: hotel directory, expenses and booking handoff

- **Hotel directory proxy**: authenticated, rate limited (10/min), coordinates and radius validated and bounded, upstream timeout, results cached 6 hours, only `http(s)` website links returned (a `javascript:` or `ftp:` value from OpenStreetMap is dropped; a bug that turned `ftp://` into a bogus `https://` URL was found by a test and fixed). Property names and addresses are volunteer-edited text, rendered as text only.
- **Stay22 iframe**: third-party content in a sandboxed frame; affiliate id is public by design. CSP `frame-src` allows only that host (report-only mode).
- **Expenses**: every query is scoped to the user; a `tripId` must be one of the caller's own trips (tested); amounts are validated server-side (positive, 2 decimals, bounded); PATCH changes only fields that were sent (a default-reset bug was prevented by a test); money is summed in integer cents and never converted between currencies.
- **Booking handoff**: a note in `sessionStorage` (this tab, 24 hours) with title, dates and partner name only. It creates nothing by itself and can never produce a confirmed booking.
- **React StrictMode bug** in the new hotels page (results silently dropped after the first search in development) was found by the browser tests and fixed.

## Addendum: admin tools, scanning, retention, direct uploads

- **Sessions now die with the account.** Previously a deleted account's login cookie kept working until it expired (7 days). A guard now checks every request that carries a session, so deleting or disabling an account ends it at once on that server instance and within about 10 seconds on others (a small per-instance cache avoids a database read per request). A bug where login tokens were accepted without a role was also closed: only tokens that carry `user` or `admin` count.
- **Admin visibility is deliberately narrow:** accounts only. Viewing the user list is audited. Admins cannot disable themselves or other admins, which prevents lock-out and stops one compromised admin from silencing the others.
- **Audit log hygiene:** ids and small flags only; emails are resolved when read; failed sign-ins are recorded only for real accounts (an attempt on an unknown address writes nothing); the log survives deletion of the people it mentions.
- **Disabled-account messaging:** the "this account is disabled" message appears only after the correct password is given, so it cannot be used to discover which emails have accounts.
- **Upload scanning:** structural checks reject scripted PDFs, appended payloads, truncated files and decompression bombs. **This is not antivirus.** PDFs can hide objects in compressed streams, which the built-in check cannot see. Real detection needs ClamAV (`CLAMD_HOST`), which is untested against a real clamd here (the client speaks the documented INSTREAM protocol and is tested against a fake server).
- **Direct uploads:** a separate signing key and audience for upload tickets, bound to the user and valid 15 minutes; files stay in a `pending/` area and are never visible as documents until they pass the same type and malware checks as small uploads; failures delete the file. Verified against a live Supabase project (signed URL, upload, read-back, size guard, commit, single-use link, sweep).
- **Retention job** runs only for users who opted in, deletes the file before the record (so a storage failure is retried, never orphaned), and records counts only. The cron endpoint does not exist without `CRON_SECRET` and compares the secret in constant time.
- **A real data-loss bug was prevented:** saving the profile form used to rebuild the whole profile and would have wiped the retention choice; a test now covers it.
- **Still open:** no ClamAV by default, no malware scan of files already stored before this change, retention does not cover the browser's in-memory copies, the audit log is not tamper-evident (an administrator with database access can edit it), admins cannot be demoted from the UI.

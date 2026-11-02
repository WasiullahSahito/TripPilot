# API reference

Base path `/api`. JSON in and out unless stated. Authentication is an httpOnly session cookie (`tp_session`) set by register/login. Errors: `{ "error": "message" }`, and validation errors add `"fields": { "<field>": "message" }`. Status codes: 400 invalid input, 401 not signed in, 403 forbidden, 404 not found (also used for other users' records), 409 conflict, 413 too large, 415 unsupported file type, 422 refused, 429 rate limited, 501 integration not configured, 502/503 upstream or database failure.

State-changing requests from a browser must come from the configured `CLIENT_ORIGIN`. Uploads are limited to **4 MB**; only PDF, PNG and JPEG are accepted (identified by content, not the declared type).

| Method and path | Auth | Notes |
|---|---|---|
| `GET /health` | no | `{ ok: true }` |
| **Auth** | | |
| `POST /auth/register` | no | `{ name, email, password }`; password 10+ chars, not common, not containing the email name. Rate limited. Never grants admin. |
| `POST /auth/login` | no | `{ email, password }`. Rate limited. |
| `POST /auth/logout` | no | Clears the cookie. |
| `POST /auth/verify-email` | no | `{ token }`. Grants admin only if the verified address equals `ADMIN_EMAIL`. |
| `GET /auth/me` | yes | `{ user, profile }` |
| **Account settings** | | |
| `PATCH /account/name` | yes | `{ name }`, updates the signed-in user's display name. |
| `POST /account/password` | yes | `{ currentPassword, newPassword }`; verifies the current password and enforces the account password policy. Rate limited. |
| **Profile and trips** | | |
| `PUT /profile` | yes | `{ nationality, residenceCountry, homeAirport, interests[] }`; marks onboarding complete. |
| `GET /trips`, `POST /trips` | yes | Trip `{ destination, departOn, returnOn, purpose, budget }`; return must not precede departure. |
| `PATCH /trips/:id`, `DELETE /trips/:id` | yes | Status: `planning`, `ready`, `completed`. |
| **Visa** | | |
| `GET /visa/applications`, `GET /visa/applications/:id` | yes | Data is decrypted for its owner only. |
| `PUT /visa/applications` | yes | Upsert by `(destinationId, categoryId)`: `{ destinationId, categoryId, nationality, residence, status, checklist, data }`. Status: `draft`, `ready`, `submitted_on_portal` (self-reported). Data is AES-256-GCM encrypted at rest. |
| `DELETE /visa/applications/:id` | yes | Also removes its documents and files. |
| `POST /visa/applications/:id/documents?itemId=&filename=` | yes | Raw file body. |
| `GET /visa/documents/:id`, `DELETE /visa/documents/:id` | yes | Download redirects (302) to a 5-minute signed URL when using Supabase Storage. |
| **Bookings** (flight, hotel, insurance) | | |
| `GET /bookings`, `POST /bookings`, `DELETE /bookings/:id` | yes | Body `{ kind, status, source, title, startDate, endDate, confirmationRef, details }`. Rules: `source` is `demo` or `user-entered` only; demo data must be `sample` with no reference; `confirmed` requires a user-supplied `confirmationRef`; `sample` never has one. |
| `POST /bookings/:id/documents?filename=` | yes | Raw file body. |
| `GET /bookings/documents/:docId` | yes | Download. |
| **Appointments** | | |
| `GET /appointments`, `POST /appointments` | yes | `{ destinationId, center, type, startsAt (YYYY-MM-DDTHH:mm), preferredTimes, status, officialRef, reminderDays, notes, checklist }`. `confirmed` requires `officialRef`; other statuses must not have one. |
| `PATCH /appointments/:id`, `DELETE /appointments/:id` | yes | Same rules on update. |
| `POST /appointments/:id/documents?filename=` | yes | Raw file body. |
| **Documents** | | |
| `GET /documents` | yes | Everything uploaded, with owner kind (`visa`, `flight`, `hotel`, `insurance`, `appointment`). |
| `GET /documents/:id/url` | yes | `{ url, signed, expiresInSeconds }`: a short-lived signed URL, or the authenticated API path locally. |
| `GET /documents/:id/file` | yes | Stream or redirect, as above. |
| **Providers and tools** | | |
| `POST /flights/search` | yes | `501` until a live provider is registered. Flights can use `TRAVELPAYOUTS_TOKEN` for cached fares. The client surfaces unavailable-provider errors and never substitutes generated offers. |
| `POST /translate` | yes | `{ text (<=5000), source ('auto' or code), target }`. Proxy to LibreTranslate; `501` if not configured; `422` for passport-like (MRZ) text. Rate limited. |
| **Account and admin** | | |
| `GET /account/export` | yes | JSON of everything held (no password hash). |
| `DELETE /account` | yes | Deletes all data and stored files, clears the session. |
| `GET /admin/stats` | admin | Aggregate counts only. Role is read from the database on every call. |

### Hotel directory and expenses

| Method and path | Auth | Notes |
|---|---|---|
| `GET /hotels/directory?lat=&lng=&radius=` | yes | Real accommodation near a point from OpenStreetMap (Overpass): `{ listings[], cached, source, notice }`. Radius 500 to 15000 m (default 5000). **No prices, ratings or availability.** Cached per instance for 6 hours; rate limited (10/min); `503` when the upstream is busy. |
| `GET /expenses[?tripId=]` | yes | Newest first. |
| `POST /expenses` | yes | `{ tripId?, category, description?, amount, currency, spentOn, status }`. Amount > 0, at most 2 decimals; currency is a 3-letter code; `tripId` must be one of the caller's own trips. No exchange rates are applied anywhere. |
| `PATCH /expenses/:id`, `DELETE /expenses/:id` | yes | Only the fields sent are changed. Deleting a trip keeps its expenses, unlinked. |

### Admin, uploads, retention (added later)

| Method and path | Auth | Notes |
|---|---|---|
| `GET /admin/users?query=&limit=&offset=` | admin | `{ users[], total }`: id, name, email, role, emailVerified, disabled, createdAt. No documents or application data. The view is itself written to the audit log. |
| `POST /admin/users/:id/disable`, `POST /admin/users/:id/enable` | admin | Disabling blocks sign-in and ends existing sessions (within seconds across serverless instances). Refuses to disable yourself or another admin. Idempotent. |
| `GET /admin/audit?limit=&offset=&action=` | admin | Newest first. Entries hold ids and small flags only; emails are resolved at read time (`(deleted account)` if gone). |
| `POST /uploads/init` | yes | `{ kind: visa\|booking\|appointment, ownerId, itemId?, filename, size }`. With Supabase Storage returns `{ direct: true, documentId, uploadUrl, ticket, maxBytes }`: PUT the file (multipart, field name empty, plus `cacheControl`) to `uploadUrl`. With local storage returns `{ direct: false, maxBytes }`. Use for files over 4 MB. |
| `POST /uploads/finalize` | yes | `{ ticket }`. Downloads the pending file, checks type and scans it, then files it permanently, or deletes it and returns 413/415/422. Repeating it is safe. The ticket is signed with a separate key, valid 15 minutes, bound to the user. |
| `PATCH /profile/retention` | yes | `{ days: 30\|60\|90\|180\|365\|null }`: opt in or out of automatic file deletion. |
| `GET /cron/retention` | Bearer `CRON_SECRET` | Runs the deletion job (and clears abandoned pending uploads). 404 when `CRON_SECRET` is not set. Called daily by Vercel Cron. |

Upload errors: `415` wrong type, `413` too large, `422` refused by the scan (message says why), `503` virus scanner configured but unreachable (uploads are refused by default).

# Security and privacy checklist (passports and IDs)

## Implemented
- [x] **HTTPS everywhere**: Vercel terminates TLS; HSTS header set in `vercel.json`; session cookie is `Secure` in production, `HttpOnly`, `SameSite=Lax`.
- [x] **Passport photos are not uploaded for reading.** OCR runs in the browser (Tesseract.js). The image lives in memory and an object URL; both are released when the user applies the result or clicks Clear. There is no server copy to delete.
- [x] **Private storage**: stored documents go to a private Supabase bucket; the browser receives only 5-minute signed URLs, minted after an ownership check.
- [x] **Delete on request**: deleting a document, application, booking, appointment or the account removes the stored files as well as the database rows.
- [x] **Encryption at rest** of visa application form data (AES-256-GCM, server-held `DATA_KEY`) in addition to the provider's disk encryption.
- [x] **Content-based upload validation** (PDF/PNG/JPEG signatures), 4 MB cap, sanitised file names, `X-Content-Type-Options: nosniff`, downloads as attachments.
- [x] **Access control**: every data route requires a session and is scoped to the user; cross-user access returns 404 (tested).
- [x] **Database defence in depth**: row-level security on every table with no public policies; CHECK constraints mirroring the "never fabricate a confirmation" rules.
- [x] **Third-party privacy**: passport MRZ text is blocked from translation (client and server). Translation goes only to the server you configure.
- [x] Rate limits (per instance), input validation (zod), no personal data in error logs, data export and account deletion.

## Gaps and decisions for you
- [ ] **"Auto-delete the photo after reading"**: satisfied by not uploading it. If you later add server-side scanning, delete the object immediately after the transaction and add a scheduled sweep for orphans.
- [ ] Stored supporting documents are **kept until the user deletes them** (they are needed to build the PDF package). Decide on a retention period (for example auto-delete 30 days after the trip) and implement a scheduled job (Vercel Cron).
- [ ] Malware scanning of uploads is not implemented.
- [ ] Rate limiting is per serverless instance (see INFRASTRUCTURE.md).
- [ ] No password reset, no email delivery (verification links print to the server log in development), no 2FA, no session revocation.
- [ ] Privacy policy, terms and cookie notice are placeholders. Passports are special-category data in many jurisdictions (GDPR and others): get legal review, appoint a contact, and document the lawful basis before real users.
- [x] **Self-hosted OCR assets**: the build copies the Tesseract worker, WebAssembly cores and supported language models into the same-origin `public/tesseract` directory. OCR does not need a third-party asset host.
- [ ] The service-role key bypasses RLS: keep it server-side, rotate it if it ever leaks, and never prefix it with `VITE_`.

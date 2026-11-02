# Publishing the browser assistant to the Chrome Web Store

**What is ready:** the extension builds, passes its tests, has real icons, and `npm run package:extension` produces the upload file (`extension/trippilot-assistant-<version>.zip`). The packaging command refuses to build a ZIP that has extra permissions, host access, auto-run scripts, or source maps.

**What only you can do:** create the developer account (one-time registration fee, currently about US$5), submit the listing, and wait for Google's review, which can take days and may ask questions. Nothing in this repository publishes anything.

## Steps
1. Register at the [Chrome Web Store developer dashboard](https://chrome.google.com/webstore/devconsole) (verified email; 2-step verification is required; a trader/non-trader declaration applies).
2. `npm run package:extension`, then upload the ZIP as a new item.
3. Fill the listing from the text below. Add at least one 1280x800 (or 640x400) screenshot: the popup showing a preview on the bundled `extension/test-page/form.html`, never real personal data.
4. Host the privacy policy at a public URL and enter it (the web app's `/privacy` page has a "Browser assistant" section: replace the bracketed placeholders and have it reviewed first).
5. Answer the privacy questionnaire (below), choose visibility (start with **Unlisted** or **Private** to test with a few people), submit for review.
6. For each update, raise `version` in `extension/manifest.json`, repackage, upload.

## Listing text (adapt freely)
- **Name:** TripPilot Browser Assistant
- **Summary (max 132 chars):** Copy details you approve from TripPilot into visa forms. Never submits, never touches passwords, payments or CAPTCHAs.
- **Single purpose:** Help a user fill the fields of an online visa application form with their own details from a file exported from TripPilot, after the user reviews and approves every value.
- **Description:**
  Fill in long visa forms faster, without giving anyone control. Export your prepared application from TripPilot, load the file into the extension, press "Scan this page", review what it would type into each field, tick what you want, and press Fill.

  You stay in control: nothing runs until you click, nothing is typed until you approve it, and the extension never submits a form, clicks a button, solves a CAPTCHA, or touches password, card, security-code, one-time-code or file-upload fields. Your details are kept in memory only, expire after 30 minutes, and never leave your computer. You can limit it to sites you allow and teach it where a field belongs on a site you use.

  This extension is not affiliated with any government. Always check each value yourself and complete submission, consent and payment on the official site, and only use it where the site's terms allow assisted form entry.

## Permission justifications (the dashboard asks for each)
| Permission | Why it is needed |
|---|---|
| `activeTab` | Gives temporary access to the tab the user is on, only after they click the extension, so it can read form field labels and fill approved values. It avoids broad "all websites" access. |
| `scripting` | Injects the small field-scanning/filling script into that one tab when the user presses "Scan this page". |
| `storage` | Keeps the user's exported details in memory-only session storage (cleared when the browser closes or after 30 minutes), plus the user's allowed-sites list and any field pins they taught (selectors only). |
| `alarms` | Runs a once-a-minute timer in the background to delete expired exported details. |

No host permissions, no remote code (all code is in the package), no content scripts that run automatically, no analytics, no network requests.

## Privacy practices questionnaire (suggested answers: check against the current form)
- **Handles personally identifiable information / authentication / financial / health / location / web history / user activity / website content:** it handles *personally identifiable information* the user supplies (name, date of birth, passport details, contact details) and reads the *labels of form fields* on the page the user chooses. It does not collect authentication or financial data (it refuses those fields), health, location, web history or activity.
- **Is data transmitted off the user's device?** No. The extension makes no network requests.
- **Is data sold, used for unrelated purposes, or used for creditworthiness/lending?** No.
- **Certify the three "Limited Use" statements:** yes, if the above stays true.

## Notes for the reviewer (paste into "test instructions")
> The extension needs a JSON file exported from the TripPilot web app, which needs an account. To test without one, use the sample file below and the included test page `test-page/form.html` (open it in Chrome). Click the extension, load the sample file, press "Scan this page", review the preview, tick fields and press Fill. Password, card, captcha and file fields on the page are deliberately left untouched.

Provide a sample export (fictional data only, `expiresAt` far in the future for the review period; the extension rejects expired files, so generate a fresh one before submitting):

```json
{ "app": "trippilot", "version": 1, "createdAt": "2027-01-01T00:00:00Z", "expiresAt": "2027-01-01T00:30:00Z", "destination": "Test",
  "fields": { "applicant.givenNames": "Alex", "applicant.surname": "Example", "applicant.dateOfBirth": "1990-01-31", "passport.number": "X1234567", "applicant.email": "alex@example.com" } }
```

(The extension enforces the 30-minute expiry, so the reviewer needs a freshly generated file. Easiest: give them a TripPilot demo login and tell them to use Assistant > Export.)

## Before you submit
- [ ] Privacy policy is live and reviewed by a lawyer (passports are sensitive).
- [ ] Screenshots contain no real personal data.
- [ ] You have tested the packaged ZIP by loading `extension/dist` unpacked in a clean Chrome profile.
- [ ] Support email and website entered; the description does not imply government affiliation.

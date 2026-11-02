# TripPilot Browser Assistant (optional Chrome extension)

Helps you copy details you approve from TripPilot into an official visa form. **Everything in TripPilot works without it.**

## What it does and does not do

- Runs **only** when you click the toolbar icon and press "Scan this page". Nothing is injected automatically; the only permissions are `activeTab`, `scripting`, `storage` and `alarms` (no host permissions).
- Suggests which exported value belongs in which field and shows a **preview** with every value editable. Only high-confidence, format-verified suggestions start ticked.
- **Never** submits a form or clicks anything. **Never** fills password, file-upload, card, security-code, one-time-code, CAPTCHA, hidden, disabled or read-only fields. The official site stays in charge of CAPTCHAs, consent, identity checks and payment.
- Has a **Stop** button, reports every field it filled, skipped or failed, and does not overwrite existing values unless you tick the option.
- Keeps your data in memory only (`chrome.storage.session`, trusted contexts only), expires it after 30 minutes, and makes no network requests.
- An **allowed-sites list** (Settings) makes it refuse other sites unless you tick "Use this site once". Only use it on sites whose terms allow assisted form entry.

## Install

```bash
npm run build:extension
```

Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, select `extension/dist`.

## Use

1. In TripPilot open **Assistant**, choose an application, and **Export for assistant** (a JSON file valid for 30 minutes; it contains passport details, so delete it afterwards).
2. Open the form page, click the extension, **Load export file**, then **Scan this page**.
3. Review the suggestions, edit or untick, then **Fill ticked fields**. Check every value yourself.
4. Complete any CAPTCHA, consent, verification and payment on the site.

Try it first on the harmless local form in `test-page/form.html` (open the file in Chrome, or serve it locally).

## Teaching it a site
No embassy or government portal is bundled, because none has been verified and their pages change without notice. Instead you teach the extension: after a scan, open **Teach this site**, choose which of your values belongs in a field it could not match, and press **Pin**. The pin is remembered for that website only (just the field's id or name, never your data), takes effect on your next scan, and can be exported, imported or removed in Settings. Pinned fields still go through the preview, and the safety rules still apply: a pin can never make it fill a password, payment, CAPTCHA or file field.

## Publishing
`npm run package:extension` builds the extension and writes `extension/trippilot-assistant-<version>.zip` for upload, refusing to package if permissions or manifest drift from the privacy promises. See [../docs/CHROME_WEB_STORE.md](../docs/CHROME_WEB_STORE.md) for the listing text, permission justifications and the privacy questionnaire. Publishing itself needs your developer account.

## Supported sites

Matching is label-based, so it works on many forms without per-site code. A **site adapter** (`src/core/adapters.ts`) pins fields with CSS selectors for a specific host. Only the local test form is bundled: **no real embassy or government portal is included**, because their markup changes without notice and none has been verified. Add adapters yourself after checking the site's terms.

## Development

Logic lives in `src/core/` (payload validation, safety rules, matching, DOM scan and fill) and is covered by `core.test.ts`. `popup.ts`, `options.ts`, `content.ts` and `background.ts` are thin wiring. Run `npm test` from the project root.

## Not covered by automated tests

The popup, options page and the real browser extension APIs (`chrome.*`) are not exercised automatically; the DOM logic is tested in jsdom against the bundled test form. Do a manual run on the test page after changes.

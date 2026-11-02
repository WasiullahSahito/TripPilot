import type { ReactNode } from 'react'

function Template({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <p role="note" className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <strong>Template, not legal advice.</strong> This text describes how the software behaves so you can adapt it. Before real users, have a lawyer review it for your jurisdiction (passports are special-category data in many places) and replace the bracketed placeholders.
      </p>
      <h1 className="text-3xl font-semibold">{title}</h1>
      <div className="prose-sm mt-6 space-y-6 text-sm leading-relaxed text-ink-soft [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-disc">
        {children}
      </div>
    </div>
  )
}

export function PrivacyPage() {
  return (
    <Template title="Privacy policy">
      <p>Last updated: [date]. Controller: [company name, address, contact email].</p>
      <section><h2>What we collect</h2><ul>
        <li>Account details: name, email, a salted hash of your password.</li>
        <li>Profile and trips: nationality, residence, home airport, interests, trip dates and budgets.</li>
        <li>Visa application data you enter, including passport details and dates of birth. It is encrypted before storage.</li>
        <li>Documents you upload (for example scans and reservations), stored privately.</li>
        <li>Bookings and appointments you record, including confirmation references you type in.</li>
      </ul></section>
      <section><h2>What stays on your device</h2><ul>
        <li>Photos you scan for passport text are read in your browser and are not uploaded.</li>
        <li>Notification dismissals are remembered in your browser (ids only).</li>
      </ul></section>
      <section><h2>How we use it</h2><p>To provide the service you asked for: saving your drafts, building your documents and showing reminders. We do not sell personal data and we do not use passport data for advertising.</p></section>
      <section><h2>Who we share it with</h2><ul>
        <li>Hosting and storage providers acting for us: [Vercel, Supabase: confirm and list regions].</li>
        <li>Optional services you choose to use: a translation server receives only the text you submit; map searches send your search terms to OpenStreetMap services.</li>
        <li>Partner sites you click through to (airlines, hotels, insurers, tour sellers). Their own privacy policies apply. Some links are affiliate links; we may earn a commission at no cost to you.</li>
      </ul></section>
      <section><h2>Browser assistant (optional Chrome extension)</h2><ul>
        <li>It only runs when you click it on a page and press "Scan this page". It reads the labels of that page's form fields and fills in values you approve.</li>
        <li>Your exported details are held in the extension's memory only (not written to disk), are deleted after 30 minutes or when you close the browser, and are never sent anywhere: the extension makes no network requests.</li>
        <li>If you teach it a site, it stores the website name and the id or name of the form fields you pinned (not your personal data) on your computer.</li>
        <li>It never fills password, card, security-code or file fields and never submits a form.</li>
      </ul></section>
      <section><h2>Uploaded files</h2><p>Files are checked for hidden scripts and malware indicators before they are kept. If you turn on automatic deletion in Settings, your uploaded files are deleted the chosen number of days after the related trip, booking or appointment. [State whether files are scanned by a third-party antivirus service, if you add one.]</p></section>
      <section><h2>Your rights</h2><p>You can export or delete your data at any time from Profile. [Add the rights and contact route required in your jurisdiction, for example access, correction, objection and complaint to a regulator.]</p></section>
      <section><h2>Retention and security</h2><p>Data is kept until you delete it or your account. [State any automatic deletion period.] Files are stored in a private bucket and opened only through short-lived links. No system is perfectly secure; tell us at [security contact] if you find a problem.</p></section>
    </Template>
  )
}

export function TermsPage() {
  return (
    <Template title="Terms of service">
      <p>Last updated: [date]. These terms are between you and [company name].</p>
      <section><h2>What TripPilot is</h2><p>A tool to help you prepare visa applications and plan travel. We are not a government agency, embassy, airline, hotel or insurer. We do not submit applications for you, decide visa outcomes, or guarantee that any information, checklist or partner listing is complete or current. The official website is always authoritative.</p></section>
      <section><h2>Sample data and confirmations</h2><p>Items labelled sample or demo are for planning only and are not bookings, tickets, policies or appointments. We never issue confirmation numbers. A booking or appointment is confirmed only by the provider.</p></section>
      <section><h2>Your responsibilities</h2><ul>
        <li>Give accurate information and check everything before you submit it anywhere.</li>
        <li>Use the browser assistant only on sites whose terms allow assisted form entry, and complete CAPTCHAs, consent and payment yourself.</li>
        <li>Do not misuse the service, attempt to access other people’s data, or upload unlawful files.</li>
      </ul></section>
      <section><h2>Partner links and fees</h2><p>Some outbound links are affiliate links. Purchases are made with the partner under the partner’s terms; we are not a party to them.</p></section>
      <section><h2>Liability</h2><p>[Add limitation of liability, governing law and dispute terms reviewed by your lawyer.]</p></section>
    </Template>
  )
}

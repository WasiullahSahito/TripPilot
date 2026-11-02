import type { FieldKey } from './payload'

/**
 * Site configuration. An adapter pins form controls to exported values with CSS selectors, which is more reliable
 * than guessing from labels. Add one only after checking that the site's terms allow assisted form entry.
 *
 * No real embassy or government portal is bundled: their markup changes without notice and we have not verified
 * any of them. Without an adapter the assistant falls back to label matching and always shows a preview first.
 */
export interface SiteAdapter {
  id: string
  name: string
  hosts: string[]
  hints: Partial<Record<FieldKey, string>>
  notes?: string
}

export const adapters: SiteAdapter[] = [
  {
    id: 'trippilot-test-form',
    name: 'TripPilot test form (extension/test-page/form.html)',
    hosts: ['localhost', '127.0.0.1'],
    hints: {
      'applicant.surname': '#surname',
      'applicant.givenNames': '#given',
      'passport.number': '#passport',
    },
    notes: 'Used to try the assistant safely on your own machine.',
  },
]

export function adapterFor(hostname: string): SiteAdapter | undefined {
  const h = hostname.toLowerCase()
  return adapters.find((a) => a.hosts.some((x) => h === x || h.endsWith(`.${x}`)))
}

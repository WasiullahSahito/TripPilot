import type { ChecklistItemDef, DestinationConfig } from './destinations'

const BASE: ChecklistItemDef[] = [
  { id: 'passport', label: 'Valid passport', description: 'Passport with blank pages and sufficient validity. Upload the photo page.', required: true },
  { id: 'photo', label: 'Passport-style photo', description: 'Recent photo meeting the destination’s specification.', required: true },
  { id: 'itinerary', label: 'Travel itinerary', description: 'Planned dates and places. A sample plan is fine for preparation; use a verified booking only if you actually have one.', required: true },
  { id: 'accommodation', label: 'Proof of accommodation', description: 'Hotel reservation or host details.', required: true },
  { id: 'funds', label: 'Proof of funds', description: 'Recent bank statements or equivalent.', required: true },
  { id: 'insurance', label: 'Travel insurance', description: 'Policy certificate, if required or recommended.', required: false },
  { id: 'employment', label: 'Employment or study letter', description: 'Shows ties to your home country.', required: false },
]

const BY_PURPOSE: Record<string, ChecklistItemDef[]> = {
  Business: [{ id: 'invitation-business', label: 'Business invitation letter', description: 'From the host company, stating purpose and dates.', required: true }],
  'Family visit': [{ id: 'invitation-family', label: 'Invitation and host’s ID copy', description: 'Letter from the person you are visiting and proof of their status.', required: true }],
  Study: [{ id: 'admission', label: 'Admission or enrolment letter', description: 'From the institution.', required: true }],
}

export interface ChecklistItem extends ChecklistItemDef {
  source: 'base' | 'purpose' | 'destination'
}

/** Resolve the checklist for a destination, category and trip purpose. Pure and config-driven. */
export function buildChecklist(dest: DestinationConfig, categoryId: string, purpose: string): ChecklistItem[] {
  const category = dest.categories.find((c) => c.id === categoryId)
  if (category?.purposes.includes('Employment')) {
    return [
      {
        id: 'work-route',
        label: 'Confirm the official work route and eligibility',
        description: 'Check the linked government authority for the route, eligibility, employer or sponsor rules that apply to your circumstances.',
        required: true,
        source: 'destination',
      },
      {
        id: 'work-document-list',
        label: 'Review the official document instructions',
        description: 'Use the authority’s current instructions as your document list. This workspace does not supply destination-specific work permit requirements.',
        required: true,
        source: 'destination',
      },
    ]
  }

  const items: ChecklistItem[] = BASE.map((i) => ({ ...i, source: 'base' as const }))

  const insurance = items.find((i) => i.id === 'insurance')
  if (insurance && dest.insuranceRequired) insurance.required = true

  for (const i of BY_PURPOSE[purpose] ?? []) items.push({ ...i, source: 'purpose' })
  for (const i of dest.extraChecklist) {
    if (!i.categories || i.categories.includes(categoryId)) items.push({ ...i, source: 'destination' })
  }
  return items
}

export function checklistProgress(items: ChecklistItem[], checked: Record<string, boolean>) {
  const required = items.filter((i) => i.required)
  const done = required.filter((i) => checked[i.id]).length
  return { done, total: required.length, complete: required.length > 0 && done === required.length }
}

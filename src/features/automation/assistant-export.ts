import { mergeFormData } from '@/features/visa/form-schema'
import type { ApplicationDto } from '@/features/visa/visa-api'

/** How long an exported file is valid for. Short on purpose: it contains passport details. */
export const EXPORT_VALID_MINUTES = 30

// Must stay in sync with extension/src/core/payload.ts (the extension validates strictly and drops anything else).
const KEYS = [
  'applicant.givenNames', 'applicant.surname', 'applicant.dateOfBirth', 'applicant.placeOfBirth', 'applicant.email', 'applicant.phone', 'applicant.address',
  'passport.number', 'passport.issuingCountry', 'passport.issueDate', 'passport.expiryDate',
  'travel.purpose', 'travel.arrivalDate', 'travel.departureDate',
  'accommodation.name', 'accommodation.address',
  'itinerary.plan',
] as const

export interface AssistantExport {
  app: 'trippilot'
  version: 1
  createdAt: string
  expiresAt: string
  destination: string
  fields: Record<string, string>
}

/** Flattens a saved application into the file the browser assistant reads. Empty values are omitted. */
export function buildAssistantExport(app: Pick<ApplicationDto, 'data'>, destinationName: string, now = new Date()): AssistantExport {
  const data = mergeFormData(app.data)
  const fields: Record<string, string> = {}
  for (const key of KEYS) {
    const [section, name] = key.split('.') as [keyof typeof data, string]
    const v = data[section]?.[name]?.trim()
    if (v) fields[key] = v
  }
  return {
    app: 'trippilot',
    version: 1,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + EXPORT_VALID_MINUTES * 60_000).toISOString(),
    destination: destinationName,
    fields,
  }
}

export function downloadExport(x: AssistantExport) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(x, null, 2)], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'trippilot-assistant.json'
  a.click()
  URL.revokeObjectURL(url)
}

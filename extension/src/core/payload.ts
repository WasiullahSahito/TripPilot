/**
 * The data handed from the TripPilot web app to the browser assistant.
 * The user exports it explicitly (a file download) and loads it into the extension; it expires quickly and is
 * only ever held in the extension's in-memory session storage.
 */

export const PAYLOAD_VERSION = 1
export const MAX_VALUE_LENGTH = 3000

export const FIELD_KEYS = [
  'applicant.givenNames', 'applicant.surname', 'applicant.dateOfBirth', 'applicant.placeOfBirth',
  'applicant.email', 'applicant.phone', 'applicant.address',
  'passport.number', 'passport.issuingCountry', 'passport.issueDate', 'passport.expiryDate',
  'travel.purpose', 'travel.arrivalDate', 'travel.departureDate',
  'accommodation.name', 'accommodation.address',
  'itinerary.plan',
] as const

export type FieldKey = (typeof FIELD_KEYS)[number]

export const FIELD_LABELS: Record<FieldKey, string> = {
  'applicant.givenNames': 'Given names', 'applicant.surname': 'Surname', 'applicant.dateOfBirth': 'Date of birth',
  'applicant.placeOfBirth': 'Place of birth', 'applicant.email': 'Email', 'applicant.phone': 'Phone', 'applicant.address': 'Home address',
  'passport.number': 'Passport number', 'passport.issuingCountry': 'Issuing country', 'passport.issueDate': 'Passport issue date',
  'passport.expiryDate': 'Passport expiry date', 'travel.purpose': 'Purpose of travel', 'travel.arrivalDate': 'Arrival date',
  'travel.departureDate': 'Departure date', 'accommodation.name': 'Accommodation name', 'accommodation.address': 'Accommodation address',
  'itinerary.plan': 'Itinerary',
}

/** Keys whose values are calendar dates stored as YYYY-MM-DD. */
export const DATE_KEYS: ReadonlySet<FieldKey> = new Set<FieldKey>([
  'applicant.dateOfBirth', 'passport.issueDate', 'passport.expiryDate', 'travel.arrivalDate', 'travel.departureDate',
])

export interface AssistantPayload {
  app: 'trippilot'
  version: typeof PAYLOAD_VERSION
  createdAt: string
  expiresAt: string
  destination: string
  fields: Partial<Record<FieldKey, string>>
}

export type ParseResult = { ok: true; payload: AssistantPayload } | { ok: false; error: string }

const isKey = (k: string): k is FieldKey => (FIELD_KEYS as readonly string[]).includes(k)

/** Strictly validates untrusted JSON (a file the user picked). Unknown keys are dropped, never passed through. */
export function parsePayload(text: string, now = new Date()): ParseResult {
  if (text.length > 100_000) return { ok: false, error: 'That file is too large to be a TripPilot export.' }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' }
  }
  const o = raw as Record<string, unknown> | null
  if (!o || typeof o !== 'object' || o.app !== 'trippilot') return { ok: false, error: 'This is not a TripPilot assistant export.' }
  if (o.version !== PAYLOAD_VERSION) return { ok: false, error: 'This export was made by a different version. Export it again from TripPilot.' }
  if (typeof o.expiresAt !== 'string' || Number.isNaN(Date.parse(o.expiresAt))) return { ok: false, error: 'The export has no valid expiry time.' }
  if (Date.parse(o.expiresAt) <= now.getTime()) return { ok: false, error: 'This export has expired. Export it again from TripPilot.' }
  if (typeof o.fields !== 'object' || o.fields === null) return { ok: false, error: 'The export contains no fields.' }

  const fields: AssistantPayload['fields'] = {}
  for (const [k, v] of Object.entries(o.fields as Record<string, unknown>)) {
    if (!isKey(k) || typeof v !== 'string') continue
    const value = v.trim()
    if (value && value.length <= MAX_VALUE_LENGTH) fields[k] = value
  }
  if (Object.keys(fields).length === 0) return { ok: false, error: 'The export contains no usable values.' }

  return {
    ok: true,
    payload: {
      app: 'trippilot', version: PAYLOAD_VERSION,
      createdAt: typeof o.createdAt === 'string' ? o.createdAt : now.toISOString(),
      expiresAt: o.expiresAt,
      destination: typeof o.destination === 'string' ? o.destination.slice(0, 80) : '',
      fields,
    },
  }
}

export const isExpired = (p: Pick<AssistantPayload, 'expiresAt'>, now = new Date()) => Date.parse(p.expiresAt) <= now.getTime()

export function minutesLeft(p: Pick<AssistantPayload, 'expiresAt'>, now = new Date()) {
  return Math.max(0, Math.ceil((Date.parse(p.expiresAt) - now.getTime()) / 60_000))
}

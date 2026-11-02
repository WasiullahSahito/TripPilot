import { DATE_KEYS, type FieldKey } from './payload'
import type { FieldMeta } from './safety'

export type Confidence = 'high' | 'medium' | 'low'

export interface Match {
  key: FieldKey
  confidence: Confidence
  reason: string
}

// Browser autocomplete tokens are the strongest signal a site can give.
const AUTOCOMPLETE: Record<string, FieldKey> = {
  'given-name': 'applicant.givenNames', 'family-name': 'applicant.surname', bday: 'applicant.dateOfBirth', email: 'applicant.email',
  tel: 'applicant.phone', 'tel-national': 'applicant.phone', 'street-address': 'applicant.address',
}

interface Rule {
  key: FieldKey
  /** Must match the combined label/name/id/placeholder text. */
  any: RegExp
  /** Must NOT match (disambiguation). */
  not?: RegExp
}

const RULES: Rule[] = [
  { key: 'applicant.surname', any: /\b(sur ?name|last[\s_-]?name|family[\s_-]?name)\b/ },
  { key: 'applicant.givenNames', any: /\b(given[\s_-]?names?|first[\s_-]?name|fore ?names?)\b/ },
  { key: 'applicant.placeOfBirth', any: /(place|city|town|country)[\s_-]?of[\s_-]?birth|birth[\s_-]?(place|city|town)/ },
  { key: 'applicant.dateOfBirth', any: /(date[\s_-]?of[\s_-]?birth|birth[\s_-]?date|\bdob\b|birthday)/, not: /place|city|town/ },
  { key: 'passport.number', any: /passport[\s_-]?(no\b|num|number|#)|document[\s_-]?number/ },
  { key: 'passport.issuingCountry', any: /(issuing|issue)[\s_-]?(country|authority|state)|country[\s_-]?of[\s_-]?issue|issued[\s_-]?by/ },
  { key: 'passport.issueDate', any: /(date[\s_-]?of[\s_-]?issue|issue[\s_-]?date|issued[\s_-]?on)/ },
  { key: 'passport.expiryDate', any: /(expiry|expiration|expire[sd]?|valid[\s_-]?until|valid[\s_-]?to)[\s_-]?(date)?/, not: /card|visa[\s_-]?valid/ },
  { key: 'applicant.email', any: /\be[\s_-]?mail\b/ },
  { key: 'applicant.phone', any: /\b(phone|mobile|telephone|tel|cell)\b/ },
  { key: 'accommodation.name', any: /(hotel|accommodation|lodging|host)[\s_-]?name|name[\s_-]?of[\s_-]?(the[\s_-]?)?(hotel|accommodation)/ },
  { key: 'accommodation.address', any: /(hotel|accommodation|lodging|host|destination)[\s_-]?address|address[\s_-]?(in|of)[\s_-]?(the[\s_-]?)?(destination|hotel|accommodation)/ },
  { key: 'applicant.address', any: /\b(home[\s_-]?address|residential[\s_-]?address|street[\s_-]?address|address)\b/, not: /e[\s_-]?mail|hotel|accommodation|lodging|destination|host|ip\b/ },
  { key: 'travel.purpose', any: /purpose[\s_-]?of[\s_-]?(the[\s_-]?)?(visit|travel|trip|journey|stay)|reason[\s_-]?for[\s_-]?(travel|visit)/ },
  { key: 'travel.arrivalDate', any: /(arrival|entry|check[\s_-]?in)[\s_-]?date|date[\s_-]?of[\s_-]?(arrival|entry)|intended[\s_-]?(date[\s_-]?of[\s_-]?)?arrival/ },
  { key: 'travel.departureDate', any: /(departure|exit|check[\s_-]?out)[\s_-]?date|date[\s_-]?of[\s_-]?(departure|exit)|intended[\s_-]?(date[\s_-]?of[\s_-]?)?departure/ },
  { key: 'itinerary.plan', any: /itinerary|travel[\s_-]?(plan|schedule)|schedule[\s_-]?of[\s_-]?stay/ },
]

const haystack = (f: FieldMeta) => `${f.label} ${f.name} ${f.id} ${f.placeholder}`.toLowerCase().replace(/[[\]().]/g, ' ')

/**
 * Suggests which exported value belongs in a form field. A suggestion is only ever shown to the user for approval;
 * nothing is filled automatically. Ambiguous fields (several rules fit) get no suggestion rather than a guess.
 */
export function matchField(f: FieldMeta): Match | null {
  for (const token of f.autocomplete.toLowerCase().split(/\s+/)) {
    const key = AUTOCOMPLETE[token]
    if (key) return { key, confidence: 'high', reason: `autocomplete="${token}"` }
  }
  const text = haystack(f)
  const hits = RULES.filter((r) => r.any.test(text) && !(r.not && r.not.test(text)))
  if (hits.length === 0) return null
  if (hits.length > 1) return null
  const hit = hits[0]!
  const labelOnly = f.label.toLowerCase()
  const confidence: Confidence = hit.any.test(labelOnly) ? 'high' : 'medium'
  return { key: hit.key, confidence, reason: confidence === 'high' ? 'matches the field label' : 'matches the field name' }
}

export interface FormattedValue {
  value: string
  /** False when we had to guess the date layout: the preview warns the user to check it. */
  verified: boolean
}

/** Converts an ISO date (YYYY-MM-DD) to the layout a particular input expects. */
export function formatDateFor(f: Pick<FieldMeta, 'type' | 'placeholder'>, iso: string): FormattedValue {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return { value: iso, verified: false }
  const [, y, mo, d] = m as unknown as [string, string, string, string]
  if (f.type === 'date') return { value: iso, verified: true }
  const p = f.placeholder.toLowerCase()
  const sep = /[./-]/.exec(p)?.[0]
  if (sep && /d{1,2}.m{1,2}.y{2,4}/.test(p)) return { value: `${d}${sep}${mo}${sep}${y}`, verified: true }
  if (sep && /m{1,2}.d{1,2}.y{2,4}/.test(p)) return { value: `${mo}${sep}${d}${sep}${y}`, verified: true }
  if (sep && /y{2,4}.m{1,2}.d{1,2}/.test(p)) return { value: `${y}${sep}${mo}${sep}${d}`, verified: true }
  return { value: iso, verified: false }
}

export function valueFor(key: FieldKey, raw: string, f: Pick<FieldMeta, 'type' | 'placeholder'>): FormattedValue {
  return DATE_KEYS.has(key) ? formatDateFor(f, raw) : { value: raw, verified: true }
}

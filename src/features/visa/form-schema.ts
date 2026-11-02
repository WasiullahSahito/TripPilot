import { z } from 'zod'

// A field the user never touched is `undefined`; treat it as empty so the message says what is missing.
const blank = <T extends z.ZodType>(inner: T) => z.preprocess((v) => v ?? '', inner)
const req = (label: string, max = 100) => blank(z.string().trim().min(1, `${label} is required`).max(max))
const date = (label: string) => blank(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `${label} is required`))

export const STEP_IDS = ['applicant', 'passport', 'travel', 'accommodation', 'itinerary'] as const
export const EMPLOYMENT_STEP_ID = 'employment' as const
export type StepId = (typeof STEP_IDS)[number] | typeof EMPLOYMENT_STEP_ID
const ALL_STEP_IDS: readonly StepId[] = [...STEP_IDS, EMPLOYMENT_STEP_ID]

export const stepSchemas = {
  applicant: z.object({
    givenNames: req('Given names'),
    surname: req('Surname'),
    dateOfBirth: date('Date of birth'),
    placeOfBirth: req('Place of birth'),
    email: blank(z.string().trim().email('Enter a valid email')),
    phone: req('Phone', 30),
    address: req('Home address', 300),
  }),
  passport: z
    .object({
      number: blank(z.string().trim().regex(/^[A-Za-z0-9]{5,15}$/, 'Use 5–15 letters or digits')),
      issuingCountry: req('Issuing country', 60),
      issueDate: date('Issue date'),
      expiryDate: date('Expiry date'),
    })
    .refine((p) => p.expiryDate > p.issueDate, { path: ['expiryDate'], message: 'Expiry must be after issue date' }),
  travel: z
    .object({
      purpose: req('Purpose', 40),
      arrivalDate: date('Arrival date'),
      departureDate: date('Departure date'),
    })
    .refine((t) => t.departureDate >= t.arrivalDate, { path: ['departureDate'], message: 'Departure must be on or after arrival' }),
  accommodation: z.object({
    name: req('Accommodation name', 150),
    address: req('Address', 300),
    bookingStatus: z.enum(['planned', 'confirmed']),
  }),
  itinerary: z.object({ plan: req('Itinerary', 3000) }),
  employment: z.object({
    jobTitle: req('Intended job title', 120),
    workLocation: req('Intended work location', 150),
    employerName: blank(z.string().trim().max(150)),
    offerStatus: blank(z.enum(['received', 'pending', 'not-yet-decided'], { error: 'Select an offer status' })),
    details: blank(z.string().trim().max(1500)),
  }),
} satisfies Record<StepId, z.ZodType>

export const stepLabels: Record<StepId, string> = {
  applicant: 'Applicant', passport: 'Passport', travel: 'Travel', accommodation: 'Accommodation', itinerary: 'Itinerary',
  employment: 'Work details',
}

export type FormData = Record<StepId, Record<string, string>>

export const emptyFormData = (): FormData => ({
  applicant: {}, passport: {}, travel: {}, accommodation: { bookingStatus: 'planned' }, itinerary: {}, employment: {},
})

export function mergeFormData(saved: Partial<FormData> | undefined): FormData {
  const base = emptyFormData()
  for (const id of ALL_STEP_IDS) base[id] = { ...base[id], ...(saved?.[id] ?? {}) }
  return base
}

export function validateStep(step: StepId, data: FormData) {
  const r = stepSchemas[step].safeParse(data[step])
  if (r.success) return { ok: true as const, errors: {} as Record<string, string> }
  const errors: Record<string, string> = {}
  for (const i of r.error.issues) errors[String(i.path[0] ?? '_')] ??= i.message
  return { ok: false as const, errors }
}

export function formCompletion(data: FormData, includeEmployment = false) {
  const ids: readonly StepId[] = includeEmployment
    ? ['applicant', 'passport', EMPLOYMENT_STEP_ID]
    : STEP_IDS
  const steps = ids.map((id) => ({ id, complete: validateStep(id, data).ok }))
  const done = steps.filter((s) => s.complete).length
  return { steps, done, total: steps.length, percent: Math.round((done / steps.length) * 100) }
}

/** Months between a date and a later date; positive when `later` is after `earlier`. */
export function monthsBetween(earlier: string, later: string) {
  const [y1, m1, d1] = earlier.split('-').map(Number)
  const [y2, m2, d2] = later.split('-').map(Number)
  let months = (y2! - y1!) * 12 + (m2! - m1!)
  if (d2! < d1!) months -= 1
  return months
}

/** Guidance warning (not a validation error) about passport validity. */
export function passportValidityWarning(data: FormData, requiredMonths: number): string | null {
  const expiry = data.passport.expiryDate
  const departure = data.travel.departureDate
  if (!expiry || !departure || requiredMonths <= 0) return null
  if (monthsBetween(departure, expiry) < requiredMonths) {
    return `Your passport may expire less than ${requiredMonths} months after your departure date. Many authorities expect more validity — check the official requirements.`
  }
  return null
}

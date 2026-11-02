import { buildChecklist, checklistProgress } from './checklist'
import { destinations, findDestination, isWorkVisaCategory } from './destinations'
import { emptyFormData, formCompletion, monthsBetween, passportValidityWarning, validateStep, mergeFormData } from './form-schema'
import { buildApplicationSummary } from './summary-pdf'

const france = findDestination('France')!
const usa = findDestination('usa')!

describe('destinations config', () => {
  it('finds by id or name, case-insensitively', () => {
    expect(findDestination('FRANCE')?.id).toBe('france')
    expect(findDestination('United States')?.id).toBe('usa')
    expect(findDestination('Atlantis')).toBeUndefined()
  })
  it('every destination has categories and an https official link', () => {
    for (const d of destinations) {
      expect(d.categories.length).toBeGreaterThan(0)
      expect(d.officialLinks.length).toBeGreaterThan(0)
      for (const l of d.officialLinks) expect(l.url).toMatch(/^https:\/\//)
    }
  })
  it('includes the requested countries once, using their standard names', () => {
    const requested = [
      'Jordan', 'United Arab Emirates', 'Bahrain', 'Tunisia', 'Algeria', 'Saudi Arabia', 'Sudan',
      'Syria', 'Somalia', 'Iraq', 'Oman', 'Palestine', 'Qatar', 'Comoros', 'Kuwait', 'Lebanon',
      'Libya', 'Egypt', 'Morocco', 'Mauritania', 'Djibouti', 'Yemen', 'Austria', 'Germany',
      'Spain', 'Estonia', 'Italy', 'Portugal', 'Czechia', 'Denmark', 'Sweden', 'Slovakia',
      'Slovenia', 'Switzerland', 'France', 'Finland', 'Bulgaria', 'Belgium', 'Poland', 'Romania',
      'San Marino', 'Malta', 'Iceland', 'Liechtenstein', 'Lithuania', 'Latvia', 'Luxembourg',
      'Norway', 'Hungary', 'Greece', 'Croatia', 'Ireland', 'Cyprus', 'United Kingdom',
      'Turkey', 'United States', 'Canada', 'Australia', 'Brazil', 'China', 'Mexico',
    ]
    const names = destinations.map((d) => d.name)
    expect(names).toEqual(expect.arrayContaining(requested))
    expect(new Set(names).size).toBe(names.length)
    expect(destinations).toHaveLength(requested.length + 2)
  })
  it('offers a work/employment preparation route for every destination', () => {
    expect(destinations.every((d) => d.categories.some((c) => c.id === 'work-employment' && c.purposes.includes('Employment')))).toBe(true)
    expect(isWorkVisaCategory('work-employment')).toBe(true)
    expect(isWorkVisaCategory('schengen-visitor')).toBe(false)
  })
})

describe('buildChecklist', () => {
  it('uses official-source work guidance instead of visitor requirements', () => {
    const items = buildChecklist(france, 'work-employment', 'Employment')
    expect(items.map((i) => i.id)).toEqual(['work-route', 'work-document-list'])
    expect(items.every((i) => i.required)).toBe(true)
    expect(items.some((i) => /destination-specific/.test(i.description))).toBe(true)
  })
  it('makes insurance required only where the destination config says so', () => {
    const fr = buildChecklist(france, 'schengen-visitor', 'Tourism')
    const us = buildChecklist(usa, 'b2', 'Tourism')
    expect(fr.find((i) => i.id === 'insurance')?.required).toBe(true)
    expect(us.find((i) => i.id === 'insurance')?.required).toBe(false)
  })
  it('adds purpose and destination specific items', () => {
    const items = buildChecklist(usa, 'b1', 'Business').map((i) => i.id)
    expect(items).toContain('invitation-business')
    expect(items).toContain('us-ds160')
  })
  it('does not mutate shared base definitions between calls', () => {
    buildChecklist(france, 'schengen-visitor', 'Tourism')
    expect(buildChecklist(usa, 'b2', 'Tourism').find((i) => i.id === 'insurance')?.required).toBe(false)
  })
  it('reports progress on required items only', () => {
    const items = buildChecklist(usa, 'b2', 'Tourism')
    const p = checklistProgress(items, { passport: true, insurance: true })
    expect(p.done).toBe(1)
    expect(p.complete).toBe(false)
  })
})

describe('form validation', () => {
  it('requires work details and limits work completion to applicant, passport and employment', () => {
    const data = emptyFormData()
    expect(validateStep('employment', data).ok).toBe(false)
    expect(validateStep('employment', data).errors.jobTitle).toBe('Intended job title is required')
    expect(formCompletion(data, true)).toMatchObject({
      done: 0,
      total: 3,
      percent: 0,
      steps: [
        { id: 'applicant', complete: false },
        { id: 'passport', complete: false },
        { id: 'employment', complete: false },
      ],
    })
  })
  it('flags missing applicant fields and accepts a full set', () => {
    const data = emptyFormData()
    expect(validateStep('applicant', data).ok).toBe(false)
    data.applicant = {
      givenNames: 'Asha', surname: 'Rao', dateOfBirth: '1990-04-02', placeOfBirth: 'Pune',
      email: 'asha@example.com', phone: '+91 90000 00000', address: '1 Main St',
    }
    expect(validateStep('applicant', data).ok).toBe(true)
  })
  it('rejects passport expiry before issue and malformed numbers', () => {
    const data = emptyFormData()
    data.passport = { number: 'AB1', issuingCountry: 'India', issueDate: '2020-01-01', expiryDate: '2019-01-01' }
    const r = validateStep('passport', data)
    expect(r.ok).toBe(false)
  })
  it('computes completion across steps', () => {
    expect(formCompletion(emptyFormData()).percent).toBe(0)
  })
  it('merges saved partial data over defaults', () => {
    expect(mergeFormData({ applicant: { surname: 'Rao' } }).accommodation.bookingStatus).toBe('planned')
  })
})

describe('required-field messages', () => {
  it('says which field is missing when nothing has been entered yet', () => {
    const r = validateStep('applicant', emptyFormData())
    expect(r.ok).toBe(false)
    expect(r.errors.givenNames).toBe('Given names is required')
    expect(r.errors.dateOfBirth).toBe('Date of birth is required')
    expect(r.errors.email).toBe('Enter a valid email')
    const p = validateStep('passport', emptyFormData())
    expect(p.errors.number).toBe('Use 5–15 letters or digits')
    expect(p.errors.issuingCountry).toBe('Issuing country is required')
  })
})

describe('passport validity guidance', () => {
  it('counts whole months', () => {
    expect(monthsBetween('2026-12-01', '2027-06-01')).toBe(6)
    expect(monthsBetween('2026-12-15', '2027-06-14')).toBe(5)
  })
  it('warns only when validity is short and a requirement exists', () => {
    const data = emptyFormData()
    data.passport = { expiryDate: '2027-01-01' }
    data.travel = { departureDate: '2026-12-10' }
    expect(passportValidityWarning(data, 6)).toMatch(/6 months/)
    expect(passportValidityWarning(data, 0)).toBeNull()
    data.passport = { expiryDate: '2030-01-01' }
    expect(passportValidityWarning(data, 6)).toBeNull()
  })
})

describe('buildApplicationSummary', () => {
  it('produces a PDF and survives characters outside WinAnsi', async () => {
    const data = mergeFormData({ applicant: { givenNames: 'Zoë 山田', surname: 'Ng' }, itinerary: { plan: 'Day 1\n'.repeat(120) } })
    const bytes = await buildApplicationSummary({
      destination: france, categoryLabel: 'Schengen short-stay', nationality: 'India', residence: 'India',
      data, checklist: buildChecklist(france, 'schengen-visitor', 'Tourism'), checked: { passport: true },
      uploads: { passport: ['passport.pdf'] }, generatedAt: new Date('2026-12-01'),
    })
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
    expect(bytes.length).toBeGreaterThan(1500)
  })
})

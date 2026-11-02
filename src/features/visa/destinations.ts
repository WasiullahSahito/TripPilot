/**
 * Destination configuration. Adding a destination = adding an entry here; no component changes.
 * Content is general guidance, NOT legal advice, and is not guaranteed current — the official
 * links are the authoritative source and every screen says so.
 */

export interface VisaCategory {
  id: string
  label: string
  description: string
  /** Trip purposes (see tripPurposes in config/site) this category usually corresponds to. */
  purposes: string[]
}

export interface OfficialLink {
  label: string
  url: string
}

export interface ChecklistItemDef {
  id: string
  label: string
  description: string
  required: boolean
  /** Category ids this applies to; omit for all. */
  categories?: string[]
}

export interface DestinationConfig {
  id: string
  name: string
  region: string
  categories: VisaCategory[]
  officialLinks: OfficialLink[]
  /** Passport validity usually expected beyond departure, in months. Shown as a warning, never a hard block. */
  passportValidityMonths: number
  /** Whether travel insurance is commonly a stated requirement. */
  insuranceRequired: boolean
  extraChecklist: ChecklistItemDef[]
  notes: string[]
}

const visitor = (id: string, label: string): VisaCategory => ({
  id, label, description: 'Short visit for tourism, family or friends.', purposes: ['Tourism', 'Family visit', 'Transit'],
})
const business = (id: string, label: string): VisaCategory => ({
  id, label, description: 'Meetings, conferences or short business activity.', purposes: ['Business'],
})
const study = (id: string, label: string): VisaCategory => ({
  id, label, description: 'Study; rules vary by course length.', purposes: ['Study'],
})

export const destinations: DestinationConfig[] = [
  {
    id: 'france', name: 'France', region: 'Schengen Area',
    categories: [visitor('schengen-visitor', 'Schengen short-stay (tourism / family)'), business('schengen-business', 'Schengen short-stay (business)'), study('schengen-study', 'Schengen short-stay (study)')],
    officialLinks: [{ label: 'France-Visas (official portal)', url: 'https://france-visas.gouv.fr' }],
    passportValidityMonths: 3, insuranceRequired: true,
    extraChecklist: [{ id: 'schengen-insurance', label: 'Travel medical insurance for the Schengen area', description: 'Commonly required to cover the whole stay; verify the minimum cover on the official site.', required: true }],
    notes: ['Schengen rules differ slightly between member states; confirm which state you should apply to.'],
  },
  {
    id: 'japan', name: 'Japan', region: 'East Asia',
    categories: [visitor('temporary-visitor', 'Temporary visitor (tourism / family)'), business('temporary-business', 'Temporary visitor (business)')],
    officialLinks: [{ label: 'Ministry of Foreign Affairs — Visas', url: 'https://www.mofa.go.jp/j_info/visit/visa/index.html' }],
    passportValidityMonths: 0, insuranceRequired: false,
    extraChecklist: [{ id: 'jp-schedule', label: 'Schedule of stay', description: 'A day-by-day plan is commonly requested. Our itinerary field can be used to prepare it.', required: true, categories: ['temporary-visitor'] }],
    notes: ['Many applicants apply through an accredited agency or the embassy; check which route applies to your nationality.'],
  },
  {
    id: 'uae', name: 'United Arab Emirates', region: 'Middle East',
    categories: [visitor('uae-tourist', 'Tourist visa'), business('uae-business', 'Business visit')],
    officialLinks: [{ label: 'ICP — Federal Authority for Identity & Citizenship', url: 'https://icp.gov.ae' }],
    passportValidityMonths: 6, insuranceRequired: false, extraChecklist: [],
    notes: ['Requirements depend heavily on nationality; some nationalities do not need a prior visa.'],
  },
  {
    id: 'uk', name: 'United Kingdom', region: 'Europe',
    categories: [visitor('standard-visitor', 'Standard Visitor (tourism / family)'), business('standard-business', 'Standard Visitor (business)'), study('short-study', 'Short-term study (up to 6 months)')],
    officialLinks: [{ label: 'GOV.UK — Standard Visitor visa', url: 'https://www.gov.uk/standard-visitor' }],
    passportValidityMonths: 0, insuranceRequired: false, extraChecklist: [],
    notes: ['Check the GOV.UK “check if you need a UK visa” tool first; some nationalities do not need one.'],
  },
  {
    id: 'usa', name: 'United States', region: 'North America',
    categories: [visitor('b2', 'B-2 visitor (tourism / family)'), business('b1', 'B-1 visitor (business)')],
    officialLinks: [{ label: 'U.S. Department of State — Visas', url: 'https://travel.state.gov/content/travel/en/us-visas.html' }],
    passportValidityMonths: 6, insuranceRequired: false,
    extraChecklist: [{ id: 'us-ds160', label: 'DS-160 confirmation page', description: 'Completed on the official site; keep the confirmation with the barcode.', required: true }],
    notes: ['An in-person interview is usually part of the process; appointment availability varies by consulate.'],
  },
  {
    id: 'indonesia', name: 'Indonesia', region: 'Southeast Asia',
    categories: [visitor('evoa', 'Visa on arrival / e-VOA (tourism)')],
    officialLinks: [{ label: 'Indonesia e-Visa (Immigration)', url: 'https://evisa.imigrasi.go.id' }],
    passportValidityMonths: 6, insuranceRequired: false,
    extraChecklist: [{ id: 'id-onward', label: 'Proof of onward or return travel', description: 'Commonly requested at entry.', required: true }],
    notes: ['Eligibility and fees change; confirm on the official portal before travelling.'],
  },
]

const generalVisitor = visitor('general-visitor', 'Visitor (tourism / family)')
const generalBusiness = business('general-business', 'Business visit')
const generalStudy = study('general-study', 'Study')
const workEmployment: VisaCategory = {
  id: 'work-employment',
  label: 'Work / employment visa',
  description: 'For taking paid work. This is separate from a visitor or business-trip visa; eligibility and sponsorship rules vary by destination.',
  purposes: ['Employment'],
}
const generalNotes = [
  'This is general preparation guidance, not country-specific visa advice. Requirements and application routes depend on your nationality; confirm them with the linked official authority or the destination embassy.',
]
const schengenVisaPolicy = {
  label: 'European Commission — Schengen visa policy',
  url: 'https://home-affairs.ec.europa.eu/policies/schengen-borders-and-visa/visa-policy_en',
}

function generalDestination(
  id: string,
  name: string,
  region: string,
  officialLink: OfficialLink,
): DestinationConfig {
  return {
    id,
    name,
    region,
    categories: [
      { ...generalVisitor },
      { ...generalBusiness },
      { ...generalStudy },
    ],
    officialLinks: [officialLink],
    passportValidityMonths: 0,
    insuranceRequired: false,
    extraChecklist: [],
    notes: generalNotes,
  }
}

const schengenDestinations = [
  ['austria', 'Austria'],
  ['germany', 'Germany'],
  ['spain', 'Spain'],
  ['estonia', 'Estonia'],
  ['italy', 'Italy'],
  ['portugal', 'Portugal'],
  ['czechia', 'Czechia'],
  ['denmark', 'Denmark'],
  ['sweden', 'Sweden'],
  ['slovakia', 'Slovakia'],
  ['slovenia', 'Slovenia'],
  ['switzerland', 'Switzerland'],
  ['finland', 'Finland'],
  ['bulgaria', 'Bulgaria'],
  ['belgium', 'Belgium'],
  ['poland', 'Poland'],
  ['romania', 'Romania'],
  ['iceland', 'Iceland'],
  ['liechtenstein', 'Liechtenstein'],
  ['lithuania', 'Lithuania'],
  ['latvia', 'Latvia'],
  ['luxembourg', 'Luxembourg'],
  ['malta', 'Malta'],
  ['norway', 'Norway'],
  ['hungary', 'Hungary'],
  ['greece', 'Greece'],
  ['croatia', 'Croatia'],
] as const

const additionalDestinations: DestinationConfig[] = [
  ...schengenDestinations.map(([id, name]) =>
    generalDestination(id, name, 'Schengen Area', schengenVisaPolicy),
  ),
  generalDestination('jordan', 'Jordan', 'Middle East', {
    label: 'Jordan Ministry of Interior — e-services',
    url: 'https://moi.gov.jo/EN/Pages/Visa_E_Applications.aspx',
  }),
  generalDestination('bahrain', 'Bahrain', 'Middle East', {
    label: 'Bahrain eVisa',
    url: 'https://www.evisa.gov.bh/',
  }),
  generalDestination('tunisia', 'Tunisia', 'North Africa', {
    label: 'Tunisia Ministry of Foreign Affairs — consular services',
    url: 'https://www.econsulat.tn/',
  }),
  generalDestination('algeria', 'Algeria', 'North Africa', {
    label: 'Algeria Ministry of Foreign Affairs',
    url: 'https://www.mfa.gov.dz/',
  }),
  generalDestination('saudi-arabia', 'Saudi Arabia', 'Middle East', {
    label: 'Saudi Arabia eVisa',
    url: 'https://visa.visitsaudi.com/',
  }),
  generalDestination('sudan', 'Sudan', 'North Africa', {
    label: 'Sudan Ministry of Foreign Affairs',
    url: 'https://mofa.gov.sd/',
  }),
  generalDestination('syria', 'Syria', 'Middle East', {
    label: 'Syria Ministry of Foreign Affairs and Expatriates',
    url: 'https://mofaex.gov.sy/',
  }),
  generalDestination('somalia', 'Somalia', 'East Africa', {
    label: 'Somalia Ministry of Foreign Affairs',
    url: 'https://mfa.gov.so/',
  }),
  generalDestination('iraq', 'Iraq', 'Middle East', {
    label: 'Iraq eVisa',
    url: 'https://evisa.iq/',
  }),
  generalDestination('oman', 'Oman', 'Middle East', {
    label: 'Royal Oman Police — eVisa',
    url: 'https://evisa.rop.gov.om/',
  }),
  generalDestination('palestine', 'Palestine', 'Middle East', {
    label: 'Palestine Ministry of Foreign Affairs and Expatriates',
    url: 'https://www.mofa.pna.ps/',
  }),
  generalDestination('qatar', 'Qatar', 'Middle East', {
    label: 'Qatar Ministry of Interior — visa services',
    url: 'https://portal.moi.gov.qa/',
  }),
  generalDestination('comoros', 'Comoros', 'East Africa', {
    label: 'Comoros Ministry of Foreign Affairs',
    url: 'https://diplomatie.gouv.km/',
  }),
  generalDestination('kuwait', 'Kuwait', 'Middle East', {
    label: 'Kuwait Ministry of Interior — eVisa',
    url: 'https://evisa.moi.gov.kw/',
  }),
  generalDestination('lebanon', 'Lebanon', 'Middle East', {
    label: 'Lebanon General Security',
    url: 'https://www.general-security.gov.lb/',
  }),
  generalDestination('libya', 'Libya', 'North Africa', {
    label: 'Libya Ministry of Foreign Affairs',
    url: 'https://mfa.gov.ly/',
  }),
  generalDestination('egypt', 'Egypt', 'North Africa', {
    label: 'Egypt eVisa',
    url: 'https://visa2egypt.gov.eg/',
  }),
  generalDestination('morocco', 'Morocco', 'North Africa', {
    label: 'Morocco eVisa — Accès Maroc',
    url: 'https://www.acces-maroc.ma/',
  }),
  generalDestination('mauritania', 'Mauritania', 'West Africa', {
    label: 'Mauritania National Agency for Population and Secure Titles',
    url: 'https://anrpts.gov.mr/',
  }),
  generalDestination('djibouti', 'Djibouti', 'East Africa', {
    label: 'Djibouti eVisa',
    url: 'https://www.evisa.gouv.dj/',
  }),
  generalDestination('yemen', 'Yemen', 'Middle East', {
    label: 'Yemen Ministry of Foreign Affairs and Expatriates',
    url: 'https://www.mofa-ye.org/',
  }),
  generalDestination('san-marino', 'San Marino', 'Europe', {
    label: 'San Marino Ministry of Foreign Affairs',
    url: 'https://www.esteri.sm/',
  }),
  generalDestination('ireland', 'Ireland', 'Europe', {
    label: 'Ireland Immigration Service — visas',
    url: 'https://www.irishimmigration.ie/coming-to-visit-ireland/',
  }),
  generalDestination('cyprus', 'Cyprus', 'Europe', {
    label: 'Cyprus Ministry of Foreign Affairs',
    url: 'https://mfa.gov.cy/',
  }),
  generalDestination('turkey', 'Turkey', 'West Asia', {
    label: 'Republic of Türkiye — eVisa',
    url: 'https://www.evisa.gov.tr/',
  }),
  generalDestination('canada', 'Canada', 'North America', {
    label: 'Government of Canada — immigration and citizenship',
    url: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/visit-canada.html',
  }),
  generalDestination('australia', 'Australia', 'Oceania', {
    label: 'Australian Department of Home Affairs — visas',
    url: 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing',
  }),
  generalDestination('brazil', 'Brazil', 'South America', {
    label: 'Brazil Ministry of Foreign Affairs — visas',
    url: 'https://www.gov.br/mre/pt-br/assuntos/portal-consular/vistos',
  }),
  generalDestination('china', 'China', 'East Asia', {
    label: 'China Ministry of Foreign Affairs',
    url: 'https://www.mfa.gov.cn/eng/',
  }),
  generalDestination('mexico', 'Mexico', 'North America', {
    label: 'Mexico Ministry of Foreign Affairs — visas',
    url: 'https://www.gob.mx/sre/acciones-y-programas/visas-para-extranjeros-8036',
  }),
]

destinations.push(...additionalDestinations)
for (const destination of destinations) {
  destination.categories.push({ ...workEmployment })
  destination.notes.push('Work authorization is separate from tourism, family visits and business visits. Check the official authority for the work route and eligibility that apply to your nationality and job.')
}

export function isWorkVisaCategory(categoryId: string) {
  return categoryId === workEmployment.id
}

export function findDestination(idOrName: string | null | undefined) {
  if (!idOrName) return undefined
  const q = idOrName.trim().toLowerCase()
  return destinations.find((d) => d.id === q || d.name.toLowerCase() === q)
}

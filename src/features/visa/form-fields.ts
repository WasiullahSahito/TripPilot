import type { StepId } from './form-schema'

export interface FieldDef {
  name: string
  label: string
  type: 'text' | 'date' | 'email' | 'tel' | 'textarea' | 'select'
  options?: { value: string; label: string }[]
  autoComplete?: string
  hint?: string
  wide?: boolean
}

export const stepFields: Record<StepId, FieldDef[]> = {
  applicant: [
    { name: 'givenNames', label: 'Given names (as in passport)', type: 'text', autoComplete: 'given-name' },
    { name: 'surname', label: 'Surname', type: 'text', autoComplete: 'family-name' },
    { name: 'dateOfBirth', label: 'Date of birth', type: 'date', autoComplete: 'bday' },
    { name: 'placeOfBirth', label: 'Place of birth', type: 'text' },
    { name: 'email', label: 'Email', type: 'email', autoComplete: 'email' },
    { name: 'phone', label: 'Phone', type: 'tel', autoComplete: 'tel' },
    { name: 'address', label: 'Home address', type: 'textarea', autoComplete: 'street-address', wide: true },
  ],
  passport: [
    { name: 'number', label: 'Passport number', type: 'text', autoComplete: 'off', hint: 'Stored encrypted on the server. Never kept in your browser.' },
    { name: 'issuingCountry', label: 'Issuing country', type: 'text' },
    { name: 'issueDate', label: 'Issue date', type: 'date' },
    { name: 'expiryDate', label: 'Expiry date', type: 'date' },
  ],
  travel: [
    { name: 'purpose', label: 'Purpose of travel', type: 'text' },
    { name: 'arrivalDate', label: 'Planned arrival', type: 'date' },
    { name: 'departureDate', label: 'Planned departure', type: 'date' },
  ],
  accommodation: [
    { name: 'name', label: 'Hotel or host name', type: 'text' },
    { name: 'address', label: 'Address', type: 'textarea', wide: true },
    {
      name: 'bookingStatus', label: 'Booking status', type: 'select', hint: 'Be accurate — this is printed on your summary.',
      options: [
        { value: 'planned', label: 'Planned (not booked)' },
        { value: 'confirmed', label: 'Confirmed (I have a booking)' },
      ],
    },
  ],
  itinerary: [
    { name: 'plan', label: 'Day-by-day plan', type: 'textarea', wide: true, hint: 'e.g. Day 1–3 Paris, Day 4–7 Lyon…' },
  ],
  employment: [
    { name: 'jobTitle', label: 'Intended job title or occupation', type: 'text' },
    { name: 'workLocation', label: 'Intended work location', type: 'text' },
    { name: 'employerName', label: 'Employer or sponsor (if known)', type: 'text' },
    {
      name: 'offerStatus', label: 'Job offer status', type: 'select',
      options: [
        { value: '', label: 'Choose a status…' },
        { value: 'received', label: 'Offer received' },
        { value: 'pending', label: 'Offer pending' },
        { value: 'not-yet-decided', label: 'Not decided / seeking information' },
      ],
    },
    { name: 'details', label: 'Notes about the role or offer (optional)', type: 'textarea', wide: true },
  ],
}

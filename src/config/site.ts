import {
  Plane, Hotel, ShieldCheck, CalendarCheck, Stamp, type LucideIcon,
} from 'lucide-react'

export const marketingNav = [
  { label: 'Features', href: '/#features' },
  { label: 'How it works', href: '/#how-it-works' },
  { label: 'Destinations', href: '/#destinations' },
  { label: 'FAQ', href: '/#faq' },
] as const

export interface Feature { icon: LucideIcon; title: string; description: string; to: string }

export const features: Feature[] = [
  { icon: Stamp, title: 'Visa assistance', description: 'Guided checklists, saved progress and a clean application summary, with links to the official portal.', to: '/app/visa' },
  { icon: Plane, title: 'Flights', description: 'Search connected fare providers and verify price and availability before booking.', to: '/app/flights' },
  { icon: Hotel, title: 'Hotels', description: 'Search provider data when connected, compare partner sites and organise your reservations.', to: '/app/hotels' },
  { icon: ShieldCheck, title: 'Travel insurance', description: 'Check cover options through a partner and store your policy documents.', to: '/app/insurance' },
  { icon: CalendarCheck, title: 'Appointments', description: 'Track visa-centre and biometric appointments with reminders and checklists.', to: '/app/appointments' },
]

export const steps = [
  { title: 'Tell us about your trip', description: 'Pick a destination, nationality and purpose. We tailor the visa path and checklist.' },
  { title: 'Prepare everything in one place', description: 'Complete your application details, add flights, hotels and insurance, and book appointments.' },
  { title: 'Submit on the official site', description: 'Export a tidy document package, then finish submission, payment and verification on the official portal.' },
]

export const destinations = [
  { name: 'France', city: 'Paris', visa: 'Schengen short-stay', img: 'photo-1502602898657-3e91760cbb34' },
  { name: 'Japan', city: 'Tokyo', visa: 'Temporary visitor', img: 'photo-1540959733332-eab4deabeeaf' },
  { name: 'United Arab Emirates', city: 'Dubai', visa: 'Tourist visa', img: 'photo-1512453979798-5ea266f8880c' },
  { name: 'United Kingdom', city: 'London', visa: 'Standard visitor', img: 'photo-1513635269975-59663e0ac1ad' },
  { name: 'United States', city: 'New York', visa: 'B-1/B-2 visitor', img: 'photo-1496442226666-8d4d0e62e6e9' },
  { name: 'Indonesia', city: 'Bali', visa: 'Visa on arrival / e-VOA', img: 'photo-1537996194471-e657df975ab4' },
]

export const tripPurposes = ['Tourism', 'Business', 'Family visit', 'Study', 'Transit', 'Employment'] as const

export const faqs = [
  { q: 'Does TripPilot submit my visa application for me?', a: 'No. TripPilot helps you prepare. Submission, CAPTCHA, consent, identity verification and payment always happen on the official government or embassy site.' },
  { q: 'Are flight and hotel prices live?', a: 'Search results appear only when a connected provider returns them; hotel search may be unavailable until a provider is connected. Prices and availability can change, so confirm details directly with the provider before booking.' },
  { q: 'Is visa information guaranteed accurate?', a: 'Requirements change. Checklists are guidance and always link to the official source, which is authoritative.' },
  { q: 'How is my passport data protected?', a: 'Passport details are stored encrypted on the server for your account. Passport photo OCR runs in your browser and the image is not uploaded.' },
  { q: 'What does it cost?', a: 'The core preparation tools are free to run. Live flight, hotel, insurance, maps and payment integrations are optional and may carry provider costs.' },
]

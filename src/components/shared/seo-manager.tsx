import { useEffect } from 'react'
import { useLocation } from 'react-router'

const BRAND = 'TripPilot'

interface Meta {
  title: string
  description: string
}

/** Public pages Google may index. Phrases are the ones people actually search; keep each title under ~60 characters. */
const PUBLIC: Record<string, Meta> = {
  '/': {
    title: 'Visa Document Checklist & Travel Planner | TripPilot',
    description: 'Organize your visa application: document checklists, passport scanner, PDF package builder, appointment reminders, trip budget, and flight, hotel and travel insurance search.',
  },
  '/help': {
    title: 'Visa Application Help & FAQ | TripPilot',
    description: 'Answers on preparing visa documents, building a PDF application package, tracking appointments and comparing travel insurance with TripPilot.',
  },
  '/signup': {
    title: 'Create a Free Account | TripPilot',
    description: 'Sign up to organize your visa documents, track appointments and plan your trip budget in one place.',
  },
  '/login': {
    title: 'Log in | TripPilot',
    description: 'Log in to your TripPilot visa application organizer and travel planner.',
  },
  '/privacy': {
    title: 'Privacy Policy | TripPilot',
    description: 'How TripPilot stores and protects your travel documents and personal data.',
  },
  '/terms': {
    title: 'Terms of Service | TripPilot',
    description: 'The terms for using the TripPilot visa organizer and travel planner.',
  },
}

function setMeta(selector: string, create: () => HTMLMetaElement, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector)
  if (!el) {
    el = create()
    document.head.appendChild(el)
  }
  el.content = content
}

const named = (name: string) => () => Object.assign(document.createElement('meta'), { name })
const prop = (property: string) => () => {
  const m = document.createElement('meta')
  m.setAttribute('property', property)
  return m
}

/** Keeps the tab title, description and robots hint in step with the current URL (single-page app). */
export function SeoManager() {
  const { pathname } = useLocation()

  useEffect(() => {
    const clean = pathname.replace(/\/+$/, '') || '/'
    const meta = PUBLIC[clean]
    // Everything behind login (or unknown) must stay out of search results.
    const indexable = !!meta
    const title = meta?.title ?? `${BRAND}: your travel and visa workspace`
    const description = meta?.description ?? PUBLIC['/']!.description

    document.title = title
    setMeta('meta[name="description"]', named('description'), description)
    setMeta('meta[name="robots"]', named('robots'), indexable ? 'index,follow' : 'noindex,nofollow')
    setMeta('meta[property="og:title"]', prop('og:title'), title)
    setMeta('meta[property="og:description"]', prop('og:description'), description)
  }, [pathname])

  return null
}

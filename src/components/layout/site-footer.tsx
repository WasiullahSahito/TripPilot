import { Link } from 'react-router'
import { Logo } from '@/components/shared/logo'
import { ROUTES } from '@/config/routes'

const columns = [
  { title: 'Product', links: [['Visa workspace', ROUTES.app.visa], ['Flights', ROUTES.app.flights], ['Hotels', ROUTES.app.hotels], ['Insurance', ROUTES.app.insurance]] },
  { title: 'Support', links: [['Help center', ROUTES.help], ['FAQs', '/#faq'], ['Log in', ROUTES.login]] },
  { title: 'Legal', links: [['Privacy policy', ROUTES.privacy], ['Terms of service', ROUTES.terms], ['Contact', ROUTES.help]] },
] as const

export function SiteFooter() {
  return (
    <footer className="bg-navy-900 text-white/80">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-4">
        <div>
          <Logo light />
          <p className="mt-4 text-sm">Preparation tools for visas and travel. Not a government agency or embassy.</p>
          <p className="mt-4 text-sm">Contact: <span className="text-white">support@example.com</span> <span className="text-white/50">(placeholder)</span></p>
        </div>
        {columns.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <h3 className="mb-3 text-sm font-semibold text-white">{c.title}</h3>
            <ul className="space-y-2 text-sm">
              {c.links.map(([label, to]) => (
                <li key={label}><Link to={to} className="hover:text-white">{label}</Link></li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-white/10 py-5 text-center text-xs text-white/50">
        © {new Date().getFullYear()} TripPilot. Visa decisions are made solely by the issuing authority.
      </div>
    </footer>
  )
}

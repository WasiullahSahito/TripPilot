import { Link } from 'react-router'

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2" aria-label="TripPilot home">
      <span className="grid size-8 place-items-center rounded-lg bg-navy-900 ring-1 ring-white/10">
        <svg viewBox="0 0 32 32" className="size-5" aria-hidden>
          <path d="M8 17l16-7-6 14-3-6z" fill="#14b8a6" />
        </svg>
      </span>
      <span className={`text-lg font-semibold tracking-tight ${light ? 'text-white' : 'text-ink'}`}>TripPilot</span>
    </Link>
  )
}

import { ExternalLink } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { saveHandoff, type Handoff } from '@/features/bookings/handoff'
import { cn } from '@/lib/utils'
import { AFFILIATE_DISCLOSURE, buildLink, partners, type LinkParams, type PartnerId } from './links'

export type HandoffContext = Pick<Handoff, 'kind' | 'title' | 'startDate' | 'endDate'>

export function AffiliateDisclosure({ className }: { className?: string }) {
  return <p className={cn('text-xs text-ink-soft', className)}>{AFFILIATE_DISCLOSURE}</p>
}

/**
 * A single outbound link; affiliate links are marked rel="sponsored" as search engines require. When a handoff
 * context is given, clicking leaves a note (this tab only) so Booking history can offer to record what you booked.
 */
export function PartnerLink({ id, params, label, handoff }: { id: PartnerId; params: LinkParams; label?: string; handoff?: HandoffContext }) {
  const link = buildLink(id, params)
  if (!link) return null
  return (
    <a
      href={link.url}
      target="_blank"
      rel={link.affiliate ? 'sponsored noopener noreferrer' : 'noopener noreferrer'}
      onClick={() => handoff && saveHandoff({ ...handoff, partner: partners[id].name })}
      className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
    >
      {label ?? partners[id].name}
      <ExternalLink className="size-3.5" aria-hidden />
      <span className="sr-only">(opens partner site in a new tab)</span>
    </a>
  )
}

export function PartnerRow({ title, ids, params, handoff }: { title: string; ids: PartnerId[]; params: LinkParams; handoff?: HandoffContext }) {
  const shown = ids.filter((id) => buildLink(id, params))
  if (shown.length === 0) return null
  return (
    <section aria-label={title} className="rounded-xl border border-line bg-surface p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-3 flex flex-wrap gap-2">{shown.map((id) => <PartnerLink key={id} id={id} params={params} handoff={handoff} />)}</div>
      <AffiliateDisclosure className="mt-3" />
      {handoff && <p className="mt-2 text-xs text-ink-soft">After you book, record it in Booking history with the confirmation reference the partner gives you.</p>}
    </section>
  )
}

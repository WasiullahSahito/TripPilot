import { Lock, ServerCog, UserCheck } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Accordion, AccordionItem } from '@/components/ui/accordion'
import { Card } from '@/components/ui/card'
import { Reveal } from '@/components/shared/reveal'
import { SectionHeading } from '@/components/shared/section-heading'
import { destinations, faqs, features, steps } from '@/config/site'

export function Features() {
  return (
    <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20">
      <SectionHeading eyebrow="Everything in one place" title="Built for the whole journey" />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {features.map(({ icon: Icon, title, description, to }, i) => (
          <Reveal key={title} delay={i * 0.05}>
            <Link to={to} className="block h-full">
              <Card className="h-full p-6 transition-shadow hover:shadow-lg">
                <span className="mb-4 grid size-10 place-items-center rounded-xl bg-accent-50 text-accent-700">
                  <Icon className="size-5" aria-hidden />
                </span>
                <h3 className="font-semibold">{title}</h3>
                <p className="mt-2 text-sm text-ink-soft">{description}</p>
              </Card>
            </Link>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

export function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-20 bg-surface py-20">
      <div className="mx-auto max-w-6xl px-4">
        <SectionHeading eyebrow="How it works" title="Three steps to a complete file" />
        <ol className="grid gap-8 md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title}>
              <Reveal delay={i * 0.08}>
                <span className="mb-4 grid size-9 place-items-center rounded-full bg-navy-900 text-sm font-semibold text-white">{i + 1}</span>
                <h3 className="font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-ink-soft">{s.description}</p>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

function DestinationImage({ id, alt }: { id: string; alt: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <div className="h-full w-full bg-navy-800" role="img" aria-label={alt} />
  return (
    <img
      src={`https://images.unsplash.com/${id}?auto=format&fit=crop&w=800&q=70`}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
    />
  )
}

export function Destinations() {
  return (
    <section id="destinations" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20">
      <SectionHeading eyebrow="Popular destinations" title="Where are you heading?" description="Select a destination to start its visa checklist." />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {destinations.map((d) => (
          <Link key={d.name} to={`/app/visa?destination=${encodeURIComponent(d.name)}`} className="group">
            <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-navy-800">
              <DestinationImage id={d.img} alt={`${d.city}, ${d.name}`} />
              <div className="absolute inset-0 bg-gradient-to-t from-navy-900/80 to-transparent" />
              <div className="absolute bottom-4 left-4 text-white">
                <p className="text-lg font-semibold">{d.name}</p>
                <p className="text-sm text-white/80">{d.city} · {d.visa}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}

const trust = [
  { icon: Lock, title: 'Privacy by design', text: 'Sensitive details are never kept in browser storage in production mode.' },
  { icon: UserCheck, title: 'You stay in control', text: 'Nothing is sent to an official portal without your explicit approval.' },
  { icon: ServerCog, title: 'No shortcuts', text: 'We never bypass CAPTCHAs or portal protections, and never store portal credentials.' },
]

export function Trust() {
  return (
    <section className="bg-navy-900 py-20 text-white">
      <div className="mx-auto max-w-6xl px-4">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Trust and security</h2>
          <p className="mt-4 text-white/70">Travel documents are sensitive. The platform is designed around that.</p>
        </div>
        <div className="grid gap-8 md:grid-cols-3">
          {trust.map(({ icon: Icon, title, text }) => (
            <div key={title}>
              <Icon className="mb-3 size-6 text-accent-500" aria-hidden />
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-white/70">{text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export function Faq() {
  return (
    <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 pb-24 pt-8">
      <SectionHeading title="Frequently asked questions" />
      <Accordion type="single" collapsible>
        {faqs.map((f, i) => (
          <AccordionItem key={f.q} value={`f${i}`} question={f.q}>{f.a}</AccordionItem>
        ))}
      </Accordion>
    </section>
  )
}

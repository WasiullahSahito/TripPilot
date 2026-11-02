import { motion, useReducedMotion } from 'framer-motion'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { ROUTES } from '@/config/routes'
import { TripSearchPanel } from './trip-search-panel'

export function Hero() {
  const reduce = useReducedMotion()
  return (
    <section className="mx-auto max-w-6xl px-4 pb-16 pt-16 sm:pt-24">
      <motion.div
        className="mx-auto max-w-3xl text-center"
        initial={reduce ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        <p className="mb-4 inline-block rounded-full bg-accent-50 px-3 py-1 text-xs font-medium text-accent-700">
          Visa · Flights · Hotels · Insurance · Appointments
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
          Your Entire Visa Journey. One Simple Platform.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-ink-soft">
          Prepare your visa application, plan flights and hotels, compare insurance and track appointments in a single workflow,
          then submit on the official site with a complete, organised document package.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button asChild size="lg"><Link to={ROUTES.signup}>Plan Your Trip</Link></Button>
          <Button asChild size="lg" variant="outline"><a href="#destinations">Explore Destinations</a></Button>
        </div>
      </motion.div>
      <div className="mx-auto mt-14 max-w-5xl">
        <TripSearchPanel />
      </div>
    </section>
  )
}

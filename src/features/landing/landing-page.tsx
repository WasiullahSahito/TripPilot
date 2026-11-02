import { Hero } from './hero'
import { Destinations, Faq, Features, HowItWorks, Trust } from './sections'

export default function LandingPage() {
  return (
    <>
      <Hero />
      <Features />
      <HowItWorks />
      <Destinations />
      <Trust />
      <Faq />
    </>
  )
}

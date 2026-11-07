import { Download, MapPin, Search } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, Input, Select } from '@/components/ui/field'
import { useAuth } from '@/features/auth/auth-context'
import { resolveDestination, type Destination } from '@/features/maps/destination'
import { fetchPlaces } from '@/features/maps/overpass'
import { mapCities, type Poi } from '@/features/maps/poi'
import { dayDate, generateItinerary, planToText, type Pace, type PlanDay } from './planner'

const INTERESTS = ['Culture', 'Food', 'Nature', 'Beaches', 'Cities', 'Adventure', 'Family']

export default function PlannerCard() {
  const { user, profile } = useAuth()
  const [query, setQuery] = useState('')
  const [dest, setDest] = useState<Destination | null>(null)
  const [places, setPlaces] = useState<Poi[]>([])
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [finding, setFinding] = useState(false)

  const [traveller, setTraveller] = useState(user?.name ?? '')
  const [startDate, setStartDate] = useState('')
  const [stay, setStay] = useState('')
  const [days, setDays] = useState(5)
  const [pace, setPace] = useState<Pace>('balanced')
  const [interests, setInterests] = useState<string[]>(profile?.interests.filter((i) => INTERESTS.includes(i)) ?? [])
  const [plan, setPlan] = useState<PlanDay[] | null>(null)
  const [copied, setCopied] = useState(false)

  const find = async (text: string) => {
    setFinding(true)
    setMsg(null)
    setSuggestions([])
    setPlan(null)
    setPlaces([])
    try {
      const r = await resolveDestination(text)
      if (!r.destination) {
        setDest(null)
        setMsg(r.message ?? 'Destination not found.')
        setSuggestions(r.suggestions ?? [])
        return
      }
      setDest(r.destination)
      try {
        const found = await fetchPlaces(r.destination.center)
        setPlaces(found)
        setMsg(found.length >= 4 ? `Found ${found.length} real places in ${r.destination.name}.` : 'Few places were found nearby, so some days will have free time. Try a bigger city.')
      } catch {
        setMsg('Could not load places right now (the free map service is busy). Try again in a moment.')
      }
    } catch {
      setDest(null)
      setMsg('Search is unavailable right now. Try again in a moment.')
    } finally {
      setFinding(false)
    }
  }

  const generate = () => {
    if (!dest) return
    setPlan(generateItinerary({ city: dest.name.split(',')[0]!, days, pace, interests, places }))
    setCopied(false)
  }

  const downloadPdf = async () => {
    if (!dest || !plan) return
    const { buildItineraryPdf } = await import('./itinerary-pdf')
    const bytes = await buildItineraryPdf({ traveller, destination: dest.name, startDate: startDate || undefined, accommodation: stay, plan })
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `itinerary-${dest.name.split(',')[0]!.toLowerCase().replace(/\s+/g, '-')}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Card className="p-5">
      <h2 className="font-semibold">Trip itinerary</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Search any city in the world. Days are built from real places on OpenStreetMap (free, no account), grouped so each day stays in one area.
        Add your dates and hotel, then download a PDF to attach to your visa file. It does not check opening hours or tickets.
      </p>

      <form className="mt-4 flex items-end gap-2" role="search" onSubmit={(e) => { e.preventDefault(); void find(query) }}>
        <div className="flex-1">
          <Field label="Destination city" htmlFor="pl-q">
            <Input id="pl-q" list="pl-cities" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. Lisbon, Dubai, Istanbul" autoComplete="off" />
          </Field>
          <datalist id="pl-cities">{mapCities.map((c) => <option key={c} value={c} />)}</datalist>
        </div>
        <Button type="submit" variant="outline" disabled={finding || !query.trim()}><Search className="size-4" aria-hidden />{finding ? 'Finding…' : 'Find'}</Button>
      </form>

      {msg && <p role="status" className="mt-2 text-sm text-ink-soft">{msg}</p>}
      {suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {suggestions.map((c) => <Button key={c} size="sm" variant="outline" onClick={() => { setQuery(c); void find(c) }}>{c}</Button>)}
        </div>
      )}

      {dest && (
        <>
          <p className="mt-4 flex items-center gap-2 text-sm font-medium"><MapPin className="size-4 text-accent" aria-hidden />{dest.name}</p>
          <form className="mt-3 grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); generate() }}>
            <Field label="Traveller name" htmlFor="pl-name"><Input id="pl-name" value={traveller} onChange={(e) => setTraveller(e.target.value)} /></Field>
            <Field label="Arrival date" htmlFor="pl-start"><Input id="pl-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></Field>
            <Field label="Hotel or accommodation (name and city)" htmlFor="pl-stay"><Input id="pl-stay" value={stay} onChange={(e) => setStay(e.target.value)} placeholder="e.g. Hotel Avenida Palace, Lisbon" /></Field>
            <Field label="Days (1–14)" htmlFor="pl-days"><Input id="pl-days" type="number" min={1} max={14} value={days} onChange={(e) => setDays(Number(e.target.value) || 1)} /></Field>
            <Field label="Pace" htmlFor="pl-pace">
              <Select id="pl-pace" value={pace} onChange={(e) => setPace(e.target.value as Pace)}>
                <option value="relaxed">Relaxed (1 per day)</option><option value="balanced">Balanced (2 per day)</option><option value="packed">Packed (3 per day)</option>
              </Select>
            </Field>
            <fieldset className="flex flex-wrap gap-3 text-sm sm:col-span-2">
              <legend className="mb-1 text-xs font-medium text-ink-soft">Interests</legend>
              {INTERESTS.map((i) => (
                <label key={i} className="flex items-center gap-2">
                  <input type="checkbox" checked={interests.includes(i)} onChange={(e) => setInterests((s) => (e.target.checked ? [...s, i] : s.filter((x) => x !== i)))} />{i}
                </label>
              ))}
            </fieldset>
            <div className="sm:col-span-2"><Button type="submit" variant="accent">Generate itinerary</Button></div>
          </form>
        </>
      )}

      {plan && dest && (
        <div className="mt-6 space-y-4">
          <ol className="space-y-3">
            {plan.map((d) => {
              const date = dayDate(startDate, d.day - 1)
              return (
                <li key={d.day} className="rounded-xl border border-line p-4">
                  <h3 className="text-sm font-semibold">Day {d.day}{date ? ` · ${date}` : ''}</h3>
                  <ul className="mt-2 space-y-1.5 text-sm">
                    {d.items.map((i) => (
                      <li key={i.slot}>
                        <span className="inline-block w-24 text-xs text-ink-soft">{i.slot}</span>{i.title}
                        {i.kind === 'restaurant' && <span className="ml-2 text-xs text-ink-soft">(food)</span>}
                        {i.kind === 'suggestion' && <span className="ml-2 text-xs text-ink-soft">(free time)</span>}
                      </li>
                    ))}
                  </ul>
                </li>
              )
            })}
          </ol>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="sm" onClick={() => void downloadPdf()}><Download className="size-4" aria-hidden />Download PDF</Button>
            <Button variant="outline" size="sm" onClick={() => void navigator.clipboard.writeText(planToText(dest.name, plan, startDate || undefined)).then(() => setCopied(true))}>{copied ? 'Copied' : 'Copy as text'}</Button>
          </div>
          <p className="text-xs text-ink-soft">A consulate also expects confirmed flight and hotel reservations. Attach those together with this plan.</p>
        </div>
      )}
    </Card>
  )
}

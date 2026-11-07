import { haversineKm } from '@/features/maps/geo'
import { poisForCity, type Poi } from '@/features/maps/poi'

/**
 * Rule-based itinerary generator: free, deterministic, works offline, and sends nothing anywhere.
 * It is NOT an AI model. It orders real landmarks by proximity and fills gaps with generic suggestions
 * driven by the traveller's interests. Opening hours, tickets and travel times are not checked.
 */

export type Pace = 'relaxed' | 'balanced' | 'packed'
export type Slot = 'Morning' | 'Afternoon' | 'Evening'

export interface PlanItem {
  slot: Slot
  title: string
  kind: 'landmark' | 'restaurant' | 'suggestion'
  note?: string
}
export interface PlanDay {
  day: number
  items: PlanItem[]
}

const PER_DAY: Record<Pace, number> = { relaxed: 1, balanced: 2, packed: 3 }
const SLOTS: Slot[] = ['Morning', 'Afternoon', 'Evening']

const SUGGESTIONS: Record<string, string[]> = {
  Culture: ['Visit a local museum or gallery', 'Explore a historic neighbourhood on foot'],
  Food: ['Try a local market and street food', 'Book a dinner at a well-reviewed local restaurant'],
  Nature: ['Spend time in a park or green space', 'Take a walk along the water'],
  Beaches: ['Relax at a nearby beach or waterfront'],
  Cities: ['Wander the city centre and its shops', 'Sunset from a viewpoint'],
  Adventure: ['Join a guided outdoor activity'],
  Business: ['Keep a free block for meetings and rest'],
  Family: ['A relaxed activity suited to children'],
  _default: ['Free time to explore at your own pace', 'Local café stop and people-watching'],
}

function orderByProximity(pois: Poi[]): Poi[] {
  if (pois.length < 3) return pois
  const left = [...pois]
  const out = [left.shift()!]
  while (left.length) {
    const last = out[out.length - 1]!
    let bi = 0
    for (let i = 1; i < left.length; i++) if (haversineKm(last, left[i]!) < haversineKm(last, left[bi]!)) bi = i
    out.push(left.splice(bi, 1)[0]!)
  }
  return out
}

function pickNearest(list: Poi[], from: Poi | undefined): Poi | undefined {
  if (!list.length) return undefined
  if (!from) return list.shift()
  let bi = 0
  for (let i = 1; i < list.length; i++) if (haversineKm(from, list[i]!) < haversineKm(from, list[bi]!)) bi = i
  return list.splice(bi, 1)[0]
}

/**
 * Itinerary from real OpenStreetMap places (any city): each day starts from a well-known sight and the rest of the day stays close to it;
 * evenings go to a nearby restaurant or market. Falls back to the generic generator when no places are supplied.
 */
function generateFromPlaces(opts: { days: number; pace: Pace; interests: string[]; places: Poi[] }): PlanDay[] {
  const days = Math.min(Math.max(Math.floor(opts.days), 1), 14)
  const perDay = PER_DAY[opts.pace]
  const wantsNature = opts.interests.some((i) => ['Nature', 'Family', 'Beaches'].includes(i))
  const wantsFood = opts.interests.includes('Food')
  const sights = opts.places.filter((p) => p.category === 'sight')
  const parks = opts.places.filter((p) => p.category === 'park')
  const food = opts.places.filter((p) => p.category === 'food')
  // Interest-based pool for daytime: parks are mixed in only if the traveller likes nature.
  const day = wantsNature ? [...sights.slice(0, Math.ceil(sights.length * 0.7)), ...parks.slice(0, 6)] : [...sights]
  const rest = [...day.filter((p) => p.category === 'sight'), ...day.filter((p) => p.category === 'park')]
  const pool = [...new Set([...opts.interests.flatMap((i) => SUGGESTIONS[i] ?? []), ...SUGGESTIONS._default!])]
  let si = 0
  return Array.from({ length: days }, (_, d) => {
    const items: PlanItem[] = []
    let anchor: Poi | undefined
    for (let k = 0; k < perDay; k++) {
      const slot = SLOTS[k]!
      const evening = slot === 'Evening' || (wantsFood && k === perDay - 1 && perDay > 1)
      const spot = evening ? pickNearest(food, anchor) ?? pickNearest(rest, anchor) : pickNearest(rest, anchor) ?? pickNearest(food, anchor)
      if (spot) {
        anchor = spot
        items.push({ slot, title: spot.title, kind: spot.category === 'food' ? 'restaurant' : 'landmark', note: spot.detail })
      } else {
        items.push({ slot, title: pool[si % pool.length]!, kind: 'suggestion' })
        si++
      }
    }
    return { day: d + 1, items }
  })
}

export function generateItinerary(opts: { city: string; days: number; pace: Pace; interests: string[]; places?: Poi[] }): PlanDay[] {
  if (opts.places && opts.places.length >= 4) return generateFromPlaces({ ...opts, places: opts.places })
  const days = Math.min(Math.max(Math.floor(opts.days), 1), 14)
  const perDay = PER_DAY[opts.pace]
  const landmarks = orderByProximity(poisForCity(opts.city).filter((p) => p.kind === 'attraction'))
  const pool = [...new Set([...opts.interests.flatMap((i) => SUGGESTIONS[i] ?? []), ...SUGGESTIONS._default!])]
  let li = 0
  let si = 0

  return Array.from({ length: days }, (_, d) => {
    const items: PlanItem[] = []
    for (let k = 0; k < perDay; k++) {
      const slot = SLOTS[k]!
      const lm = landmarks[li]
      if (lm) {
        li++
        items.push({ slot, title: lm.title, kind: 'landmark', note: 'Check opening hours and tickets before you go.' })
      } else {
        items.push({ slot, title: pool[si % pool.length]!, kind: 'suggestion' })
        si++
      }
    }
    return { day: d + 1, items }
  })
}

export function dayDate(start: string | undefined, offset: number): string | null {
  if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start)) return null
  const d = new Date(`${start}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().slice(0, 10)
}

export function planToText(city: string, plan: PlanDay[], startDate?: string): string {
  return [
    `Itinerary for ${city}`,
    ...plan.flatMap((d) => {
      const date = dayDate(startDate, d.day - 1)
      return [`Day ${d.day}${date ? ` (${date})` : ''}`, ...d.items.map((i) => `  ${i.slot}: ${i.title}${i.kind === 'suggestion' ? ' (suggestion)' : ''}`)]
    }),
  ].join('\n')
}

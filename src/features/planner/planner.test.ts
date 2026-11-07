import { generateItinerary, planToText } from './planner'

describe('generateItinerary', () => {
  it('creates the requested number of days within limits', () => {
    expect(generateItinerary({ city: 'Paris', days: 3, pace: 'balanced', interests: [] })).toHaveLength(3)
    expect(generateItinerary({ city: 'Paris', days: 0, pace: 'balanced', interests: [] })).toHaveLength(1)
    expect(generateItinerary({ city: 'Paris', days: 99, pace: 'balanced', interests: [] })).toHaveLength(14)
  })

  it('schedules items per day according to pace', () => {
    for (const [pace, n] of [['relaxed', 1], ['balanced', 2], ['packed', 3]] as const) {
      const plan = generateItinerary({ city: 'Tokyo', days: 4, pace, interests: [] })
      expect(plan.every((d) => d.items.length === n)).toBe(true)
    }
  })

  it('uses each real landmark at most once, before falling back to suggestions', () => {
    const plan = generateItinerary({ city: 'London', days: 5, pace: 'balanced', interests: ['Food'] })
    const landmarks = plan.flatMap((d) => d.items).filter((i) => i.kind === 'landmark').map((i) => i.title)
    expect(landmarks).toHaveLength(3)
    expect(new Set(landmarks).size).toBe(3)
    // landmarks come first, so day 1 is entirely landmarks
    expect(plan[0]!.items.every((i) => i.kind === 'landmark')).toBe(true)
    expect(plan[4]!.items.every((i) => i.kind === 'suggestion')).toBe(true)
  })

  it('is deterministic and reflects interests in suggestions', () => {
    const a = generateItinerary({ city: 'Dubai', days: 6, pace: 'packed', interests: ['Beaches'] })
    expect(generateItinerary({ city: 'Dubai', days: 6, pace: 'packed', interests: ['Beaches'] })).toEqual(a)
    expect(a.flatMap((d) => d.items).some((i) => /beach/i.test(i.title))).toBe(true)
  })

  it('can build itineraries from newly added curated destinations', () => {
    const plan = generateItinerary({ city: 'Cairo', days: 2, pace: 'balanced', interests: [] })
    expect(plan[0]!.items.map((item) => item.title)).toEqual(['Egyptian Museum', 'Khan el-Khalili'])
  })

  it('works for a city with no landmark data', () => {
    const plan = generateItinerary({ city: 'Nowhere', days: 2, pace: 'balanced', interests: [] })
    expect(plan.flatMap((d) => d.items).every((i) => i.kind === 'suggestion')).toBe(true)
  })

  it('renders plain text and marks suggestions', () => {
    const txt = planToText('Paris', generateItinerary({ city: 'Paris', days: 2, pace: 'balanced', interests: [] }))
    expect(txt).toContain('Day 1')
    expect(txt).toContain('(suggestion)')
  })
})

describe('generateItinerary with real places', () => {
  const mk = (i: number, category: 'sight' | 'park' | 'food', lat: number) => ({
    id: `p${i}`, kind: 'attraction' as const, category, title: `${category}-${i}`, detail: 'x', lat, lng: 10,
  })
  const places = [mk(1, 'sight', 1), mk(2, 'sight', 1.01), mk(3, 'sight', 1.02), mk(4, 'sight', 1.03), mk(5, 'food', 1.0), mk(6, 'food', 1.02), mk(7, 'park', 1.0)]

  it('uses real places, never repeats one, and puts food in the evening', () => {
    const plan = generateItinerary({ city: 'Anywhere', days: 2, pace: 'packed', interests: [], places })
    const titles = plan.flatMap((d) => d.items).map((i) => i.title)
    expect(new Set(titles).size).toBe(titles.length)
    expect(plan.every((d) => d.items[2]!.kind === 'restaurant')).toBe(true)
    expect(titles.some((t) => /free time|explore/i.test(t))).toBe(false)
  })

  it('falls back to the curated generator when too few places are found', () => {
    const plan = generateItinerary({ city: 'Paris', days: 1, pace: 'relaxed', interests: [], places: places.slice(0, 2) })
    expect(plan[0]!.items[0]!.title).toBe('Eiffel Tower')
  })
})

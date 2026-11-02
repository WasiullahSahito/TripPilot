import type { HotelListing, StayKind } from '@/services/hotels'

export interface ListingFilters {
  kinds: StayKind[] // empty = all
  minStars: number // 0 = any; listings with no star data are excluded when > 0
  withWebsite: boolean
  query: string
}

export type ListingSort = 'distance' | 'name' | 'stars'

export function filterListings(listings: HotelListing[], f: ListingFilters): HotelListing[] {
  const q = f.query.trim().toLowerCase()
  return listings.filter(
    (l) =>
      (f.kinds.length === 0 || f.kinds.includes(l.kind)) &&
      (f.minStars === 0 || (l.stars !== null && l.stars >= f.minStars)) &&
      (!f.withWebsite || l.website !== null) &&
      (q === '' || l.name.toLowerCase().includes(q) || l.address.toLowerCase().includes(q)),
  )
}

export function sortListings(listings: HotelListing[], by: ListingSort): HotelListing[] {
  const cmp = {
    distance: (a: HotelListing, b: HotelListing) => a.distanceKm - b.distanceKm,
    name: (a: HotelListing, b: HotelListing) => a.name.localeCompare(b.name),
    // Unrated properties sort last rather than first.
    stars: (a: HotelListing, b: HotelListing) => (b.stars ?? -1) - (a.stars ?? -1) || a.distanceKm - b.distanceKm,
  }[by]
  return [...listings].sort(cmp)
}

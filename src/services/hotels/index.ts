import { api } from '@/lib/api'
import type { DirectoryResult } from './types'

/** Real properties near a point, from the API's OpenStreetMap directory (cached server-side). */
export function searchDirectory(lat: number, lng: number, radiusM = 5000): Promise<DirectoryResult> {
  const qs = new URLSearchParams({ lat: String(lat), lng: String(lng), radius: String(radiusM) })
  return api<DirectoryResult>(`/hotels/directory?${qs}`)
}

export * from './types'

import { api } from '@/lib/api'
import type { FlightProvider, FlightSearchResult } from './types'

/** Returns provider data only. Missing or unavailable providers are shown as errors, never fabricated offers. */
export const flightProvider: FlightProvider = {
  async search(params) {
    const provider = await api<Omit<FlightSearchResult, 'mode'>>('/flights/search', { method: 'POST', body: params })
    return { ...provider, mode: 'live' }
  },
}

export type * from './types'

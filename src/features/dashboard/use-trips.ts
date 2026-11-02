import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { NewTrip, Trip, TripStatus } from '@/types/api'

export function useTrips() {
  const [trips, setTrips] = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setTrips((await api<{ trips: Trip[] }>('/trips')).trips)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load trips')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return {
    trips,
    loading,
    error,
    reload: load,
    async create(t: NewTrip) {
      await api('/trips', { method: 'POST', body: t })
      await load()
    },
    async setStatus(id: string, status: TripStatus) {
      await api(`/trips/${id}`, { method: 'PATCH', body: { status } })
      await load()
    },
    async remove(id: string) {
      await api(`/trips/${id}`, { method: 'DELETE' })
      await load()
    },
  }
}

import { useCallback, useEffect, useState } from 'react'
import { appointmentsApi, type AppointmentDto } from '@/features/appointments/appointments-api'
import { bookingsApi, type BookingDto } from '@/features/bookings/bookings-api'
import { documentsApi } from '@/features/documents/documents-api'
import type { DocumentMeta } from '@/features/documents/assemble-items'
import { visaApi, type ApplicationDto } from '@/features/visa/visa-api'

export interface TravelData {
  applications: ApplicationDto[]
  bookings: BookingDto[]
  appointments: AppointmentDto[]
  documents: DocumentMeta[]
}

/** Loads everything the dashboard and notifications need, in parallel. */
export function useTravelData() {
  const [data, setData] = useState<TravelData | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [applications, bookings, appointments, documents] = await Promise.all([
        visaApi.list(), bookingsApi.list(), appointmentsApi.list(), documentsApi.list(),
      ])
      setData({ applications, bookings, appointments, documents })
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your data')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return { data, error, reload: load }
}

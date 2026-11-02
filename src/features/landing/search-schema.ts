import { z } from 'zod'
import { tripPurposes } from '@/config/site'

export const tripSearchSchema = z
  .object({
    destination: z.string().trim().min(2, 'Enter a destination'),
    nationality: z.string().trim().min(2, 'Enter your nationality'),
    departure: z.string().min(1, 'Choose a departure date'),
    returnDate: z.string().min(1, 'Choose a return date'),
    purpose: z.enum(tripPurposes),
  })
  .refine((v) => v.returnDate >= v.departure, { path: ['returnDate'], message: 'Return must be on or after departure' })

export type TripSearch = z.infer<typeof tripSearchSchema>

export function toVisaQuery(v: TripSearch) {
  return new URLSearchParams({
    destination: v.destination, nationality: v.nationality, from: v.departure, to: v.returnDate, purpose: v.purpose,
  }).toString()
}

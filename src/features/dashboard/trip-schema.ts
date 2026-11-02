import { z } from 'zod'

export const tripFormSchema = z
  .object({
    destination: z.string().trim().min(2, 'Enter a destination').max(80),
    departOn: z.string().min(1, 'Choose a departure date'),
    returnOn: z.string().min(1, 'Choose a return date'),
    purpose: z.string().trim().min(1, 'Enter a purpose').max(40),
    budget: z
      .string()
      .trim()
      .refine((v) => v === '' || (!Number.isNaN(Number(v)) && Number(v) >= 0), 'Enter a positive number'),
  })
  .refine((v) => v.returnOn >= v.departOn, { path: ['returnOn'], message: 'Return must be on or after departure' })

export type TripFormValues = z.infer<typeof tripFormSchema>

export function toNewTrip(v: TripFormValues) {
  return {
    destination: v.destination,
    departOn: v.departOn,
    returnOn: v.returnOn,
    purpose: v.purpose,
    budget: v.budget === '' ? null : Number(v.budget),
  }
}

/** Whole days from today (local) to the given YYYY-MM-DD; negative if past. */
export function daysUntil(date: string, now = new Date()) {
  const [y, m, d] = date.split('-').map(Number)
  const target = Date.UTC(y!, m! - 1, d!)
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((target - today) / 86_400_000)
}

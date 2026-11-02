import { z } from 'zod'
import { RETENTION_CHOICES } from './retention.ts'

/** `null` means "keep my files until I delete them". Only the offered periods are accepted. */
export const retentionSchema = z.object({
  days: z.union([z.null(), z.number().int().refine((n) => (RETENTION_CHOICES as readonly number[]).includes(n), 'Choose one of the offered periods')]),
})

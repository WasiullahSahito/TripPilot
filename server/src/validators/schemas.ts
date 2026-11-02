import { z } from 'zod'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
const text = (max: number) => z.string().trim().min(1).max(max)

const COMMON = new Set([
  'password12', 'password123', 'password1234', '1234567890', '12345678910', 'qwertyuiop', 'qwerty12345', 'iloveyou12',
  'letmein1234', 'welcome1234', 'admin12345', 'trippilot', 'trippilot1', 'trippilot123', 'abcdefghij', 'abc1234567',
])

/** Length is the main rule; this blocks the obvious: common passwords, one repeated character, and the email name. */
export function passwordProblem(password: string, email: string): string | null {
  const p = password.toLowerCase()
  if (COMMON.has(p)) return 'That password is too common'
  if (new Set(p).size < 4) return 'Use a more varied password'
  const local = email.split('@')[0]?.toLowerCase() ?? ''
  if (local.length >= 4 && p.includes(local)) return 'Password must not contain your email name'
  return null
}

export const registerSchema = z.object({
  name: text(80),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(10, 'Password must be at least 10 characters').max(128),
}).superRefine((v, ctx) => {
  const problem = passwordProblem(v.password, v.email)
  if (problem) ctx.addIssue({ code: 'custom', path: ['password'], message: problem })
})

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(128),
})

export const profileSchema = z.object({
  nationality: text(60),
  residenceCountry: text(60),
  homeAirport: z.string().trim().max(60).default(''),
  interests: z.array(text(40)).max(12).default([]),
})

export const accountNameSchema = z.object({
  name: text(80),
})

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(10, 'Password must be at least 10 characters').max(128),
})

const tripBase = z.object({
  destination: text(80),
  departOn: isoDate,
  returnOn: isoDate,
  purpose: text(40),
  budget: z.number().nonnegative().max(10_000_000).nullable().default(null),
})

export const tripSchema = tripBase.refine((t) => t.returnOn >= t.departOn, {
  path: ['returnOn'],
  message: 'Return date must be on or after departure',
})

export const tripUpdateSchema = tripBase
  .partial()
  .extend({ status: z.enum(['planning', 'ready', 'completed']).optional() })
  .refine((t) => !t.departOn || !t.returnOn || t.returnOn >= t.departOn, {
    path: ['returnOn'],
    message: 'Return date must be on or after departure',
  })

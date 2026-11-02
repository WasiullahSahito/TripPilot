import { randomBytes } from 'node:crypto'
import { env } from './config/env.ts'
import { createStack } from './models/create-stack.ts'
import { hashPassword, newUser } from './services/auth-service.ts'
import { passwordProblem } from './validators/schemas.ts'

/**
 * Creates (or repairs) the admin account for testing the admin panel. Idempotent.
 *   ADMIN_EMAIL     required (already in .env.example)
 *   ADMIN_PASSWORD  optional; if omitted a strong random password is generated and printed once.
 *                   If the account already exists, the password is only changed when ADMIN_PASSWORD is set.
 * The account is created verified, with the admin role and a completed profile, in whichever storage the API uses
 * (Supabase when configured, otherwise the local files), so it is the same account you log in with.
 */
const email = env.adminEmail
if (!email) {
  console.error('Set ADMIN_EMAIL in .env first (the address the admin account will use).')
  process.exit(1)
}

const supplied = process.env.ADMIN_PASSWORD?.trim() || null
const password = supplied ?? randomBytes(15).toString('base64url')
const problem = passwordProblem(password, email)
if (password.length < 10 || problem) {
  console.error(`ADMIN_PASSWORD is not acceptable: ${problem ?? 'use at least 10 characters'}.`)
  process.exit(1)
}

const stack = createStack()
const now = new Date().toISOString()
const existing = await stack.store.findUserByEmail(email)
let created = false

if (existing) {
  await stack.store.saveUser({
    ...existing,
    role: 'admin',
    emailVerifiedAt: existing.emailVerifiedAt ?? now,
    verifyToken: null,
    ...(supplied ? { passwordHash: await hashPassword(password) } : {}),
  })
} else {
  const user = newUser({ name: 'Admin', email, passwordHash: await hashPassword(password) })
  await stack.store.saveUser({ ...user, role: 'admin', emailVerifiedAt: now, verifyToken: null })
  await stack.store.saveProfile({
    userId: user.id, nationality: 'N/A', residenceCountry: 'N/A', homeAirport: '', interests: [], onboardedAt: now,
  })
  created = true
}

console.log(`\nStorage: ${stack.mode}`)
console.log(created ? `Created admin account: ${email}` : `Admin account already existed: ${email} (role set to admin, email marked verified)`)
if (created || supplied) {
  console.log(supplied ? 'Password: the ADMIN_PASSWORD you provided.' : `Password (shown once, change it for anything beyond testing): ${password}`)
} else {
  console.log('Password unchanged. Set ADMIN_PASSWORD and run again to change it.')
}
console.log('\nLog in at /login, then open /admin.\n')

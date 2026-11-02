import { randomBytes, randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { env } from '../config/env.ts'
import type { PublicUser, Role, User } from '../models/types.ts'

export interface Session {
  sub: string
  role: Role
}

// Compared against when the email is unknown so response time doesn't reveal account existence.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', env.bcryptCost)

export const hashPassword = (pw: string) => bcrypt.hash(pw, env.bcryptCost)

export async function checkPassword(user: User | undefined, pw: string) {
  const ok = await bcrypt.compare(pw, user?.passwordHash ?? DUMMY_HASH)
  return !!user && ok
}

export function signSession(user: User) {
  return jwt.sign({ sub: user.id, role: user.role } satisfies Session, env.jwtSecret, {
    expiresIn: '7d',
    algorithm: 'HS256',
  })
}

export function verifySession(token: string): Session | null {
  try {
    const p = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] }) as Partial<Session>
    // Only genuine login tokens carry a role: any other token signed by this server must never pass as a session.
    if (typeof p.sub !== 'string' || (p.role !== 'user' && p.role !== 'admin')) return null
    return { sub: p.sub, role: p.role }
  } catch {
    return null
  }
}

export function newUser(input: { name: string; email: string; passwordHash: string }): User {
  return {
    id: randomUUID(),
    name: input.name,
    email: input.email,
    passwordHash: input.passwordHash,
    // Never admin at registration: the admin role is granted only after the address is verified (see verify-email).
    role: 'user',
    emailVerifiedAt: null,
    verifyToken: randomBytes(24).toString('hex'),
    createdAt: new Date().toISOString(),
  }
}

export const toPublicUser = (u: User): PublicUser => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  emailVerified: !!u.emailVerifiedAt,
})

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { env } from '../config/env.ts'

const key = Buffer.from(env.dataKey, 'hex')
if (key.length !== 32) throw new Error('DATA_KEY must be 32 bytes of hex (64 characters)')

/** AES-256-GCM. Output format: v1.<iv>.<tag>.<ciphertext>, all base64url. */
export function encryptJson(value: unknown): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.')
}

export function decryptJson<T>(payload: string): T {
  const [v, iv, tag, ct] = payload.split('.')
  if (v !== 'v1' || !iv || !tag || !ct) throw new Error('Unsupported ciphertext')
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'))
  d.setAuthTag(Buffer.from(tag, 'base64url'))
  const pt = Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()])
  return JSON.parse(pt.toString('utf8')) as T
}

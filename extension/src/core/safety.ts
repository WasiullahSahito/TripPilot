/**
 * What the assistant will NEVER touch. These rules exist so it cannot be used to defeat verification or to handle
 * secrets: CAPTCHAs, one-time codes, passwords, payment details, file uploads and buttons are always excluded.
 */

export interface FieldMeta {
  tag: 'input' | 'textarea' | 'select'
  type: string
  name: string
  id: string
  label: string
  placeholder: string
  autocomplete: string
  disabled: boolean
  readOnly: boolean
  visible: boolean
}

const BLOCKED_TYPES = new Set(['password', 'file', 'hidden', 'submit', 'button', 'reset', 'image', 'checkbox', 'radio', 'range', 'color'])

const SENSITIVE =
  /captcha|recaptcha|hcaptcha|turnstile|otp|one[\s_-]?time|verification[\s_-]?code|security[\s_-]?code|sms[\s_-]?code|cvv|cvc|card|iban|routing|account[\s_-]?number|passcode|password|\bpin\b|secret|token|csrf/i

const BLOCKED_AUTOCOMPLETE = /^(cc-|one-time-code|current-password|new-password|transaction-)/i

export type Exclusion = 'blocked-type' | 'sensitive' | 'disabled' | 'readonly' | 'hidden'

/** Returns why a field must not be filled, or null if it may be offered to the user for approval. */
export function exclusionReason(f: FieldMeta): Exclusion | null {
  if (f.disabled) return 'disabled'
  if (f.readOnly) return 'readonly'
  if (!f.visible) return 'hidden'
  if (BLOCKED_TYPES.has(f.type.toLowerCase())) return 'blocked-type'
  if (BLOCKED_AUTOCOMPLETE.test(f.autocomplete)) return 'sensitive'
  if (SENSITIVE.test(`${f.name} ${f.id} ${f.label} ${f.placeholder} ${f.autocomplete}`)) return 'sensitive'
  return null
}

export const isFillable = (f: FieldMeta) => exclusionReason(f) === null

/** Hostnames the user has chosen to allow. Empty list = ask every time (the default). */
export function hostStatus(hostname: string, allowlist: string[]): 'allowed' | 'unlisted' | 'no-list' {
  if (allowlist.length === 0) return 'no-list'
  const h = hostname.toLowerCase()
  return allowlist.some((a) => h === a || h.endsWith(`.${a}`)) ? 'allowed' : 'unlisted'
}

/** Accepts a bare hostname only (no scheme, path or wildcard), returning it normalised, or null. */
export function normaliseHost(input: string): string | null {
  const h = input.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  return /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$|^localhost$/.test(h) ? h : null
}

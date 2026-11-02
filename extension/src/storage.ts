import { isExpired, parsePayload, type AssistantPayload } from './core/payload'
import { parseUserAdapters, type UserAdapters } from './core/user-adapters'

/**
 * Exported personal data lives in chrome.storage.session: memory only, cleared when the browser closes, and not
 * readable from web pages or content scripts (trusted extension contexts only). The allowlist is not sensitive and
 * is kept in chrome.storage.local.
 */
const PAYLOAD_KEY = 'payload'
const ALLOWLIST_KEY = 'allowlist'

export async function lockSessionStorage() {
  await chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })
}

export async function loadPayload(): Promise<AssistantPayload | null> {
  const got = await chrome.storage.session.get(PAYLOAD_KEY)
  const text = got[PAYLOAD_KEY] as string | undefined
  if (!text) return null
  const parsed = parsePayload(text)
  if (!parsed.ok) {
    await clearPayload() // expired or corrupt: remove it rather than keep stale personal data
    return null
  }
  return parsed.payload
}

export async function savePayload(text: string): Promise<{ ok: true; payload: AssistantPayload } | { ok: false; error: string }> {
  const parsed = parsePayload(text)
  if (!parsed.ok) return parsed
  await chrome.storage.session.set({ [PAYLOAD_KEY]: text })
  return parsed
}

export async function clearPayload() {
  await chrome.storage.session.remove(PAYLOAD_KEY)
}

export async function expireIfNeeded(): Promise<boolean> {
  const p = await loadPayload()
  if (p && isExpired(p)) {
    await clearPayload()
    return true
  }
  return false
}

export async function getAllowlist(): Promise<string[]> {
  const got = await chrome.storage.local.get(ALLOWLIST_KEY)
  const v = got[ALLOWLIST_KEY] as unknown
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

export async function setAllowlist(list: string[]) {
  await chrome.storage.local.set({ [ALLOWLIST_KEY]: [...new Set(list)].sort() })
}

const ADAPTERS_KEY = 'userAdapters'

/** Pins the user taught the extension: selectors only, never personal data. Always re-validated on read. */
export async function getUserAdapters(): Promise<UserAdapters> {
  const got = await chrome.storage.local.get(ADAPTERS_KEY)
  return parseUserAdapters(got[ADAPTERS_KEY])
}

export async function setUserAdapters(a: UserAdapters) {
  await chrome.storage.local.set({ [ADAPTERS_KEY]: parseUserAdapters(a) })
}

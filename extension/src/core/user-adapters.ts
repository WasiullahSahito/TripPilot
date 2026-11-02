import { FIELD_KEYS, type FieldKey } from './payload'
import { normaliseHost } from './safety'

/**
 * Site adapters the USER teaches the extension. Instead of shipping guesses about government websites (which change
 * without notice and could silently fill the wrong field), a user pins a field once ("this box is the surname") and
 * the extension remembers it for that site. Pins are plain selectors of one of two safe shapes, and every value
 * still goes through the preview-and-approve step.
 */
export type SiteHints = Partial<Record<FieldKey, string>>
export type UserAdapters = Record<string, SiteHints>

export const MAX_SITES = 50
export const MAX_HINTS_PER_SITE = 40

/** Only these selector shapes are ever accepted: an id or a name on a form control. */
const SAFE_SELECTOR = /^(?:input|textarea|select)?\[(?:id|name)="[A-Za-z0-9_.:\-]{1,80}"\]$/
export const isSafeSelector = (s: unknown): s is string => typeof s === 'string' && SAFE_SELECTOR.test(s)

const isKey = (k: string): k is FieldKey => (FIELD_KEYS as readonly string[]).includes(k)

/** Cleans untrusted data (storage contents or an imported file) down to what is valid; silently drops the rest. */
export function parseUserAdapters(raw: unknown): UserAdapters {
  const out: UserAdapters = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [rawHost, hints] of Object.entries(raw as Record<string, unknown>)) {
    if (Object.keys(out).length >= MAX_SITES) break
    const host = normaliseHost(rawHost)
    if (!host || !hints || typeof hints !== 'object') continue
    const clean: SiteHints = {}
    for (const [k, sel] of Object.entries(hints as Record<string, unknown>)) {
      if (Object.keys(clean).length >= MAX_HINTS_PER_SITE) break
      if (isKey(k) && isSafeSelector(sel)) clean[k] = sel
    }
    if (Object.keys(clean).length > 0) out[host] = clean
  }
  return out
}

export type PinResult = { ok: true; adapters: UserAdapters } | { ok: false; error: string }

/** Remember that `selector` is where `key` goes on `host`. A key points at one field per site: re-pinning moves it. */
export function pin(adapters: UserAdapters, host: string, key: FieldKey, selector: string): PinResult {
  const h = normaliseHost(host)
  if (!h) return { ok: false, error: 'This page has no usable website name.' }
  if (!isSafeSelector(selector)) return { ok: false, error: 'This field has no stable id or name, so it cannot be remembered.' }
  const site = adapters[h] ?? {}
  if (!(h in adapters) && Object.keys(adapters).length >= MAX_SITES) return { ok: false, error: `You can remember at most ${MAX_SITES} sites.` }
  if (!(key in site) && Object.keys(site).length >= MAX_HINTS_PER_SITE) return { ok: false, error: `At most ${MAX_HINTS_PER_SITE} fields can be remembered per site.` }
  return { ok: true, adapters: { ...adapters, [h]: { ...site, [key]: selector } } }
}

export function unpin(adapters: UserAdapters, host: string, key?: FieldKey): UserAdapters {
  const site = adapters[host]
  if (!site) return adapters
  const rest = { ...adapters }
  if (!key) {
    delete rest[host]
    return rest
  }
  const { [key]: _removed, ...hints } = site
  if (Object.keys(hints).length === 0) delete rest[host]
  else rest[host] = hints
  return rest
}

/** Taught pins override the bundled ones for the same field. */
export function mergeHints(bundled: SiteHints | undefined, taught: SiteHints | undefined): SiteHints {
  return { ...(bundled ?? {}), ...(taught ?? {}) }
}

export const exportAdapters = (a: UserAdapters) => JSON.stringify({ app: 'trippilot-adapters', version: 1, sites: a }, null, 2)

export type ImportResult = { ok: true; adapters: UserAdapters; sitesAdded: number } | { ok: false; error: string }

export function importAdapters(text: string, existing: UserAdapters): ImportResult {
  if (text.length > 200_000) return { ok: false, error: 'That file is too large.' }
  let json: { app?: unknown; version?: unknown; sites?: unknown }
  try {
    json = JSON.parse(text) as typeof json
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' }
  }
  if (json.app !== 'trippilot-adapters' || json.version !== 1) return { ok: false, error: 'This is not a TripPilot site-pins export.' }
  const incoming = parseUserAdapters(json.sites)
  if (Object.keys(incoming).length === 0) return { ok: false, error: 'The file contains no valid site pins.' }
  const merged: UserAdapters = { ...existing }
  let sitesAdded = 0
  for (const [host, hints] of Object.entries(incoming)) {
    if (!(host in merged)) {
      if (Object.keys(merged).length >= MAX_SITES) break
      sitesAdded++
    }
    merged[host] = { ...(merged[host] ?? {}), ...hints }
  }
  return { ok: true, adapters: merged, sitesAdded }
}

/**
 * Checks that every official link in the destination data still opens. Run: npm run check:links
 *
 * This verifies LINKS, not rules: it cannot tell you the checklist is correct. Many government sites refuse
 * automated requests (403/429), so those are reported as "unverified" rather than "broken". Open them in a browser.
 */
import { destinations } from '../src/features/visa/destinations.ts'

const UA = 'Mozilla/5.0 (compatible; TripPilotLinkCheck/0.1)'
type Verdict = 'ok' | 'unverified' | 'broken'
interface Row { dest: string; label: string; url: string; verdict: Verdict; detail: string }

/** Definite failures only: a page that does not exist, or a name that no longer resolves. Everything else may be temporary. */
const DEFINITE = /ENOTFOUND|ECONNREFUSED/

async function probeOnce(url: string): Promise<{ verdict: Verdict; detail: string }> {
  for (const method of ['HEAD', 'GET'] as const) {
    try {
      const res = await fetch(url, { method, redirect: 'follow', signal: AbortSignal.timeout(20_000), headers: { 'User-Agent': UA, Accept: 'text/html,*/*' } })
      const moved = new URL(res.url).host !== new URL(url).host ? ` (redirected to ${new URL(res.url).host})` : ''
      if (res.ok) return { verdict: 'ok', detail: `${res.status}${moved}` }
      if (method === 'HEAD' && [403, 405, 501].includes(res.status)) continue // some servers dislike HEAD
      if (res.status === 404 || res.status === 410) return { verdict: 'broken', detail: `${res.status} page not found${moved}` }
      return { verdict: 'unverified', detail: `${res.status}: could be temporary or blocking automated checks${moved}` }
    } catch (e) {
      if (method === 'HEAD') continue
      const code = (e as { cause?: { code?: string } }).cause?.code ?? (e instanceof Error ? e.message : 'unknown error')
      if (DEFINITE.test(code)) return { verdict: 'broken', detail: `${code}: the address does not resolve or refuses connections` }
      const note = /LEAF_SIGNATURE|CERT|SELF_SIGNED/.test(code) ? ' (certificate chain Node cannot verify: a browser may still open it)' : ''
      return { verdict: 'unverified', detail: `${code}${note}` }
    }
  }
  return { verdict: 'unverified', detail: 'no answer' }
}

/** One retry after a pause: a failure that does not repeat was probably temporary. */
async function probe(url: string) {
  const first = await probeOnce(url)
  if (first.verdict === 'ok') return first
  await new Promise((r) => setTimeout(r, 3000))
  const second = await probeOnce(url)
  return second.verdict === 'ok' ? { verdict: 'ok' as const, detail: `${second.detail} (failed once before, then worked)` } : second
}

const links = destinations.flatMap((d) => d.officialLinks.map((l) => ({ dest: d.name, label: l.label, url: l.url })))
const rows: Row[] = []
for (const l of links) rows.push({ ...l, ...(await probe(l.url)) })

const icon = { ok: 'OK        ', unverified: 'UNVERIFIED', broken: 'BROKEN    ' } as const
for (const r of rows) console.log(`${icon[r.verdict]} ${r.dest.padEnd(22)} ${r.url}\n           ${r.detail}`)
const count = (v: Verdict) => rows.filter((r) => r.verdict === v).length
console.log(`\n${rows.length} links: ${count('ok')} ok, ${count('unverified')} unverified (check by hand), ${count('broken')} broken`)
process.exit(count('broken') > 0 ? 1 : 0)

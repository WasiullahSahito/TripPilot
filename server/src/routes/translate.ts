import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { env } from '../config/env.ts'
import { HttpError, requireAuth } from '../middleware/security.ts'

const lang = z.string().regex(/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/, 'Invalid language code')

const input = z.object({
  text: z.string().trim().min(1, 'Nothing to translate').max(5000, 'Text is too long (5,000 characters max)'),
  source: z.union([z.literal('auto'), lang]),
  target: lang,
})

/** Passport MRZ lines are filled with "<" and must never be sent to a third-party service. */
export function looksLikeMrz(text: string) {
  return text
    .toUpperCase()
    .split(/\r?\n/)
    .map((l) => l.replace(/[^A-Z0-9<]/g, ''))
    .some((l) => l.length >= 36 && (l.match(/</g)?.length ?? 0) >= 5)
}

const MYMEMORY_URL = 'https://api.mymemory.translated.net/get'
const MYMEMORY_MAX = 450 // MyMemory accepts at most 500 bytes per request
const MYMEMORY_LANG: Record<string, string> = { zh: 'zh-CN' }

/** Split into pieces under the per-request limit, keeping line breaks and breaking on sentence ends where possible. */
export function chunkText(text: string, max = MYMEMORY_MAX): string[] {
  const out: string[] = []
  for (const line of text.split('\n')) {
    if (!line.trim()) {
      out.push('')
      continue
    }
    let cur = ''
    for (const piece of line.match(/[^.!?؟。！？]+[.!?؟。！？]*\s*|\S+/g) ?? [line]) {
      for (let i = 0; i < piece.length; i += max) {
        const part = piece.slice(i, i + max)
        if (cur && cur.length + part.length > max) {
          out.push(cur)
          cur = ''
        }
        cur += part
      }
    }
    if (cur) out.push(cur)
  }
  return out
}

/** Free tier, no key and no server to host: MyMemory (5,000 chars/day anonymous, 50,000 with MYMEMORY_EMAIL). */
async function translateWithMyMemory(text: string, source: string, target: string) {
  const code = (c: string) => MYMEMORY_LANG[c] ?? c
  const pair = `${source === 'auto' ? 'Autodetect' : code(source)}|${code(target)}`
  const chunks = chunkText(text)
  const translated: string[] = []
  for (let i = 0; i < chunks.length; i += 4) {
    const batch = await Promise.all(
      chunks.slice(i, i + 4).map(async (q) => {
        if (!q.trim()) return q
        const url = new URL(MYMEMORY_URL)
        url.searchParams.set('q', q)
        url.searchParams.set('langpair', pair)
        if (env.myMemoryEmail) url.searchParams.set('de', env.myMemoryEmail)
        let r: Response
        try {
          r = await fetch(url, { signal: AbortSignal.timeout(10_000) })
        } catch {
          throw new HttpError(502, 'The translation service did not respond')
        }
        const data = (await r.json().catch(() => null)) as { responseData?: { translatedText?: unknown }; responseStatus?: number | string } | null
        const status = Number(data?.responseStatus ?? r.status)
        if (status === 429 || /QUOTA/i.test(String(data?.responseData?.translatedText))) {
          throw new HttpError(429, 'The free daily translation limit was reached. Please try again tomorrow.')
        }
        if (status !== 200 || typeof data?.responseData?.translatedText !== 'string') throw new HttpError(502, 'The translation service returned an error')
        return data.responseData.translatedText
      }),
    )
    translated.push(...batch)
  }
  return translated.join('\n').replace(/ ?\n ?/g, '\n')
}

const limiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.isTest,
  message: { error: 'Too many translation requests. Slow down.' },
})

/**
 * Uses a self-hosted LibreTranslate server when LIBRETRANSLATE_URL is set, otherwise the free MyMemory API (no paid key, no VPS). The unofficial
 * "google-translate-api" scrapers are intentionally not used: they
 * breach Google's terms, break without notice and would send document text to a third party.
 */
export function translateRoutes() {
  const r = Router()
  r.use(requireAuth)

  r.post('/', limiter, async (req, res) => {
    const { text, source, target } = input.parse(req.body)
    if (looksLikeMrz(text)) throw new HttpError(422, 'This looks like passport data, so it was not sent for translation')
    // No self-hosted LibreTranslate (needs a VPS)? Use the free MyMemory API, which works from Vercel.
    if (!env.libreTranslateUrl) {
      res.json({ translatedText: await translateWithMyMemory(text, source, target), detected: null })
      return
    }

    let upstream: Response
    try {
      upstream = await fetch(`${env.libreTranslateUrl.replace(/\/$/, '')}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: text, source, target, format: 'text' }),
        signal: AbortSignal.timeout(15_000),
      })
    } catch {
      throw new HttpError(502, 'The translation service did not respond')
    }
    if (!upstream.ok) throw new HttpError(502, 'The translation service returned an error')
    const data = (await upstream.json().catch(() => null)) as { translatedText?: unknown; detectedLanguage?: { language?: string } } | null
    if (typeof data?.translatedText !== 'string') throw new HttpError(502, 'The translation service returned an unexpected response')
    res.json({ translatedText: data.translatedText, detected: data.detectedLanguage?.language ?? null })
  })

  return r
}

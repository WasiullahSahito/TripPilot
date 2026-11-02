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

const limiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.isTest,
  message: { error: 'Too many translation requests. Slow down.' },
})

/**
 * Proxy to a self-hosted LibreTranslate server without requiring a paid API key. The unofficial
 * "google-translate-api" scrapers are intentionally not used: they
 * breach Google's terms, break without notice and would send document text to a third party.
 */
export function translateRoutes() {
  const r = Router()
  r.use(requireAuth)

  r.post('/', limiter, async (req, res) => {
    if (!env.libreTranslateUrl) throw new HttpError(501, 'Translation is not configured on this server')
    const { text, source, target } = input.parse(req.body)
    if (looksLikeMrz(text)) throw new HttpError(422, 'This looks like passport data, so it was not sent for translation')

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

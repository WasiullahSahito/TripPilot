// @vitest-environment node
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from './app.ts'
import { env } from './config/env.ts'
import { JsonStore } from './models/store.ts'
import { chunkText, looksLikeMrz } from './routes/translate.ts'

const creds = { name: 'Test User', email: 'tr@example.com', password: 'correct-horse-battery' }
const MRZ = 'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<\nL898902C36UTO7408122F1204159ZE184226B<<<<<10'

async function signedIn() {
  const a = request.agent(createApp(new JsonStore()))
  await a.post('/api/auth/register').send(creds).expect(201)
  return a
}

beforeEach(() => {
  env.libreTranslateUrl = 'https://translate.example.test/'
})
afterEach(() => {
  vi.unstubAllGlobals()
  env.libreTranslateUrl = undefined
})

describe('POST /api/translate', () => {
  it('requires auth', async () => {
    await request(createApp(new JsonStore())).post('/api/translate').send({ text: 'x', source: 'auto', target: 'en' }).expect(401)
  })

  it('falls back to the free MyMemory API when no LibreTranslate server is configured', async () => {
    env.libreTranslateUrl = undefined
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ responseData: { translatedText: 'hello' }, responseStatus: 200 }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const a = await signedIn()
    const res = await a.post('/api/translate').send({ text: 'hola', source: 'auto', target: 'zh' }).expect(200)
    expect(res.body).toEqual({ translatedText: 'hello', detected: null })
    const url = new URL(String(fetchMock.mock.calls[0]![0]))
    expect(url.hostname).toBe('api.mymemory.translated.net')
    expect(url.searchParams.get('langpair')).toBe('Autodetect|zh-CN')
  })

  it('splits long text into chunks under the free API limit', () => {
    const chunks = chunkText('One sentence here. '.repeat(100) + '\nSecond line.')
    expect(chunks.every((c) => c.length <= 450)).toBe(true)
    expect(chunks.join('')).toContain('Second line.')
  })

  it('forwards text to LibreTranslate and returns the translation', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ translatedText: 'hello', detectedLanguage: { language: 'es' } }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const a = await signedIn()
    const res = await a.post('/api/translate').send({ text: 'hola', source: 'auto', target: 'en' }).expect(200)
    expect(res.body).toEqual({ translatedText: 'hello', detected: 'es' })
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://translate.example.test/translate')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ q: 'hola', source: 'auto', target: 'en', format: 'text' })
  })

  it('never sends passport MRZ text upstream', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const a = await signedIn()
    await a.post('/api/translate').send({ text: MRZ, source: 'auto', target: 'en' }).expect(422)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('validates input and maps upstream failures to 502', async () => {
    const a = await signedIn()
    await a.post('/api/translate').send({ text: '', source: 'auto', target: 'en' }).expect(400)
    await a.post('/api/translate').send({ text: 'x', source: 'auto', target: 'not a code' }).expect(400)
    await a.post('/api/translate').send({ text: 'x'.repeat(5001), source: 'auto', target: 'en' }).expect(400)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 500 })))
    await a.post('/api/translate').send({ text: 'x', source: 'auto', target: 'en' }).expect(502)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
    await a.post('/api/translate').send({ text: 'x', source: 'auto', target: 'en' }).expect(502)
  })
})

describe('looksLikeMrz', () => {
  it('flags MRZ lines but not prose', () => {
    expect(looksLikeMrz(MRZ)).toBe(true)
    expect(looksLikeMrz('This is an ordinary paragraph about a hotel booking.')).toBe(false)
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { planShrink } from './image-shrink'
import { LARGE_LIMIT, SMALL_LIMIT, uploadFile } from './upload'

const file = (size: number, name = 'scan.pdf', type = 'application/pdf') => new File([new Uint8Array(size)], name, { type })
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
// The configured API base URL (VITE_API_BASE_URL) may or may not be set: compare paths, not hosts.
const path = (u: unknown) => String(u).replace(/^https?:[/][/][^/]+(?=[/]api[/])/, '')
const doc = (over = {}) => ({ id: 'd1', filename: 'scan.pdf', mime: 'application/pdf', size: 10, itemId: 'passport', applicationId: 'app1', uploadedAt: '2027-01-01', ...over })

afterEach(() => vi.unstubAllGlobals())

describe('uploadFile: small files', () => {
  it('posts the raw file to the right endpoint for each kind', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => json({ document: doc() }, 201))
    vi.stubGlobal('fetch', fetchMock)
    await uploadFile({ kind: 'visa', ownerId: 'app1', itemId: 'passport' }, file(1000))
    await uploadFile({ kind: 'booking', ownerId: 'b1' }, file(1000, 'a b.pdf'))
    await uploadFile({ kind: 'appointment', ownerId: 'x1' }, file(1000))
    const urls = fetchMock.mock.calls.map((c) => path(c[0]))
    expect(urls[0]).toBe('/api/visa/applications/app1/documents?itemId=passport&filename=scan.pdf')
    expect(urls[1]).toBe('/api/bookings/b1/documents?filename=a%20b.pdf')
    expect(urls[2]).toBe('/api/appointments/x1/documents?filename=scan.pdf')
    expect((fetchMock.mock.calls[0]![1] as RequestInit).credentials).toBe('include')
  })

  it('validates type, emptiness and the overall limit before any request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const t = { kind: 'booking' as const, ownerId: 'b1' }
    await expect(uploadFile(t, file(10, 'x.exe', 'application/x-msdownload'))).rejects.toMatchObject({ status: 415 })
    await expect(uploadFile(t, file(0))).rejects.toMatchObject({ status: 400 })
    await expect(uploadFile(t, file(LARGE_LIMIT + 1))).rejects.toMatchObject({ status: 413 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('surfaces the server\'s reason when a file is refused (for example by the scan)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ error: 'This PDF contains active content' }, 422)))
    await expect(uploadFile({ kind: 'booking', ownerId: 'b1' }, file(1000))).rejects.toMatchObject({ status: 422, message: expect.stringContaining('active content') })
  })
})

describe('uploadFile: large files with cloud storage', () => {
  it('asks the server, uploads straight to the signed link without cookies, then finalizes', async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      calls.push({ url: path(url), init })
      url = path(url)
      if (String(url) === '/api/uploads/init') return json({ direct: true, uploadUrl: 'https://storage.test/sign?token=t', ticket: 'ticket-123', maxBytes: LARGE_LIMIT })
      if (String(url).startsWith('https://storage.test')) return new Response('{}', { status: 200 })
      if (String(url) === '/api/uploads/finalize') return json({ document: doc({ size: 9_000_000 }) }, 201)
      throw new Error(`unexpected ${url}`)
    }))
    const res = await uploadFile({ kind: 'visa', ownerId: 'app1', itemId: 'passport' }, file(9 * 1024 * 1024))
    expect(res).toMatchObject({ shrunk: false, document: { size: 9_000_000 } })
    expect(calls.map((c) => c.url)).toEqual(['/api/uploads/init', 'https://storage.test/sign?token=t', '/api/uploads/finalize'])

    const put = calls[1]!.init!
    expect(put.method).toBe('PUT')
    expect(put.credentials).toBeUndefined() // the storage host gets no session cookie
    expect(put.body).toBeInstanceOf(FormData)
    expect(JSON.parse(calls[2]!.init!.body as string)).toEqual({ ticket: 'ticket-123' })
    expect(JSON.parse(calls[0]!.init!.body as string)).toMatchObject({ kind: 'visa', ownerId: 'app1', itemId: 'passport', size: 9 * 1024 * 1024 })
  })

  it('reports storage failures and server rejections at finalize', async () => {
    const make = (putStatus: number, finalize: Response) => vi.stubGlobal('fetch', vi.fn().mockImplementation(async (rawUrl: string) => {
      const url = path(rawUrl)
      if (String(url) === '/api/uploads/init') return json({ direct: true, uploadUrl: 'https://storage.test/s', ticket: 't'.repeat(30), maxBytes: LARGE_LIMIT })
      if (String(url).startsWith('https://storage.test')) return new Response('', { status: putStatus })
      return finalize
    }))
    make(500, json({}))
    await expect(uploadFile({ kind: 'booking', ownerId: 'b' }, file(6e6))).rejects.toMatchObject({ status: 502 })
    make(200, json({ error: 'This file was flagged as malware (Test).' }, 422))
    await expect(uploadFile({ kind: 'booking', ownerId: 'b' }, file(6e6))).rejects.toMatchObject({ status: 422, message: expect.stringContaining('malware') })
  })

  it('stops before uploading when the server limit is lower than the client assumes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ direct: true, uploadUrl: 'https://storage.test/s', ticket: 't'.repeat(30), maxBytes: 8 * 1024 * 1024 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(uploadFile({ kind: 'booking', ownerId: 'b' }, file(9 * 1024 * 1024))).rejects.toMatchObject({ status: 413 })
    expect(fetchMock).toHaveBeenCalledTimes(1) // only /init
  })
})

describe('uploadFile: large files without direct upload (local storage)', () => {
  const noDirect = () => vi.fn().mockImplementation(async (rawUrl: string) => {
    const url = path(rawUrl)
    if (String(url) === '/api/uploads/init') return json({ direct: false, maxBytes: SMALL_LIMIT })
    return json({ document: doc({ filename: 'photo.jpg', mime: 'image/jpeg' }) }, 201)
  })

  it('shrinks a large photo to fit and uploads the smaller file', async () => {
    const fetchMock = noDirect()
    vi.stubGlobal('fetch', fetchMock)
    const small = file(1_000_000, 'photo.jpg', 'image/jpeg')
    const shrink = vi.fn().mockResolvedValue(small)
    const res = await uploadFile({ kind: 'booking', ownerId: 'b' }, file(8e6, 'photo.png', 'image/png'), { shrink })
    expect(res.shrunk).toBe(true)
    expect(shrink).toHaveBeenCalledWith(expect.any(File), SMALL_LIMIT - 256 * 1024)
    expect(path(fetchMock.mock.calls.at(-1)![0])).toContain('/api/bookings/b/documents')
  })

  it('refuses with a helpful message when a photo cannot be shrunk, and never shrinks PDFs', async () => {
    vi.stubGlobal('fetch', noDirect())
    await expect(uploadFile({ kind: 'booking', ownerId: 'b' }, file(8e6, 'p.jpg', 'image/jpeg'), { shrink: async () => null })).rejects.toMatchObject({ status: 413, message: expect.stringContaining('lower-resolution') })
    const shrink = vi.fn()
    await expect(uploadFile({ kind: 'booking', ownerId: 'b' }, file(8e6), { shrink })).rejects.toMatchObject({ status: 413, message: expect.stringContaining('smaller PDF') })
    expect(shrink).not.toHaveBeenCalled()
  })
})

describe('planShrink', () => {
  it('starts gentle and gets steadily more aggressive, never upscaling', () => {
    const plan = planShrink(4000, 3000)
    expect(plan[0]).toEqual({ maxEdge: 3600, quality: 0.85 })
    for (const p of plan) expect(p.maxEdge).toBeLessThanOrEqual(3600)
    const edges = plan.map((p) => p.maxEdge)
    expect(edges).toEqual([...edges].sort((a, b) => b - a))
    expect(plan.at(-1)!.quality).toBeLessThan(plan[0]!.quality)
  })

  it('does not enlarge small images', () => {
    expect(planShrink(800, 600)[0]).toEqual({ maxEdge: 800, quality: 0.85 })
    expect(planShrink(800, 600).every((p) => p.maxEdge <= 800)).toBe(true)
  })
})

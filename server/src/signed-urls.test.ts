// @vitest-environment node
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from './app.ts'
import { JsonStore } from './models/store.ts'
import { SIGNED_URL_TTL_SECONDS, type BlobStore } from './services/blobs.ts'
import { tinyPdf } from './test-fixtures.ts'

/** In-memory blob store that signs links, standing in for the private Supabase bucket. */
class FakeSigningBlobs implements BlobStore {
  files = new Map<string, Buffer>()
  signed: { path: string; ttl: number }[] = []
  async put(userId: string, id: string, bytes: Buffer) {
    this.files.set(`${userId}/${id}`, bytes)
  }
  async get(userId: string, id: string) {
    return this.files.get(`${userId}/${id}`) ?? null
  }
  async remove(userId: string, id: string) {
    this.files.delete(`${userId}/${id}`)
  }
  async removeAll(userId: string) {
    for (const k of [...this.files.keys()]) if (k.startsWith(`${userId}/`)) this.files.delete(k)
  }
  async signedUrl(userId: string, id: string, _filename: string, ttl = SIGNED_URL_TTL_SECONDS) {
    this.signed.push({ path: `${userId}/${id}`, ttl })
    return `https://storage.example.test/private/${userId}/${id}?token=abc`
  }
}

const creds = { name: 'Test User', email: 'sign@example.com', password: 'correct-horse-battery' }
const pdf = tinyPdf

async function setup() {
  const blobs = new FakeSigningBlobs()
  const app = createApp(new JsonStore(), { blobs })
  const a = request.agent(app)
  await a.post('/api/auth/register').send(creds).expect(201)
  const appId = (await a.put('/api/visa/applications').send({ destinationId: 'france', categoryId: 'x' })).body.application.id
  const doc = (await a.post(`/api/visa/applications/${appId}/documents?itemId=passport&filename=p.pdf`).set('Content-Type', 'application/pdf').send(pdf).expect(201)).body.document
  return { a, blobs, doc, appId }
}

describe('private storage with signed URLs', () => {
  it('redirects downloads to a short-lived signed URL instead of streaming from the API', async () => {
    const { a, blobs, doc } = await setup()
    const res = await a.get(`/api/visa/documents/${doc.id}`).redirects(0).expect(302)
    expect(res.headers.location).toMatch(/^https:\/\/storage\.example\.test\/private\//)
    expect(blobs.signed.at(-1)!.ttl).toBe(300) // five minutes
  })

  it('hands programmatic clients a signed link via /url', async () => {
    const { a, doc } = await setup()
    const res = await a.get(`/api/documents/${doc.id}/url`).expect(200)
    expect(res.body.signed).toBe(true)
    expect(res.body.expiresInSeconds).toBe(300)
    expect(res.body.url).toContain('token=')
  })

  it('never signs a link for a document the caller does not own', async () => {
    const { blobs, doc, a } = await setup()
    const other = request.agent(createApp(new JsonStore(), { blobs }))
    await other.post('/api/auth/register').send({ ...creds, email: 'other@example.com' }).expect(201)
    const before = blobs.signed.length
    await other.get(`/api/documents/${doc.id}/url`).expect(404)
    await other.get(`/api/visa/documents/${doc.id}`).redirects(0).expect(404)
    expect(blobs.signed.length).toBe(before)
    await a.get(`/api/documents/${doc.id}/url`).expect(200)
  })

  it('deletes stored files when a document, an application or the account is removed', async () => {
    const { a, blobs, doc, appId } = await setup()
    expect(blobs.files.size).toBe(1)
    await a.delete(`/api/visa/documents/${doc.id}`).expect(204)
    expect(blobs.files.size).toBe(0)

    await a.post(`/api/visa/applications/${appId}/documents?itemId=passport&filename=p.pdf`).set('Content-Type', 'application/pdf').send(pdf).expect(201)
    await a.delete(`/api/visa/applications/${appId}`).expect(204)
    expect(blobs.files.size).toBe(0)

    const id2 = (await a.put('/api/visa/applications').send({ destinationId: 'japan', categoryId: 'y' })).body.application.id
    await a.post(`/api/visa/applications/${id2}/documents?itemId=passport&filename=p.pdf`).set('Content-Type', 'application/pdf').send(pdf).expect(201)
    await a.delete('/api/account').expect(204)
    expect(blobs.files.size).toBe(0)
  })

  it('rejects uploads over the 4 MB limit', async () => {
    const { a, appId } = await setup()
    const big = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(4 * 1024 * 1024 + 10)])
    await a.post(`/api/visa/applications/${appId}/documents?itemId=x&filename=big.pdf`).set('Content-Type', 'application/pdf').send(big).expect(413)
  })
})

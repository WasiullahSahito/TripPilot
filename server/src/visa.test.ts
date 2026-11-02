// @vitest-environment node
import { mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from './app.ts'
import { JsonStore } from './models/store.ts'
import { safeFilename, sniffMime } from './routes/visa.ts'
import { tinyPdf } from './test-fixtures.ts'

const creds = { name: 'Test User', email: 'visa@example.com', password: 'correct-horse-battery' }
const body = {
  destinationId: 'france', categoryId: 'tourism', nationality: 'India', residence: 'India',
  checklist: { passport: true },
  data: { passport: { number: 'Z1234567' }, applicant: { givenNames: 'Asha' } },
}
let store: JsonStore
let app: ReturnType<typeof createApp>
let dir: string

beforeEach(() => {
  store = new JsonStore()
  dir = mkdtempSync(join(tmpdir(), 'tp-'))
  app = createApp(store, { uploadDir: dir })
})

async function signedIn(email = creds.email) {
  const a = request.agent(app)
  await a.post('/api/auth/register').send({ ...creds, email }).expect(201)
  return a
}

const pdf = tinyPdf

describe('visa applications', () => {
  it('requires auth', async () => {
    await request(app).get('/api/visa/applications').expect(401)
  })

  it('upserts one draft per destination+category and round-trips data', async () => {
    const a = await signedIn()
    const first = await a.put('/api/visa/applications').send(body).expect(201)
    const second = await a.put('/api/visa/applications').send({ ...body, status: 'ready' }).expect(200)
    expect(second.body.application.id).toBe(first.body.application.id)
    const list = await a.get('/api/visa/applications').expect(200)
    expect(list.body.applications).toHaveLength(1)
    expect(list.body.applications[0].data.passport.number).toBe('Z1234567')
    expect(list.body.applications[0].dataEnc).toBeUndefined()
  })

  it('stores form data encrypted at rest', async () => {
    const a = await signedIn()
    await a.put('/api/visa/applications').send(body).expect(201)
    const raw = JSON.stringify(await store.listApplications((await a.get('/api/auth/me')).body.user.id))
    expect(raw).not.toContain('Z1234567')
    expect(raw).not.toContain('Asha')
  })

  it("isolates users' applications", async () => {
    const a = await signedIn()
    const id = (await a.put('/api/visa/applications').send(body)).body.application.id as string
    const b = await signedIn('other@example.com')
    await b.get(`/api/visa/applications/${id}`).expect(404)
    await b.delete(`/api/visa/applications/${id}`).expect(404)
  })

  it('rejects malformed data', async () => {
    const a = await signedIn()
    await a.put('/api/visa/applications').send({ ...body, status: 'approved' }).expect(400)
  })
})

describe('document uploads', () => {
  async function withApp() {
    const a = await signedIn()
    const id = (await a.put('/api/visa/applications').send(body)).body.application.id as string
    return { a, id }
  }

  it('accepts a PDF by content and serves it back as an attachment', async () => {
    const { a, id } = await withApp()
    const up = await a.post(`/api/visa/applications/${id}/documents?itemId=passport&filename=../../my%20passport.pdf`)
      .set('Content-Type', 'application/octet-stream').send(pdf).expect(201)
    expect(up.body.document.filename).toBe('my passport.pdf')
    expect(readdirSync(join(dir, up.body.document.userId))).toHaveLength(1)
    const dl = await a.get(`/api/visa/documents/${up.body.document.id}`).expect(200)
    expect(dl.headers['content-disposition']).toMatch(/attachment/)
    expect(dl.headers['x-content-type-options']).toBe('nosniff')
  })

  it('rejects files that are not PDF/PNG/JPEG regardless of declared type', async () => {
    const { a, id } = await withApp()
    await a.post(`/api/visa/applications/${id}/documents?itemId=passport&filename=x.pdf`)
      .set('Content-Type', 'application/pdf').send(Buffer.from('<script>alert(1)</script>')).expect(415)
  })

  it('does not let another user download a document', async () => {
    const { a, id } = await withApp()
    const up = await a.post(`/api/visa/applications/${id}/documents?itemId=passport&filename=p.pdf`)
      .set('Content-Type', 'application/pdf').send(pdf).expect(201)
    const b = await signedIn('other@example.com')
    await b.get(`/api/visa/documents/${up.body.document.id}`).expect(404)
  })

  it('removes uploaded files when the account is deleted', async () => {
    const { a, id } = await withApp()
    const up = await a.post(`/api/visa/applications/${id}/documents?itemId=passport&filename=p.pdf`)
      .set('Content-Type', 'application/pdf').send(pdf).expect(201)
    await a.delete('/api/account').expect(204)
    expect(() => readdirSync(join(dir, up.body.document.userId))).toThrow()
  })
})

describe('helpers', () => {
  it('sniffs mime types and sanitises filenames', () => {
    expect(sniffMime(pdf)).toBe('application/pdf')
    expect(sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg')
    expect(sniffMime(Buffer.from('hello'))).toBeNull()
    expect(safeFilename('..\..\evil<>.pdf')).toBe('evil__.pdf')
    expect(safeFilename('')).toBe('document')
  })
})

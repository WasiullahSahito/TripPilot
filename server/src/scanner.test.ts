// @vitest-environment node
import { createServer, type Server } from 'node:net'
import request from 'supertest'
import { PDFDocument } from 'pdf-lib'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from './app.ts'
import { env } from './config/env.ts'
import { JsonStore } from './models/store.ts'
import { inspectJpeg, inspectPdf, inspectPng, inspectStructure, scanUpload, scanWithClamd } from './services/scanner.ts'

const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'

// ---- builders for small, structurally valid files
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
const crc32 = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
function png(w = 1, h = 1, extra = Buffer.alloc(0)) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', Buffer.from([0x78, 0x9c, 0x63, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01])), chunk('IEND', Buffer.alloc(0)), extra])
}
function jpeg(w = 8, h = 8, tail = Buffer.alloc(0)) {
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x0b, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0x01, 0x01, 0x11, 0x00])
  const sos = Buffer.from([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00])
  return Buffer.concat([Buffer.from([0xff, 0xd8]), sof, sos, Buffer.from([0x12, 0x34]), Buffer.from([0xff, 0xd9]), tail])
}
async function cleanPdf() {
  const d = await PDFDocument.create(); d.addPage([100, 100]).drawText('hello')
  return Buffer.from(await d.save())
}
const rawPdf = (body: string) => Buffer.from(`%PDF-1.4\n${body}\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n`, 'latin1')

describe('built-in structural checks', () => {
  it('accepts well-formed files of each type', async () => {
    expect(inspectPdf(await cleanPdf()).status).toBe('clean')
    expect(inspectPng(png()).status).toBe('clean')
    expect(inspectJpeg(jpeg()).status).toBe('clean')
  })

  it('blocks the EICAR antivirus test string in any file type', () => {
    for (const [mime, b] of [['application/pdf', rawPdf(EICAR)], ['image/png', Buffer.concat([png(), Buffer.from(EICAR)])], ['image/jpeg', Buffer.concat([jpeg(), Buffer.from(EICAR)])]] as const) {
      expect(inspectStructure(b, mime)).toMatchObject({ status: 'blocked', code: 'eicar' })
    }
  })

  it('blocks PDFs with scripts, launch actions and embedded files, including hex-obfuscated names', () => {
    for (const body of ['1 0 obj << /S /JavaScript /JS (app.alert(1)) >> endobj', '1 0 obj << /S /Launch /F (cmd.exe) >> endobj', '1 0 obj << /Type /EmbeddedFile >> endobj', '1 0 obj << /S /#4A#61vaScript >> endobj', '1 0 obj << /JS(alert(1)) >> endobj']) {
      expect(inspectPdf(rawPdf(body)), body).toMatchObject({ status: 'blocked', code: 'pdf-active-content' })
    }
  })

  it('does not block ordinary PDFs that merely mention similar words, and flags truncated ones', () => {
    expect(inspectPdf(rawPdf('1 0 obj << /Title (My JSON-like JavaScripture notes) /Type /JSONish >> endobj')).status).toBe('clean')
    expect(inspectPdf(Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\n'))).toMatchObject({ code: 'pdf-truncated' })
  })

  it('blocks images with data hidden after the end, truncated images, and decompression bombs', () => {
    expect(inspectPng(png(1, 1, Buffer.from('<?php system($_GET[1]); ?>')))).toMatchObject({ code: 'image-trailing-data' })
    expect(inspectPng(png().subarray(0, 40))).toMatchObject({ code: 'png-truncated' })
    expect(inspectPng(png(60000, 60000))).toMatchObject({ code: 'image-too-large' })
    expect(inspectPng(Buffer.from('not a png at all, just text........................'))).toMatchObject({ code: 'png-invalid' })
    expect(inspectJpeg(jpeg(8, 8, Buffer.alloc(200, 0x41)))).toMatchObject({ code: 'image-trailing-data' })
    expect(inspectJpeg(jpeg(65000, 65000))).toMatchObject({ code: 'image-too-large' })
    expect(inspectJpeg(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toMatchObject({ status: 'blocked' })
    // a few bytes of padding after the end marker are normal for cameras
    expect(inspectJpeg(jpeg(8, 8, Buffer.alloc(4))).status).toBe('clean')
  })
})

// ---- a fake clamd that speaks the real INSTREAM framing
function fakeClamd(answer: (received: Buffer) => string): Promise<{ server: Server; port: number; frames: string[] }> {
  const frames: string[] = []
  return new Promise((resolve) => {
    const server = createServer((sock) => {
      let buf = Buffer.alloc(0)
      sock.on('data', (d) => {
        buf = Buffer.concat([buf, d as Uint8Array])
        const header = 'zINSTREAM\0'
        if (buf.length < header.length || buf.toString('latin1', 0, header.length) !== header) return
        let pos = header.length
        const payload: Buffer[] = []
        for (;;) {
          if (pos + 4 > buf.length) return // wait for more
          const len = buf.readUInt32BE(pos)
          if (len === 0) break
          if (pos + 4 + len > buf.length) return
          payload.push(buf.subarray(pos + 4, pos + 4 + len))
          pos += 4 + len
        }
        frames.push(`${payload.length} chunk(s)`)
        sock.end(answer(Buffer.concat(payload)) + '\0')
      })
    })
    server.listen(0, '127.0.0.1', () => resolve({ server, port: (server.address() as { port: number }).port, frames }))
  })
}

describe('ClamAV client (clamd INSTREAM)', () => {
  let srv: Server | undefined
  afterEach(() => srv?.close())

  it('streams the file in framed chunks and reports clean / FOUND', async () => {
    const f = await fakeClamd((data) => (data.includes('BADSIG') ? 'stream: Win.Test.Sig-1 FOUND' : 'stream: OK'))
    srv = f.server
    expect(await scanWithClamd(Buffer.alloc(200_000, 1), '127.0.0.1', f.port)).toEqual({ status: 'clean' })
    expect(f.frames[0]).toBe('4 chunk(s)') // 200,000 bytes in 64 KB chunks
    expect(await scanWithClamd(Buffer.from('xx BADSIG xx'), '127.0.0.1', f.port)).toMatchObject({ status: 'blocked', code: 'malware', reason: expect.stringContaining('Win.Test.Sig-1') })
  })

  it('reports unavailable when nothing is listening, on errors, and on timeouts', async () => {
    expect((await scanWithClamd(Buffer.from('x'), '127.0.0.1', 1, 2000)).status).toBe('unavailable')
    const f = await fakeClamd(() => 'INSTREAM size limit exceeded. ERROR')
    srv = f.server
    expect((await scanWithClamd(Buffer.from('x'), '127.0.0.1', f.port)).status).toBe('unavailable')
    const silent = createServer(() => undefined)
    await new Promise<void>((r) => silent.listen(0, '127.0.0.1', r))
    const r = await scanWithClamd(Buffer.from('x'), '127.0.0.1', (silent.address() as { port: number }).port, 300)
    silent.close()
    expect(r).toMatchObject({ status: 'unavailable', reason: expect.stringContaining('timed out') })
  })
})

describe('scanUpload policy', () => {
  afterEach(() => { env.clamdHost = undefined; env.scanFailMode = 'closed' })

  it('runs structural checks only when ClamAV is not configured', async () => {
    expect(await scanUpload(png(), 'image/png')).toEqual({ status: 'clean' })
    expect((await scanUpload(rawPdf('/JS (x)'), 'application/pdf')).status).toBe('blocked')
  })

  it('does not call ClamAV for files that already fail the structural checks', async () => {
    env.clamdHost = '127.0.0.1'
    env.clamdPort = 1 // would be unavailable if it were consulted
    expect((await scanUpload(rawPdf(EICAR), 'application/pdf')).status).toBe('blocked')
  })

  it('fails closed by default and open when told to', async () => {
    env.clamdHost = '127.0.0.1'
    env.clamdPort = 1
    expect((await scanUpload(png(), 'image/png')).status).toBe('unavailable')
    env.scanFailMode = 'open'
    expect(await scanUpload(png(), 'image/png')).toEqual({ status: 'clean', unscanned: true })
  })
})

describe('uploads through the API', () => {
  let store: JsonStore
  let agent: ReturnType<typeof request.agent>
  let appId: string
  beforeEach(async () => {
    store = new JsonStore()
    agent = request.agent(createApp(store))
    await agent.post('/api/auth/register').send({ name: 'T', email: 'scan@example.com', password: 'correct-horse-battery' }).expect(201)
    appId = (await agent.put('/api/visa/applications').send({ destinationId: 'france', categoryId: 'x' })).body.application.id
  })
  afterEach(() => { env.clamdHost = undefined; env.scanFailMode = 'closed' })

  const upload = (body: Buffer, type = 'application/pdf') => agent.post(`/api/visa/applications/${appId}/documents?itemId=passport&filename=f`).set('Content-Type', type).send(body)

  it('accepts clean files and refuses scripted PDFs and doctored images with a plain reason', async () => {
    await upload(await cleanPdf()).expect(201)
    await upload(png(), 'image/png').expect(201)
    const bad = await upload(rawPdf('1 0 obj << /S /JavaScript /JS (x) >> endobj')).expect(422)
    expect(bad.body.error).toMatch(/active content/)
    await upload(png(1, 1, Buffer.from('payload')), 'image/png').expect(422)
    await upload(rawPdf(EICAR)).expect(422)
    expect((await agent.get(`/api/visa/applications/${appId}`)).body.documents).toHaveLength(2) // refused files were not stored
  })

  it('applies to appointment and booking attachments too', async () => {
    const bookingId = (await agent.post('/api/bookings').send({ kind: 'hotel', status: 'sample', source: 'demo', title: 'x', startDate: '2027-01-01' })).body.booking.id
    await agent.post(`/api/bookings/${bookingId}/documents?filename=a.pdf`).set('Content-Type', 'application/pdf').send(rawPdf(EICAR)).expect(422)
    const apptId = (await agent.post('/api/appointments').send({ center: 'c', type: 'visa', startsAt: '2027-01-01T10:00', status: 'requested' })).body.appointment.id
    await agent.post(`/api/appointments/${apptId}/documents?filename=a.pdf`).set('Content-Type', 'application/pdf').send(rawPdf('/Launch')).expect(422)
  })

  it('refuses malware found by ClamAV, and records the block in the audit log without the file name', async () => {
    const f = await fakeClamd(() => 'stream: Test.Malware FOUND')
    env.clamdHost = '127.0.0.1'
    env.clamdPort = f.port
    const res = await upload(await cleanPdf()).expect(422)
    expect(res.body.error).toMatch(/malware/)
    f.server.close()
    const entry = (await store.listAudit({ limit: 5, offset: 0, action: 'upload.blocked' }))[0]!
    expect(entry.meta).toEqual({ code: 'malware' })
  })

  it('returns 503 when ClamAV is down (closed), and accepts but logs when SCAN_FAIL_MODE=open', async () => {
    env.clamdHost = '127.0.0.1'
    env.clamdPort = 1
    await upload(await cleanPdf()).expect(503)
    env.scanFailMode = 'open'
    await upload(await cleanPdf()).expect(201)
    expect((await store.listAudit({ limit: 10, offset: 0, action: 'upload.unscanned' })).length).toBe(1)
  })
})

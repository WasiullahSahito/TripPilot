import { Socket } from 'node:net'
import { env } from '../config/env.ts'

/**
 * Upload scanning. Two layers:
 *
 * 1. Built-in checks (always on). These are NOT antivirus. They reject files that are not what they claim to be and
 *    block the commonest document tricks: PDFs carrying JavaScript or launch actions, images with a payload appended
 *    after the image data, truncated images, and decompression bombs. They can be evaded (for example by hiding PDF
 *    objects inside compressed streams), so treat them as a safety net, not protection from malware.
 * 2. ClamAV (when CLAMD_HOST is set). Real signature-based detection through a clamd server you run yourself
 *    (it cannot run inside a Vercel function). Without it, no antivirus scan happens.
 */

export type ScanResult =
  | { status: 'clean' }
  | { status: 'blocked'; reason: string; code: string }
  | { status: 'unavailable'; reason: string }

const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'
const MAX_PIXELS = 100_000_000 // 100 megapixels: far above any photo, far below what exhausts a browser or pdf-lib

const blocked = (code: string, reason: string): ScanResult => ({ status: 'blocked', code, reason })

// ---------------------------------------------------------------- PDF

/** Names that make a PDF do something when opened. PDF names may hide letters as #xx, so those are decoded first. */
const ACTIVE_PDF_NAMES = ['JavaScript', 'JS', 'Launch', 'EmbeddedFile', 'EmbeddedFiles', 'RichMedia', 'XFA', 'ImportData', 'SubmitForm', 'GoToE']

export function inspectPdf(bytes: Buffer): ScanResult {
  const text = bytes.toString('latin1').replace(/#([0-9A-Fa-f]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
  for (const name of ACTIVE_PDF_NAMES) {
    // a PDF name ends at whitespace, a delimiter, or the end: "/JS" must not match "/JSON-like" names
    if (new RegExp(`/${name}(?=[\\s/<>\\[\\]()%]|$)`).test(text)) {
      return blocked('pdf-active-content', 'This PDF contains active content (scripts, launch actions or embedded files). Export a plain PDF and try again.')
    }
  }
  const tail = bytes.subarray(Math.max(0, bytes.length - 2048)).toString('latin1')
  if (!tail.includes('%%EOF')) return blocked('pdf-truncated', 'This PDF looks incomplete or damaged.')
  return { status: 'clean' }
}

// ---------------------------------------------------------------- PNG

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

export function inspectPng(bytes: Buffer): ScanResult {
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(PNG_SIG)) return blocked('png-invalid', 'This is not a valid PNG image.')
  let pos = 8
  let first = true
  while (pos + 12 <= bytes.length) {
    const len = bytes.readUInt32BE(pos)
    const type = bytes.toString('latin1', pos + 4, pos + 8)
    const end = pos + 12 + len
    if (end > bytes.length) return blocked('png-truncated', 'This PNG image is incomplete or damaged.')
    if (first) {
      if (type !== 'IHDR' || len !== 13) return blocked('png-invalid', 'This is not a valid PNG image.')
      const w = bytes.readUInt32BE(pos + 8)
      const h = bytes.readUInt32BE(pos + 12)
      if (w === 0 || h === 0 || w * h > MAX_PIXELS) return blocked('image-too-large', 'This image has implausible dimensions.')
      first = false
    }
    if (type === 'IEND') {
      return end === bytes.length ? { status: 'clean' } : blocked('image-trailing-data', 'This image has extra data hidden after it.')
    }
    pos = end
  }
  return blocked('png-truncated', 'This PNG image is incomplete or damaged.')
}

// ---------------------------------------------------------------- JPEG

const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf])

export function inspectJpeg(bytes: Buffer): ScanResult {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return blocked('jpeg-invalid', 'This is not a valid JPEG image.')
  let pos = 2
  let dims: [number, number] | null = null
  // Walk the header segments until the compressed image data starts (SOS), picking up the dimensions on the way.
  while (pos + 4 <= bytes.length) {
    if (bytes[pos] !== 0xff) return blocked('jpeg-invalid', 'This is not a valid JPEG image.')
    const marker = bytes[pos + 1]!
    if (marker === 0xff) { pos++; continue } // fill byte
    if (marker === 0xd9) break
    if (marker >= 0xd0 && marker <= 0xd7 || marker === 0x01) { pos += 2; continue }
    const len = bytes.readUInt16BE(pos + 2)
    if (len < 2 || pos + 2 + len > bytes.length) return blocked('jpeg-truncated', 'This JPEG image is incomplete or damaged.')
    if (SOF.has(marker) && len >= 8) dims = [bytes.readUInt16BE(pos + 7), bytes.readUInt16BE(pos + 5)]
    pos += 2 + len
    if (marker === 0xda) break
  }
  if (!dims) return blocked('jpeg-invalid', 'This is not a valid JPEG image.')
  if (dims[0] === 0 || dims[1] === 0 || dims[0] * dims[1] > MAX_PIXELS) return blocked('image-too-large', 'This image has implausible dimensions.')
  // The last end-of-image marker must be at (or within a few padding bytes of) the end of the file.
  const eoi = bytes.lastIndexOf(Buffer.from([0xff, 0xd9]))
  if (eoi < 0) return blocked('jpeg-truncated', 'This JPEG image is incomplete or damaged.')
  if (bytes.length - (eoi + 2) > 16) return blocked('image-trailing-data', 'This image has extra data hidden after it.')
  return { status: 'clean' }
}

export function inspectStructure(bytes: Buffer, mime: string): ScanResult {
  if (bytes.includes(EICAR)) return blocked('eicar', 'This file contains the standard antivirus test signature (EICAR).')
  if (mime === 'application/pdf') return inspectPdf(bytes)
  if (mime === 'image/png') return inspectPng(bytes)
  if (mime === 'image/jpeg') return inspectJpeg(bytes)
  return blocked('unsupported', 'This file type is not accepted.')
}

// ---------------------------------------------------------------- ClamAV (clamd INSTREAM)

const CHUNK = 64 * 1024

/**
 * Streams the file to a clamd daemon using its INSTREAM command: "zINSTREAM\0", then repeated
 * [4-byte big-endian length][data], ended by a zero-length chunk. Replies "stream: OK" or "stream: <name> FOUND".
 */
export function scanWithClamd(bytes: Buffer, host: string, port: number, timeoutMs = 20_000): Promise<ScanResult> {
  return new Promise((resolve) => {
    const socket = new Socket()
    let reply = ''
    let settled = false
    const done = (r: ScanResult) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(r)
    }
    socket.setTimeout(timeoutMs, () => done({ status: 'unavailable', reason: 'The virus scanner timed out.' }))
    socket.on('error', () => done({ status: 'unavailable', reason: 'The virus scanner is not reachable.' }))
    socket.on('data', (d) => {
      reply += d.toString('latin1')
    })
    socket.on('close', () => {
      const text = reply.replace(/\0/g, '').trim()
      if (/ OK$/.test(text)) return done({ status: 'clean' })
      const found = /^stream:\s*(.+?)\s+FOUND$/.exec(text)
      if (found) return done(blocked('malware', `This file was flagged as malware (${found[1]}).`))
      done({ status: 'unavailable', reason: 'The virus scanner returned an unexpected answer.' })
    })
    socket.connect(port, host, () => {
      socket.write('zINSTREAM\0')
      for (let i = 0; i < bytes.length; i += CHUNK) {
        const chunk = bytes.subarray(i, i + CHUNK)
        const len = Buffer.alloc(4)
        len.writeUInt32BE(chunk.length)
        socket.write(len)
        socket.write(chunk)
      }
      socket.write(Buffer.alloc(4)) // zero-length chunk: end of stream
    })
  })
}

/**
 * The full upload check. Returns whether the file may be stored. When ClamAV is configured but unreachable the
 * default is to refuse the upload ("closed"); SCAN_FAIL_MODE=open stores it anyway and reports `unscanned`.
 */
export async function scanUpload(bytes: Buffer, mime: string): Promise<ScanResult & { unscanned?: boolean }> {
  const structural = inspectStructure(bytes, mime)
  if (structural.status !== 'clean') return structural
  if (!env.clamdHost) return { status: 'clean' }
  const av = await scanWithClamd(bytes, env.clamdHost, env.clamdPort)
  if (av.status === 'unavailable' && env.scanFailMode === 'open') return { status: 'clean', unscanned: true }
  return av
}

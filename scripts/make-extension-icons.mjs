// Generates extension/icons/icon{16,32,48,128}.png: the TripPilot mark (teal arrow on a navy rounded square).
// Pure Node, no image libraries: a tiny rasteriser with 4x4 anti-aliasing and a hand-written PNG encoder.
// Run: node scripts/make-extension-icons.mjs
import { mkdir, writeFile } from 'node:fs/promises'
import { deflateSync } from 'node:zlib'

const NAVY = [11, 31, 58]
const TEAL = [20, 184, 166]
// The logo's arrow, in a 32x32 box (same path as the favicon): M8 17 L24 10 L18 24 L15 18 Z
const ARROW = [[8, 17], [24, 10], [18, 24], [15, 18]]

function inPolygon(x, y, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Is (x,y) inside a square of side `s` with corner radius `r`? */
function inRoundedSquare(x, y, s, r) {
  const cx = Math.min(Math.max(x, r), s - r)
  const cy = Math.min(Math.max(y, r), s - r)
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
}

export function renderIcon(size) {
  const px = Buffer.alloc(size * size * 4)
  const scale = size / 32
  const poly = ARROW.map(([x, y]) => [x * scale, y * scale])
  const radius = size * 0.22
  const SS = 4
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bg = 0, fg = 0
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const fx = x + (sx + 0.5) / SS, fy = y + (sy + 0.5) / SS
        if (inRoundedSquare(fx, fy, size, radius)) {
          bg++
          if (inPolygon(fx, fy, poly)) fg++
        }
      }
      const n = SS * SS
      const alpha = bg / n
      const teal = bg ? fg / bg : 0
      const o = (y * size + x) * 4
      for (let c = 0; c < 3; c++) px[o + c] = Math.round(NAVY[c] * (1 - teal) + TEAL[c] * teal)
      px[o + 3] = Math.round(alpha * 255)
    }
  }
  return px
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

export function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const rows = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    rows[y * (size * 4 + 1)] = 0 // filter: none
    rgba.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ])
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('make-extension-icons.mjs')) {
  await mkdir('extension/icons', { recursive: true })
  for (const size of [16, 32, 48, 128]) {
    await writeFile(`extension/icons/icon${size}.png`, encodePng(size, renderIcon(size)))
    console.log(`wrote extension/icons/icon${size}.png`)
  }
}

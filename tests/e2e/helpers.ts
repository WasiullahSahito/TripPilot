import { expect, type Page } from '@playwright/test'
import { randomBytes } from 'node:crypto'
import { deflateSync } from 'node:zlib'
import { PDFDocument } from 'pdf-lib'

let counter = 0
export const uniqueEmail = () => `tester${Date.now()}${counter++}@example.com`
export const PASSWORD = 'correct-horse-battery'

/** ISO date n days from today (local). */
export function inDays(n: number) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function samplePdf(text = 'Sample document') {
  const doc = await PDFDocument.create()
  doc.addPage([300, 300]).drawText(text)
  return Buffer.from(await doc.save())
}

/** Registers a new account and completes onboarding, ending on the dashboard. */
export async function signUp(page: Page, name = 'Asha Rao') {
  const email = uniqueEmail()
  await page.goto('/signup')
  await page.getByLabel('Full name').fill(name)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page.getByRole('heading', { name: 'Where are you from?' })).toBeVisible()
  await page.getByLabel('Nationality').fill('India')
  await page.getByLabel('Country of residence').fill('India')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Finish' }).click()
  await expect(page.getByRole('heading', { name: /^Welcome, / })).toBeVisible()
  return { email, name }
}

export const ADMIN = { email: 'admin-e2e@example.com', password: 'E2e-admin-pass-1234!' }

export async function loginAs(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Log in' }).click()
}

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
const crc32 = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

/** A valid RGB PNG full of random noise, so it stays large (about width*height*3 bytes) like a real camera photo. */
export function noisePng(width: number, height: number) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2
  const rows = Buffer.alloc(height * (width * 3 + 1))
  for (let y = 0; y < height; y++) randomBytes(width * 3).copy(rows, y * (width * 3 + 1) + 1)
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows, { level: 1 })), chunk('IEND', Buffer.alloc(0))])
}

/** A PDF that is well-formed (ends with %%EOF) but padded to the given size. */
export function paddedPdf(bytes: number) {
  return Buffer.concat([
    Buffer.from('%PDF-1.4\n%'),
    Buffer.alloc(bytes, 0x41),
    Buffer.from('\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n'),
  ])
}

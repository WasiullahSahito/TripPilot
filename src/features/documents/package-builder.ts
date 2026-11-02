import { PDFDocument } from 'pdf-lib'
import { COLORS, embedFonts, FlowWriter, PAGE, safeText, wrapText } from '@/lib/pdf-text'

export type SectionId = 'visa' | 'flights' | 'hotels' | 'insurance' | 'appointments' | 'supporting'

export const sectionLabel: Record<SectionId, string> = {
  visa: 'Visa application',
  flights: 'Flight documents',
  hotels: 'Hotel reservations',
  insurance: 'Travel insurance',
  appointments: 'Appointments',
  supporting: 'Supporting documents',
}

export type BadgeKind = 'sample' | 'requested' | 'pending' | 'confirmed' | 'uploaded' | 'generated'

export interface TextEntry {
  heading: string
  /** Truthful status line, e.g. "SAMPLE PLAN - not a booking". */
  status?: string
  lines: string[]
}

export type PackageSource =
  | { type: 'text'; entries: TextEntry[] }
  | { type: 'file'; mime: 'application/pdf' | 'image/png' | 'image/jpeg'; load(): Promise<Uint8Array> }

export interface PackageItem {
  id: string
  section: SectionId
  title: string
  detail?: string
  badge: { kind: BadgeKind; label: string }
  selected: boolean
  source: PackageSource
}

export interface BuildOptions {
  title: string
  travelerName?: string
  tripLine?: string
  generatedAt?: Date
  pageNumbers: boolean
  dividers: boolean
  contents: boolean
  /**
   * Re-encode large photos to smaller JPEGs before they go in. Uploaded PDFs are never altered: they cannot be
   * recompressed safely in the browser, so they are always copied exactly.
   */
  compressImages?: boolean
  /** Supplies the smaller version of a photo (the browser implementation uses a canvas). Return null to keep the original. */
  shrink?: (bytes: Uint8Array, mime: 'image/png' | 'image/jpeg') => Promise<{ bytes: Uint8Array; mime: 'image/png' | 'image/jpeg' } | null>
}

export interface OutlineEntry {
  id: string
  section: SectionId
  title: string
  badge: string
  page: number
}

export interface BuildResult {
  bytes: Uint8Array
  pageCount: number
  outline: OutlineEntry[]
  failures: { id: string; title: string; reason: string }[]
  /** How compression helped: photos re-encoded and bytes removed from them. */
  compression: { imagesShrunk: number; bytesSaved: number }
}

export interface Progress {
  done: number
  total: number
  label: string
}

const TOC_PER_PAGE = 30
const A4 = [595, 842] as const

export function sniffKind(bytes: Uint8Array): 'application/pdf' | 'image/png' | 'image/jpeg' | null {
  const head = (n: number) => Array.from(bytes.slice(0, n))
  if (String.fromCharCode(...head(5)) === '%PDF-') return 'application/pdf'
  if (head(8).join(',') === '137,80,78,71,13,10,26,10') return 'image/png'
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  return null
}

function reasonOf(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e)
  if (/encrypt/i.test(msg)) return 'This PDF is password-protected. Remove the password and upload it again.'
  return 'This file could not be read as a valid PDF or image.'
}

export async function buildPackage(
  items: PackageItem[],
  opts: BuildOptions,
  onProgress?: (p: Progress) => void,
): Promise<BuildResult> {
  const selected = items.filter((i) => i.selected)
  const pdf = await PDFDocument.create()
  pdf.setTitle(opts.title)
  pdf.setCreator('TripPilot')
  const fonts = await embedFonts(pdf)
  const stamp = (opts.generatedAt ?? new Date()).toISOString().slice(0, 10)

  // ---- cover ----
  const cover = new FlowWriter(pdf, fonts)
  cover.space(60)
  cover.text(opts.title, { size: 26, bold: true })
  cover.space(6)
  if (opts.travelerName) cover.text(`Prepared for ${opts.travelerName}`, { size: 12 })
  if (opts.tripLine) cover.text(opts.tripLine, { size: 12, color: COLORS.grey })
  cover.text(`Generated ${stamp}`, { color: COLORS.grey })
  cover.space(24)
  cover.rule()
  cover.text('How to read this package', { bold: true, size: 12 })
  cover.space(4)
  for (const n of [
    'This is a preparation aid. It is not a visa, a ticket, or a confirmation from any airline, hotel, insurer or embassy.',
    'Items labelled SAMPLE are planning documents only and are not bookings. REQUESTED and PENDING items are not yet secured.',
    'CONFIRMED means you recorded a reference supplied by the provider; check it against the original document.',
    'Uploaded files are included unmodified; only a page number is added in the bottom margin if enabled.',
  ]) {
    cover.text(`- ${n}`, { indent: 8 })
    cover.space(2)
  }
  cover.space(14)
  cover.text(`${selected.length} item${selected.length === 1 ? '' : 's'} included`, { bold: true })

  // ---- reserve contents pages (filled after we know the page numbers) ----
  const tocCount = opts.contents ? Math.max(1, Math.ceil(selected.length / TOC_PER_PAGE)) : 0
  const tocStart = pdf.getPageCount()
  for (let i = 0; i < tocCount; i++) pdf.addPage([...A4])

  const outline: OutlineEntry[] = []
  const failures: BuildResult['failures'] = []
  const compression = { imagesShrunk: 0, bytesSaved: 0 }

  // ---- items ----
  for (let i = 0; i < selected.length; i++) {
    const item = selected[i]!
    onProgress?.({ done: i, total: selected.length, label: item.title })
    const startPage = pdf.getPageCount() + 1
    try {
      if (opts.dividers) {
        const d = pdf.addPage([...A4])
        d.drawText(safeText(sectionLabel[item.section].toUpperCase()), { x: PAGE.margin, y: 560, size: 11, font: fonts.bold, color: COLORS.teal })
        let y = 530
        for (const l of wrapText(item.title, fonts.bold, 22, A4[0] - PAGE.margin * 2)) {
          d.drawText(l, { x: PAGE.margin, y, size: 22, font: fonts.bold, color: COLORS.navy })
          y -= 28
        }
        d.drawText(safeText(item.badge.label), { x: PAGE.margin, y: y - 6, size: 12, font: fonts.regular, color: item.badge.kind === 'sample' ? COLORS.amber : COLORS.grey })
        if (item.detail) {
          for (const l of wrapText(item.detail, fonts.regular, 10, A4[0] - PAGE.margin * 2)) {
            y -= 16
            d.drawText(l, { x: PAGE.margin, y: y - 6, size: 10, font: fonts.regular, color: COLORS.grey })
          }
        }
      }

      if (item.source.type === 'text') {
        const w = new FlowWriter(pdf, fonts)
        w.text(item.title, { size: 16, bold: true })
        w.space(4)
        for (const e of item.source.entries) {
          w.rule()
          w.text(e.heading, { bold: true, size: 11 })
          if (e.status) w.text(e.status, { size: 9, color: /sample|not /i.test(e.status) ? COLORS.amber : COLORS.teal })
          for (const l of e.lines) w.text(l, { indent: 8 })
          w.space(6)
        }
      } else {
        const bytes = await item.source.load()
        const kind = sniffKind(bytes)
        if (!kind) throw new Error('unsupported')
        if (kind === 'application/pdf') {
          const src = await PDFDocument.load(bytes)
          const pages = await pdf.copyPages(src, src.getPageIndices())
          pages.forEach((p) => pdf.addPage(p))
          if (pages.length === 0) throw new Error('empty')
        } else {
          let imageBytes = bytes
          let imageKind: 'image/png' | 'image/jpeg' = kind
          // Only worth the work for photos over ~300 KB; small images are already small.
          if (opts.compressImages && opts.shrink && bytes.length > 300 * 1024) {
            const smaller = await opts.shrink(bytes, kind).catch(() => null)
            if (smaller && smaller.bytes.length < bytes.length) {
              compression.imagesShrunk++
              compression.bytesSaved += bytes.length - smaller.bytes.length
              imageBytes = smaller.bytes
              imageKind = smaller.mime
            }
          }
          const img = imageKind === 'image/png' ? await pdf.embedPng(imageBytes) : await pdf.embedJpg(imageBytes)
          const page = pdf.addPage([...A4])
          const box = { w: A4[0] - 80, h: A4[1] - 100 }
          const scale = Math.min(box.w / img.width, box.h / img.height, 1)
          const w = img.width * scale
          const h = img.height * scale
          page.drawImage(img, { x: (A4[0] - w) / 2, y: (A4[1] - h) / 2 + 10, width: w, height: h })
        }
      }
      outline.push({ id: item.id, section: item.section, title: item.title, badge: item.badge.label, page: startPage })
    } catch (e) {
      while (pdf.getPageCount() >= startPage) pdf.removePage(pdf.getPageCount() - 1)
      failures.push({ id: item.id, title: item.title, reason: reasonOf(e) })
    }
  }
  onProgress?.({ done: selected.length, total: selected.length, label: 'Finishing' })

  // ---- contents ----
  if (opts.contents) {
    const rows = outline.length
    for (let p = 0; p < tocCount; p++) {
      const page = pdf.getPage(tocStart + p)
      let y = A4[1] - PAGE.margin
      page.drawText(p === 0 ? 'Contents' : 'Contents (continued)', { x: PAGE.margin, y: y - 18, size: 18, font: fonts.bold, color: COLORS.navy })
      y -= 50
      for (const e of outline.slice(p * TOC_PER_PAGE, (p + 1) * TOC_PER_PAGE)) {
        const title = safeText(e.title).slice(0, 60)
        page.drawText(title, { x: PAGE.margin, y, size: 11, font: fonts.regular, color: COLORS.navy })
        page.drawText(safeText(`${sectionLabel[e.section]} - ${e.badge}`), { x: PAGE.margin, y: y - 12, size: 8, font: fonts.regular, color: COLORS.grey })
        const num = String(e.page)
        page.drawText(num, { x: A4[0] - PAGE.margin - fonts.regular.widthOfTextAtSize(num, 11), y, size: 11, font: fonts.regular, color: COLORS.navy })
        y -= 34
      }
      if (rows === 0 && p === 0) page.drawText('No items could be included.', { x: PAGE.margin, y, size: 11, font: fonts.regular, color: COLORS.grey })
    }
  }

  // ---- page numbers (bottom margin only; original page content is untouched) ----
  const count = pdf.getPageCount()
  if (opts.pageNumbers) {
    pdf.getPages().forEach((p, i) => {
      const { width } = p.getSize()
      const t = `${safeText(opts.title).slice(0, 50)}  |  Page ${i + 1} of ${count}`
      p.drawText(t, { x: Math.max(20, width / 2 - fonts.regular.widthOfTextAtSize(t, 8) / 2), y: 14, size: 8, font: fonts.regular, color: COLORS.grey })
    })
  }

  // Object streams make the PDF's own structure smaller; the content of pages is unchanged.
  return { bytes: await pdf.save({ useObjectStreams: !!opts.compressImages }), pageCount: count, outline, failures, compression }
}

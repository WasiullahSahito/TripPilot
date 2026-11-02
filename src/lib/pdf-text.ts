import type { PDFDocument, PDFFont, PDFPage } from 'pdf-lib'
import { rgb, StandardFonts } from 'pdf-lib'

/** Standard PDF fonts only cover WinAnsi; replace anything else so generation never throws. */
export const safeText = (s: string) => s.replace(/[^\x20-\x7E\xA0-\xFF\n]/g, '?')

export function wrapText(text: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = []
  for (const para of safeText(text).split('\n')) {
    let line = ''
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word
      if (font.widthOfTextAtSize(next, size) > width && line) {
        lines.push(line)
        line = word
      } else line = next
    }
    lines.push(line)
  }
  return lines
}

export const PAGE = { w: 595, h: 842, margin: 50 } as const
export const COLORS = {
  navy: rgb(0.043, 0.122, 0.227),
  grey: rgb(0.33, 0.38, 0.48),
  amber: rgb(0.7, 0.4, 0.02),
  teal: rgb(0.05, 0.58, 0.53),
}

export interface Fonts {
  regular: PDFFont
  bold: PDFFont
}

export async function embedFonts(pdf: PDFDocument): Promise<Fonts> {
  return { regular: await pdf.embedFont(StandardFonts.Helvetica), bold: await pdf.embedFont(StandardFonts.HelveticaBold) }
}

/** Flowing text writer that adds pages as needed. */
export class FlowWriter {
  page!: PDFPage
  y = 0
  private readonly pdf: PDFDocument
  private readonly fonts: Fonts
  private readonly bottom = PAGE.margin + 24

  constructor(pdf: PDFDocument, fonts: Fonts) {
    this.pdf = pdf
    this.fonts = fonts
    this.newPage()
  }

  newPage() {
    this.page = this.pdf.addPage([PAGE.w, PAGE.h])
    this.y = PAGE.h - PAGE.margin
  }

  space(h: number) {
    this.y -= h
  }

  text(s: string, o: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; indent?: number } = {}) {
    const size = o.size ?? 10
    const font = o.bold ? this.fonts.bold : this.fonts.regular
    const indent = o.indent ?? 0
    for (const line of wrapText(s, font, size, PAGE.w - PAGE.margin * 2 - indent)) {
      if (this.y - size < this.bottom) this.newPage()
      this.page.drawText(line, { x: PAGE.margin + indent, y: this.y - size, size, font, color: o.color ?? COLORS.navy })
      this.y -= size + 4
    }
  }

  rule() {
    this.page.drawLine({
      start: { x: PAGE.margin, y: this.y }, end: { x: PAGE.w - PAGE.margin, y: this.y }, thickness: 0.6, color: COLORS.grey,
    })
    this.y -= 8
  }
}

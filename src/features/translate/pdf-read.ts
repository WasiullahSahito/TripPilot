/**
 * Reads text out of a PDF entirely in the browser. Pages with a real text layer are read directly;
 * scanned pages (no text layer) are rendered and run through the same on-device OCR as photos.
 * The PDF is never uploaded.
 */
import { recognize } from '@/features/ocr/ocr'

export const MAX_PDF_BYTES = 10 * 1024 * 1024
export const MAX_PDF_PAGES = 10
/** A page with fewer characters than this is treated as a scan and OCR'd instead. */
const MIN_TEXT_CHARS = 25

export function validatePdf(file: File): string | null {
  if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) return 'Choose a PDF file.'
  if (file.size > MAX_PDF_BYTES) return 'PDF is larger than 10 MB.'
  return null
}

export interface PdfReadOptions {
  ocrLang: string
  onProgress?(fraction: number, status: string): void
  signal?: AbortSignal
}

export async function readPdf(file: File, opts: PdfReadOptions): Promise<{ text: string; pages: number; truncated: boolean }> {
  const pdfjs = await import('pdfjs-dist')
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  try {
    const pages = Math.min(doc.numPages, MAX_PDF_PAGES)
    const out: string[] = []
    for (let n = 1; n <= pages; n++) {
      if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      const share = (f: number) => opts.onProgress?.((n - 1 + f) / pages, `Page ${n} of ${pages}`)
      share(0)
      const page = await doc.getPage(n)
      const content = await page.getTextContent()
      let text = content.items.map((i) => ('str' in i ? i.str + (i.hasEOL ? '\n' : ' ') : '')).join('').replace(/[ \t]+\n/g, '\n').trim()
      if (text.replace(/\s/g, '').length < MIN_TEXT_CHARS) {
        const viewport = page.getViewport({ scale: 2 })
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(viewport.width)
        canvas.height = Math.round(viewport.height)
        await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise
        const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('render failed'))), 'image/png'))
        canvas.width = canvas.height = 0
        text = (await recognize(blob, { lang: opts.ocrLang, signal: opts.signal, onProgress: (f) => share(f) })).trim()
      }
      page.cleanup()
      if (text) out.push(text)
    }
    return { text: out.join('\n\n'), pages, truncated: doc.numPages > MAX_PDF_PAGES }
  } finally {
    void doc.destroy()
  }
}

/**
 * Browser-side OCR with Tesseract.js. The image is decoded and recognised entirely on the user's device:
 * it is never uploaded by this module. Tesseract's worker, wasm core and language data are self-hosted.
 */

export const OCR_LANGUAGES = [
  { code: 'eng', label: 'English' },
  { code: 'ara', label: 'Arabic' },
  { code: 'fra', label: 'French' },
  { code: 'spa', label: 'Spanish' },
  { code: 'deu', label: 'German' },
  { code: 'rus', label: 'Russian' },
  { code: 'tur', label: 'Turkish' },
  { code: 'hin', label: 'Hindi' },
  { code: 'chi_sim', label: 'Chinese (Simplified)' },
  { code: 'jpn', label: 'Japanese' },
] as const

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MRZ_WHITELIST = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<'

export function validateImage(file: File): string | null {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return 'Choose a PNG, JPEG or WebP image.'
  if (file.size > MAX_IMAGE_BYTES) return 'Image is larger than 10 MB.'
  return null
}

async function toCanvas(image: Blob, bottomFraction: number | null): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(image)
  const sy = bottomFraction ? Math.floor(bmp.height * (1 - bottomFraction)) : 0
  const sh = bmp.height - sy
  const scale = Math.min(2400 / bmp.width, Math.max(1, 1600 / bmp.width))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * scale)
  canvas.height = Math.round(sh * scale)
  const ctx = canvas.getContext('2d')!
  ctx.filter = 'grayscale(1) contrast(1.4)'
  ctx.drawImage(bmp, 0, sy, bmp.width, sh, 0, 0, canvas.width, canvas.height)
  bmp.close()
  return canvas
}

export interface RecognizeOptions {
  lang: string
  /** Passport mode: crop to the bottom of the page and restrict to MRZ characters. */
  mrz?: boolean
  onProgress?(fraction: number, status: string): void
  signal?: AbortSignal
}

export async function recognize(image: Blob, opts: RecognizeOptions): Promise<string> {
  const { createWorker } = await import('tesseract.js')
  const base = (import.meta.env.VITE_OCR_ASSET_BASE || '/tesseract').replace(/\/+$/, '')
  const worker = await createWorker(opts.mrz ? 'eng' : opts.lang, 1, {
    logger: (m: { progress: number; status: string }) => opts.onProgress?.(m.progress, m.status),
    ...(base ? { workerPath: `${base}/worker.min.js`, corePath: base, langPath: base } : {}),
  })
  const abort = () => void worker.terminate()
  opts.signal?.addEventListener('abort', abort)
  try {
    if (opts.mrz) await worker.setParameters({ tessedit_char_whitelist: MRZ_WHITELIST })
    const canvas = await toCanvas(image, opts.mrz ? 0.4 : null)
    const { data } = await worker.recognize(canvas)
    canvas.width = canvas.height = 0 // release pixel memory
    return data.text
  } finally {
    opts.signal?.removeEventListener('abort', abort)
    await worker.terminate()
  }
}

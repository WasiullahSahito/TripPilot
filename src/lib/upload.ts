import { api, ApiError } from '@/lib/api'
import { isShrinkable, shrinkImage } from '@/lib/image-shrink'

const BASE = import.meta.env.VITE_API_BASE_URL ?? ''

/** Up to this size the file goes through the API itself (works with any storage). */
export const SMALL_LIMIT = 4 * 1024 * 1024
/** Matches the server default (MAX_LARGE_UPLOAD_MB); the server has the final say. */
export const LARGE_LIMIT = 25 * 1024 * 1024
export const ALLOWED_TYPES = ['application/pdf', 'image/png', 'image/jpeg']

export type UploadTarget =
  | { kind: 'visa'; ownerId: string; itemId: string }
  | { kind: 'booking'; ownerId: string }
  | { kind: 'appointment'; ownerId: string }

export interface UploadedDocument {
  id: string
  filename: string
  mime: string
  size: number
  itemId: string
  applicationId: string
  uploadedAt: string
}

export interface UploadResult {
  document: UploadedDocument
  /** True when a large photo was automatically shrunk to fit. */
  shrunk: boolean
}

const mb = (n: number) => `${Math.floor(n / 1024 / 1024)} MB`

function smallUrl(t: UploadTarget, filename: string) {
  const name = encodeURIComponent(filename)
  if (t.kind === 'visa') return `${BASE}/api/visa/applications/${t.ownerId}/documents?${new URLSearchParams({ itemId: t.itemId, filename })}`
  if (t.kind === 'booking') return `${BASE}/api/bookings/${t.ownerId}/documents?filename=${name}`
  return `${BASE}/api/appointments/${t.ownerId}/documents?filename=${name}`
}

async function readJson<T>(res: Response): Promise<T & { error?: string }> {
  return (await res.json().catch(() => ({}))) as T & { error?: string }
}

async function smallUpload(t: UploadTarget, file: File): Promise<UploadedDocument> {
  const res = await fetch(smallUrl(t, file.name), {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/octet-stream' }, body: file,
  }).catch(() => {
    throw new ApiError(0, 'Cannot reach the server')
  })
  const json = await readJson<{ document?: UploadedDocument }>(res)
  if (!res.ok || !json.document) throw new ApiError(res.status, json.error ?? 'Upload failed')
  return json.document
}

interface Deps {
  /** Injected in tests; the real one needs a browser canvas. */
  shrink?: (file: File, target: number) => Promise<File | null>
  fetchImpl?: typeof fetch
}

/**
 * Uploads a document. Small files use the API directly. Large files go straight to cloud storage through a
 * single-use link, then the server downloads, type-checks and scans them before keeping them. If the server has no
 * direct path (local storage), a large photo is shrunk to fit, and anything else is refused with a clear message.
 */
export async function uploadFile(target: UploadTarget, file: File, deps: Deps = {}): Promise<UploadResult> {
  if (!ALLOWED_TYPES.includes(file.type)) throw new ApiError(415, 'Only PDF, PNG and JPEG files are accepted')
  if (file.size === 0) throw new ApiError(400, 'That file is empty')
  if (file.size > LARGE_LIMIT) throw new ApiError(413, `File is larger than ${mb(LARGE_LIMIT)}`)
  if (file.size <= SMALL_LIMIT) return { document: await smallUpload(target, file), shrunk: false }

  const init = await api<{ direct: false; maxBytes: number } | { direct: true; uploadUrl: string; ticket: string; maxBytes: number }>('/uploads/init', {
    method: 'POST',
    body: { kind: target.kind, ownerId: target.ownerId, itemId: target.kind === 'visa' ? target.itemId : '', filename: file.name, size: file.size },
  })

  if (!init.direct) {
    const shrink = deps.shrink ?? shrinkImage
    const smaller = isShrinkable(file) ? await shrink(file, SMALL_LIMIT - 256 * 1024) : null
    if (smaller) return { document: await smallUpload(target, smaller), shrunk: true }
    throw new ApiError(
      413,
      isShrinkable(file)
        ? `This server accepts files up to ${mb(init.maxBytes)} and the photo could not be shrunk enough. Try a lower-resolution photo.`
        : `This server accepts files up to ${mb(init.maxBytes)}. Try a smaller PDF (for example scan at a lower resolution).`,
    )
  }

  if (file.size > init.maxBytes) throw new ApiError(413, `File is larger than ${mb(init.maxBytes)}`)

  const form = new FormData()
  form.append('cacheControl', '3600')
  form.append('', file)
  // The signed link carries its own authorisation: no cookies are sent to the storage host.
  const put = await (deps.fetchImpl ?? fetch)(init.uploadUrl, { method: 'PUT', body: form, headers: { 'x-upsert': 'false' } }).catch(() => {
    throw new ApiError(0, 'The upload could not reach storage. Check your connection and try again.')
  })
  if (!put.ok) throw new ApiError(502, 'Storage did not accept the file. Please try again.')

  const fin = await api<{ document: UploadedDocument }>('/uploads/finalize', { method: 'POST', body: { ticket: init.ticket } })
  return { document: fin.document, shrunk: false }
}

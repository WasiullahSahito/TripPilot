import { api, ApiError } from '@/lib/api'
import type { DocumentMeta } from './assemble-items'

const BASE = import.meta.env.VITE_API_BASE_URL ?? ''

export const documentsApi = {
  list: () => api<{ documents: DocumentMeta[] }>('/documents').then((r) => r.documents),

  /**
   * Two steps: ask the API for a short-lived link (a signed storage URL in production, or the
   * authenticated API path in local development), then fetch the bytes. Signed links carry their own
   * authorisation, so no cookies are sent to the storage host.
   */
  async file(id: string): Promise<Uint8Array> {
    const link = await api<{ url: string; signed: boolean }>(`/documents/${id}/url`)
    const res = await fetch(link.signed ? link.url : `${BASE}${link.url}`, { credentials: link.signed ? 'omit' : 'include' }).catch(() => {
      throw new ApiError(0, 'Cannot reach the server')
    })
    if (!res.ok) throw new ApiError(res.status, 'Could not download this file')
    return new Uint8Array(await res.arrayBuffer())
  },
}

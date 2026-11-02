import type { Store } from '../models/store.ts'
import { HttpError } from '../middleware/security.ts'
import { audit } from './audit.ts'
import { scanUpload } from './scanner.ts'

/** Scans an upload before anything is stored. Throws the HTTP error to send if it must be refused. */
export async function guardUpload(store: Pick<Store, 'addAudit'>, userId: string, bytes: Buffer, mime: string): Promise<void> {
  const result = await scanUpload(bytes, mime)
  if (result.status === 'blocked') {
    // The code (for example "pdf-active-content") is logged; the file name and contents never are.
    await audit(store, { actorId: userId, action: 'upload.blocked', meta: { code: result.code } })
    throw new HttpError(422, result.reason)
  }
  if (result.status === 'unavailable') {
    await audit(store, { actorId: userId, action: 'upload.scan_unavailable' })
    throw new HttpError(503, 'Files cannot be checked for viruses right now, so the upload was not accepted. Try again later.')
  }
  if (result.unscanned) await audit(store, { actorId: userId, action: 'upload.unscanned' })
}

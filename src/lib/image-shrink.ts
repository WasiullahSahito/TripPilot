/**
 * Shrinks a photo so it fits a size limit, by scaling it down and re-encoding it as JPEG. Used for phone photos
 * (often 5-12 MB) when a server cannot take big files, and by the PDF package builder to reduce its size.
 * PDFs are never touched here: they cannot be recompressed safely in the browser.
 */
export interface ShrinkAttempt {
  /** Longest edge in pixels. */
  maxEdge: number
  quality: number
}

/** The sequence of attempts, from gentlest to most aggressive. Pure, so it can be tested without a canvas. */
export function planShrink(width: number, height: number): ShrinkAttempt[] {
  const longest = Math.max(width, height)
  const edges = [3000, 2400, 2000, 1600, 1280, 1024].filter((e) => e < longest)
  const first = Math.min(longest, 3600)
  const plan: ShrinkAttempt[] = [{ maxEdge: first, quality: 0.85 }, { maxEdge: first, quality: 0.7 }]
  for (const e of edges) plan.push({ maxEdge: e, quality: 0.75 }, { maxEdge: e, quality: 0.6 })
  return plan
}

export const isShrinkable = (file: Pick<File, 'type'>) => file.type === 'image/png' || file.type === 'image/jpeg'

const jpegName = (name: string) => `${name.replace(/\.[^.]+$/, '') || 'image'}.jpg`

/** Returns a smaller JPEG file, or null if it could not be brought under the target (or the browser cannot do it). */
export async function shrinkImage(file: File, targetBytes: number): Promise<File | null> {
  if (!isShrinkable(file) || typeof createImageBitmap !== 'function') return null
  let bmp: ImageBitmap
  try {
    bmp = await createImageBitmap(file)
  } catch {
    return null
  }
  try {
    for (const { maxEdge, quality } of planShrink(bmp.width, bmp.height)) {
      const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(bmp.width * scale))
      canvas.height = Math.max(1, Math.round(bmp.height * scale))
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      ctx.fillStyle = '#ffffff' // JPEG has no transparency: flatten PNGs onto white
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
      canvas.width = canvas.height = 0
      if (blob && blob.size <= targetBytes) return new File([blob], jpegName(file.name), { type: 'image/jpeg' })
    }
    return null
  } finally {
    bmp.close()
  }
}

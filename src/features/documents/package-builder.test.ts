import { PDFDocument } from 'pdf-lib'
import { buildPackage, sniffKind, type BuildOptions, type PackageItem } from './package-builder'

const PNG_1PX = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
)

async function pdfWithPages(n: number) {
  const d = await PDFDocument.create()
  for (let i = 0; i < n; i++) d.addPage([300, 300]).drawText(`orig ${i + 1}`)
  return d.save()
}

const opts: BuildOptions = { title: 'Trip package', pageNumbers: true, dividers: true, contents: true, generatedAt: new Date('2026-12-01') }

const file = (id: string, title: string, load: () => Promise<Uint8Array>, mime: 'application/pdf' | 'image/png' = 'application/pdf'): PackageItem => ({
  id, title, section: 'supporting', badge: { kind: 'uploaded', label: 'Uploaded file' }, selected: true, source: { type: 'file', mime, load },
})

describe('sniffKind', () => {
  it('identifies by content', async () => {
    expect(sniffKind(await pdfWithPages(1))).toBe('application/pdf')
    expect(sniffKind(PNG_1PX)).toBe('image/png')
    expect(sniffKind(new TextEncoder().encode('hello'))).toBeNull()
  })
})

describe('buildPackage', () => {
  it('assembles cover, contents, dividers, uploaded pages and page numbers in order', async () => {
    const res = await buildPackage(
      [file('a', 'Passport', async () => pdfWithPages(2)), file('b', 'Photo', async () => PNG_1PX, 'image/png')],
      opts,
    )
    // cover(1) + contents(1) + [divider+2 pages] + [divider+1 image page]
    expect(res.pageCount).toBe(1 + 1 + 3 + 2)
    expect(res.failures).toEqual([])
    expect(res.outline.map((o) => [o.title, o.page])).toEqual([['Passport', 3], ['Photo', 6]])
    const out = await PDFDocument.load(res.bytes)
    expect(out.getPageCount()).toBe(res.pageCount)
  })

  it('leaves out dividers, contents and numbers when disabled', async () => {
    const res = await buildPackage([file('a', 'Passport', async () => pdfWithPages(2))], { ...opts, dividers: false, contents: false })
    expect(res.pageCount).toBe(1 + 2)
    expect(res.outline[0]!.page).toBe(2)
  })

  it('skips an unreadable file, reports it, and rolls back its pages', async () => {
    const corrupt = new TextEncoder().encode('%PDF-1.4 this is not really a pdf')
    const res = await buildPackage(
      [file('bad', 'Broken', async () => corrupt), file('ok', 'Good', async () => pdfWithPages(1))],
      opts,
    )
    expect(res.failures).toHaveLength(1)
    expect(res.failures[0]!.id).toBe('bad')
    expect(res.outline.map((o) => o.id)).toEqual(['ok'])
    // cover + contents + divider + 1 page; none left over from the failed item's divider
    expect(res.pageCount).toBe(4)
    expect(res.outline[0]!.page).toBe(3)
  })

  it('reports a load error without aborting the package', async () => {
    const res = await buildPackage(
      [file('x', 'Network fail', async () => { throw new Error('network') }), file('ok', 'Good', async () => pdfWithPages(1))],
      opts,
    )
    expect(res.failures.map((f) => f.id)).toEqual(['x'])
    expect(res.outline).toHaveLength(1)
  })

  it('renders text items with their truthful status and ignores unselected items', async () => {
    const text: PackageItem = {
      id: 't', section: 'flights', title: 'Flights - sample plans', badge: { kind: 'sample', label: 'SAMPLE - not a booking' }, selected: true,
      source: { type: 'text', entries: [{ heading: 'DEL to CDG', status: 'SAMPLE PLAN - not a booking', lines: ['2026-12-01'] }] },
    }
    const skipped = { ...file('s', 'Skipped', async () => pdfWithPages(5)), selected: false }
    const res = await buildPackage([text, skipped], opts)
    expect(res.outline.map((o) => o.id)).toEqual(['t'])
    expect(res.outline[0]!.badge).toBe('SAMPLE - not a booking')
  })

  it('reports progress for each item and survives non-WinAnsi text', async () => {
    const seen: string[] = []
    const text: PackageItem = {
      id: 't', section: 'hotels', title: 'Hôtel 山田', badge: { kind: 'requested', label: 'REQUESTED' }, selected: true,
      source: { type: 'text', entries: [{ heading: 'Zoë 山田', lines: ['long '.repeat(300)] }] },
    }
    await buildPackage([text], { ...opts, travelerName: 'Zoë 山田' }, (p) => seen.push(`${p.done}/${p.total}`))
    expect(seen[0]).toBe('0/1')
    expect(seen.at(-1)).toBe('1/1')
  })

  it('paginates the contents page for many items', async () => {
    const many = Array.from({ length: 35 }, (_, i) => file(`i${i}`, `Doc ${i}`, async () => pdfWithPages(1)))
    const res = await buildPackage(many, { ...opts, dividers: false })
    // cover + 2 contents pages + 35 items
    expect(res.pageCount).toBe(1 + 2 + 35)
    expect(res.outline[0]!.page).toBe(4)
  })

  describe('photo compression', () => {
    // A valid PNG padded past the 300 KB threshold (extra bytes after the image end are ignored by the embedder).
    const bigPng = () => { const b = new Uint8Array(PNG_1PX.length + 400 * 1024); b.set(PNG_1PX); return b }
    const img = (load: () => Promise<Uint8Array>) => file('p', 'Photo', load, 'image/png')

    it('uses the smaller version of a large photo and reports the savings', async () => {
      const calls: number[] = []
      const shrink = async (bytes: Uint8Array) => { calls.push(bytes.length); return { bytes: PNG_1PX, mime: 'image/png' as const } }
      const res = await buildPackage([img(async () => bigPng())], { ...opts, compressImages: true, shrink })
      expect(calls).toHaveLength(1)
      expect(res.compression.imagesShrunk).toBe(1)
      expect(res.compression.bytesSaved).toBe(400 * 1024)
      expect(res.failures).toEqual([])
    })

    it('does nothing unless asked, and leaves small photos and PDFs alone', async () => {
      let called = 0
      const shrink = async () => { called++; return null }
      await buildPackage([img(async () => bigPng())], { ...opts, shrink }) // compressImages not set
      await buildPackage([img(async () => PNG_1PX)], { ...opts, compressImages: true, shrink })
      await buildPackage([file('a', 'Doc', async () => pdfWithPages(1))], { ...opts, compressImages: true, shrink })
      expect(called).toBe(0)
    })

    it('keeps the original when shrinking fails, returns nothing, or does not actually help', async () => {
      for (const shrink of [
        async () => { throw new Error('canvas unavailable') },
        async () => null,
        async () => ({ bytes: bigPng(), mime: 'image/png' as const }), // not smaller
      ]) {
        const res = await buildPackage([img(async () => bigPng())], { ...opts, compressImages: true, shrink })
        expect(res.failures).toEqual([])
        expect(res.compression).toEqual({ imagesShrunk: 0, bytesSaved: 0 })
        expect(res.pageCount).toBeGreaterThan(1)
      }
    })

    it('still produces a valid PDF with the smaller structure option', async () => {
      const res = await buildPackage([file('a', 'Doc', async () => pdfWithPages(3))], { ...opts, compressImages: true })
      expect((await PDFDocument.load(res.bytes)).getPageCount()).toBe(res.pageCount)
    })
  })
})

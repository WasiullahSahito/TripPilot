import { ArrowDown, ArrowUp, Download, Eye, FileText, GripVertical } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { appointmentsApi } from '@/features/appointments/appointments-api'
import { useAuth } from '@/features/auth/auth-context'
import { bookingsApi } from '@/features/bookings/bookings-api'
import { useTrips } from '@/features/dashboard/use-trips'
import { buildChecklist } from '@/features/visa/checklist'
import { findDestination } from '@/features/visa/destinations'
import { mergeFormData } from '@/features/visa/form-schema'
import { visaApi, type ApplicationDto } from '@/features/visa/visa-api'
import { assembleItems, type DocumentMeta } from './assemble-items'
import { documentsApi } from './documents-api'
import { reorder, step } from './reorder'
import { shrinkImage } from '@/lib/image-shrink'
import { buildPackage, sectionLabel, type BuildResult, type PackageItem, type Progress } from './package-builder'

interface Sources {
  applications: ApplicationDto[]
  bookings: Awaited<ReturnType<typeof bookingsApi.list>>
  appointments: Awaited<ReturnType<typeof appointmentsApi.list>>
  documents: DocumentMeta[]
}

const badgeTone = { sample: 'warning', requested: 'warning', pending: 'warning', confirmed: 'accent', uploaded: 'neutral', generated: 'neutral' } as const

export default function DocumentsPage() {
  const { user } = useAuth()
  const { trips } = useTrips()
  const [sources, setSources] = useState<Sources | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [order, setOrder] = useState<string[]>([])
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [title, setTitle] = useState('Travel document package')
  const [tripId, setTripId] = useState('')
  const [pageNumbers, setPageNumbers] = useState(true)
  const [dividers, setDividers] = useState(true)
  const [contents, setContents] = useState(true)
  const [compress, setCompress] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropMark, setDropMark] = useState<{ id: string; where: 'before' | 'after' } | null>(null)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [result, setResult] = useState<BuildResult | null>(null)
  const [buildError, setBuildError] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const resultBytes = useRef<Uint8Array | null>(null)

  const load = useCallback(async () => {
    try {
      const [applications, bookings, appointments, documents] = await Promise.all([
        visaApi.list(), bookingsApi.list(), appointmentsApi.list(), documentsApi.list(),
      ])
      setSources({ applications, bookings, appointments, documents })
      setLoadError(null)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load your documents')
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const items: PackageItem[] = useMemo(() => {
    if (!sources) return []
    const built = assembleItems({
      ...sources,
      loadFile: documentsApi.file,
      buildVisaSummary: async (app, uploads) => {
        const { buildApplicationSummary } = await import('@/features/visa/summary-pdf')
        const dest = findDestination(app.destinationId)!
        const cat = dest.categories.find((c) => c.id === app.categoryId)!
        const data = mergeFormData(app.data)
        return buildApplicationSummary({
          destination: dest, categoryLabel: cat.label, nationality: app.nationality, residence: app.residence, data,
          checklist: buildChecklist(dest, app.categoryId, data.travel.purpose || cat.purposes[0] || ''),
          checked: app.checklist, uploads, footer: false,
        })
      },
    })
    return built
  }, [sources])

  // Initialise order/selection once per set of items, preserving user changes for ids already known.
  useEffect(() => {
    setOrder((o) => [...o.filter((id) => items.some((i) => i.id === id)), ...items.map((i) => i.id).filter((id) => !o.includes(id))])
    setSelected((s) => ({ ...Object.fromEntries(items.map((i) => [i.id, i.selected])), ...Object.fromEntries(Object.entries(s).filter(([id]) => items.some((i) => i.id === id))) }))
  }, [items])

  const ordered = order.map((id) => items.find((i) => i.id === id)).filter((i): i is PackageItem => !!i)
  const chosen = ordered.filter((i) => selected[i.id])
  const trip = trips.find((t) => t.id === tripId)

  const move = (id: string, dir: -1 | 1) => setOrder((o) => step(o, id, dir))
  const dropOn = (targetId: string, where: 'before' | 'after') => {
    if (dragId) setOrder((o) => reorder(o, dragId, targetId, where))
    setDragId(null)
    setDropMark(null)
  }

  const build = async () => {
    setBuildError(null)
    setResult(null)
    setProgress({ done: 0, total: chosen.length, label: 'Starting' })
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    try {
      const res = await buildPackage(
        chosen.map((i) => ({ ...i, selected: true })),
        {
          title: title.trim() || 'Travel document package',
          travelerName: user?.name,
          tripLine: trip ? `${trip.destination}, ${trip.departOn} to ${trip.returnOn} (${trip.purpose})` : undefined,
          pageNumbers, dividers, contents, compressImages: compress,
          shrink: async (bytes, mime) => {
            const out = await shrinkImage(new File([bytes as BlobPart], 'photo', { type: mime }), 600 * 1024)
            return out ? { bytes: new Uint8Array(await out.arrayBuffer()), mime: 'image/jpeg' as const } : null
          },
        },
        setProgress,
      )
      resultBytes.current = res.bytes
      setResult(res)
      setPreviewUrl(URL.createObjectURL(new Blob([res.bytes as BlobPart], { type: 'application/pdf' })))
    } catch {
      setBuildError('The package could not be built. Please try again.')
    } finally {
      setProgress(null)
    }
  }

  const download = () => {
    if (!previewUrl) return
    const a = document.createElement('a')
    a.href = previewUrl
    a.download = `${(title.trim() || 'travel-package').replace(/[^\w-]+/g, '-').toLowerCase()}.pdf`
    a.click()
  }

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <header>
        <h1 className="text-2xl font-semibold">Document center</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Combine your visa summary, reservations and uploaded files into one organised PDF. Only items you tick are included, each with its true status.
        </p>
      </header>

      {loadError && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{loadError} <button className="underline" onClick={() => void load()}>Retry</button></p>}
      {!sources && !loadError && <p role="status" className="text-sm text-ink-soft">Loading your documents…</p>}

      {sources && items.length === 0 && (
        <Card className="p-10 text-center text-sm text-ink-soft">
          <FileText className="mx-auto mb-3 size-8 text-accent-600" aria-hidden />
          Nothing to package yet. Start a visa application, record a reservation or upload a document first.
        </Card>
      )}

      {sources && items.length > 0 && (
        <>
          <Card className="p-5">
            <h2 className="font-semibold">1. Choose and order documents</h2>
            <p className="mt-1 text-xs text-ink-soft">Drag the handle to reorder, or use the arrow buttons (keyboard and touch). Sample plans are off by default because they are not bookings.</p>
            <ol className="mt-4 divide-y divide-line rounded-xl border border-line">
              {ordered.map((it, idx) => (
                <li
                  key={it.id}
                  draggable
                  onDragStart={(e) => { setDragId(it.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', it.id) }}
                  onDragEnd={() => { setDragId(null); setDropMark(null) }}
                  onDragOver={(e) => {
                    if (!dragId || dragId === it.id) return
                    e.preventDefault()
                    const r = e.currentTarget.getBoundingClientRect()
                    setDropMark({ id: it.id, where: e.clientY < r.top + r.height / 2 ? 'before' : 'after' })
                  }}
                  onDrop={(e) => { e.preventDefault(); dropOn(it.id, dropMark?.id === it.id ? dropMark.where : 'before') }}
                  className={`flex items-start gap-3 p-3 ${dragId === it.id ? 'opacity-40' : ''} ${dropMark?.id === it.id ? (dropMark.where === 'before' ? 'border-t-2 border-t-accent-600' : 'border-b-2 border-b-accent-600') : ''}`}
                >
                  <span className="mt-0.5 cursor-grab text-ink-soft" aria-hidden title="Drag to reorder"><GripVertical className="size-4" /></span>
                  <input
                    id={`pick-${it.id}`} type="checkbox" className="mt-1 size-4 accent-teal-700"
                    checked={!!selected[it.id]} onChange={(e) => setSelected((s) => ({ ...s, [it.id]: e.target.checked }))}
                  />
                  <label htmlFor={`pick-${it.id}`} className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{it.title}</span>
                    <span className="text-xs text-ink-soft">{sectionLabel[it.section]}{it.detail ? ` · ${it.detail}` : ''}</span>
                    <span className="mt-1 block"><Badge tone={badgeTone[it.badge.kind]}>{it.badge.label}</Badge></span>
                  </label>
                  <div className="flex flex-col">
                    <button type="button" aria-label={`Move ${it.title} up`} disabled={idx === 0} onClick={() => move(it.id, -1)} className="rounded p-1 hover:bg-muted disabled:opacity-30"><ArrowUp className="size-4" /></button>
                    <button type="button" aria-label={`Move ${it.title} down`} disabled={idx === ordered.length - 1} onClick={() => move(it.id, 1)} className="rounded p-1 hover:bg-muted disabled:opacity-30"><ArrowDown className="size-4" /></button>
                  </div>
                </li>
              ))}
            </ol>
          </Card>

          <Card className="p-5">
            <h2 className="font-semibold">2. Options</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-medium text-ink-soft">Package title
                <input className="mt-1.5 h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
              </label>
              <label className="text-xs font-medium text-ink-soft">Trip shown on the cover
                <select className="mt-1.5 h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink" value={tripId} onChange={(e) => setTripId(e.target.value)}>
                  <option value="">None</option>
                  {trips.map((t) => <option key={t.id} value={t.id}>{t.destination} ({t.departOn})</option>)}
                </select>
              </label>
            </div>
            <div className="mt-4 flex flex-wrap gap-6 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={contents} onChange={(e) => setContents(e.target.checked)} />Contents page</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={dividers} onChange={(e) => setDividers(e.target.checked)} />Section heading pages</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={compress} onChange={(e) => setCompress(e.target.checked)} />Reduce photo size</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={pageNumbers} onChange={(e) => setPageNumbers(e.target.checked)} />Page numbers</label>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="font-semibold">3. Preview and download</h2>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button variant="accent" onClick={() => void build()} disabled={chosen.length === 0 || progress !== null}>
                <Eye className="size-4" aria-hidden />{progress ? 'Building…' : 'Build preview'}
              </Button>
              <Button variant="outline" onClick={download} disabled={!previewUrl}><Download className="size-4" aria-hidden />Download PDF</Button>
              <span className="text-xs text-ink-soft">{chosen.length} item{chosen.length === 1 ? '' : 's'} selected</span>
            </div>

            {progress && (
              <div className="mt-4" role="status" aria-live="polite">
                <div className="h-2 rounded-full bg-muted"><div className="h-full rounded-full bg-accent-600 transition-all" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} /></div>
                <p className="mt-1 text-xs text-ink-soft">{progress.done} of {progress.total} · {progress.label}</p>
              </div>
            )}
            {buildError && <p role="alert" className="mt-4 text-sm text-red-700">{buildError}</p>}

            {result && (
              <div className="mt-5 space-y-4">
                <p className="text-sm" role="status">Built {result.pageCount} page{result.pageCount === 1 ? '' : 's'} · {Math.ceil(result.bytes.length / 1024)} KB
                  {compress && (result.compression.imagesShrunk > 0
                    ? ` · ${result.compression.imagesShrunk} photo${result.compression.imagesShrunk === 1 ? '' : 's'} reduced, ${Math.ceil(result.compression.bytesSaved / 1024)} KB saved`
                    : ' · no photos needed reducing')}
                </p>
                {compress && <p className="text-xs text-ink-soft">Uploaded PDFs are always included exactly as they are; only photos are reduced.</p>}
                {result.failures.length > 0 && (
                  <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                    <p className="font-medium">{result.failures.length} item{result.failures.length === 1 ? ' was' : 's were'} left out:</p>
                    <ul className="mt-1 list-disc pl-5">{result.failures.map((f) => <li key={f.id}><strong>{f.title}</strong> — {f.reason}</li>)}</ul>
                  </div>
                )}
                <ol className="divide-y divide-line rounded-xl border border-line text-sm">
                  {result.outline.map((o) => (
                    <li key={o.id} className="flex items-center justify-between gap-3 p-2.5">
                      <span>{o.title}<span className="block text-xs text-ink-soft">{sectionLabel[o.section]} · {o.badge}</span></span>
                      <span className="text-xs text-ink-soft">p. {o.page}</span>
                    </li>
                  ))}
                </ol>
                {previewUrl && <iframe title="Package preview" src={previewUrl} className="h-[70vh] w-full rounded-xl border border-line" />}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  )
}

import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'
import type { LatLng } from './geo'
import type { Poi } from './poi'

export interface MapViewProps {
  center: LatLng
  pois: Poi[]
  selectedId: string | null
  onSelect(id: string): void
  /** Road geometry from the routing service, or null. */
  routeLine: LatLng[] | null
}

const KIND_COLOR = { attraction: '#0d9488', hotel: '#0b1f3a' } as const

// divIcon avoids Leaflet's default image assets, which bundlers often fail to resolve.
function pin(color: string, active: boolean) {
  const size = active ? 34 : 26
  return L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></span>`,
  })
}

/** Leaflet + OpenStreetMap tiles. No API key, no account, no billing. */
export default function MapView({ center, pois, selectedId, onSelect, routeLine }: MapViewProps) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const markers = useRef<L.LayerGroup | null>(null)
  const line = useRef<L.Polyline | null>(null)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  useEffect(() => {
    if (!el.current) return
    const m = L.map(el.current, { center: [center.lat, center.lng], zoom: 12 })
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(m)
    markers.current = L.layerGroup().addTo(m)
    map.current = m
    return () => {
      m.remove()
      map.current = null
    }
    // Created once; later center changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    map.current?.setView([center.lat, center.lng], 12)
  }, [center.lat, center.lng])

  useEffect(() => {
    const g = markers.current
    if (!g) return
    g.clearLayers()
    for (const p of pois) {
      L.marker([p.lat, p.lng], { icon: pin(KIND_COLOR[p.kind], p.id === selectedId), title: p.title, alt: p.title, keyboard: true })
        .on('click', () => onSelectRef.current(p.id))
        .addTo(g)
    }
  }, [pois, selectedId])

  useEffect(() => {
    line.current?.remove()
    line.current = null
    if (!routeLine || routeLine.length < 2 || !map.current) return
    const pl = L.polyline(routeLine.map((p) => [p.lat, p.lng] as [number, number]), { color: '#0d9488', weight: 5, opacity: 0.85 }).addTo(map.current)
    map.current.fitBounds(pl.getBounds(), { padding: [30, 30] })
    line.current = pl
  }, [routeLine])

  return <div ref={el} className="z-0 aspect-[4/3] w-full rounded-2xl border border-line" role="application" aria-label="Interactive map" />
}

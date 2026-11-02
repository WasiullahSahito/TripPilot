import { useCallback, useEffect, useRef, useState } from 'react'
import { visaApi, type ApplicationStatus, type DocumentDto } from './visa-api'
import { mergeFormData, type FormData, type StepId } from './form-schema'

interface Init { destinationId: string; categoryId: string; nationality: string; residence: string; seed: Partial<FormData> }

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

const AUTOSAVE_MS = 1200

export function useWorkspace(init: Init) {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [id, setId] = useState<string | null>(null)
  const [data, setData] = useState<FormData>(() => mergeFormData(init.seed))
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [status, setStatus] = useState<ApplicationStatus>('draft')
  const [nationality, setNationality] = useState(init.nationality)
  const [residence, setResidence] = useState(init.residence)
  const [documents, setDocuments] = useState<DocumentDto[]>([])
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [dirty, setDirty] = useState(false)

  const latest = useRef({ data, checked, status, nationality, residence })
  latest.current = { data, checked, status, nationality, residence }

  // Resume an existing draft for this destination + category, if any.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const apps = await visaApi.list()
        const found = apps.find((a) => a.destinationId === init.destinationId && a.categoryId === init.categoryId)
        if (found && !cancelled) {
          const full = await visaApi.get(found.id)
          if (cancelled) return
          setId(found.id)
          setData(mergeFormData(found.data))
          setChecked(found.checklist)
          setStatus(found.status)
          setNationality(found.nationality)
          setResidence(found.residence)
          setDocuments(full.documents)
        }
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Could not load your application')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [init.destinationId, init.categoryId])

  const save = useCallback(async (): Promise<string | null> => {
    setSaveState('saving')
    try {
      const s = latest.current
      const app = await visaApi.save({
        destinationId: init.destinationId, categoryId: init.categoryId, nationality: s.nationality,
        residence: s.residence, status: s.status, checklist: s.checked, data: s.data,
      })
      setId(app.id)
      setDirty(false)
      setSaveState('saved')
      return app.id
    } catch {
      setSaveState('error')
      return null
    }
  }, [init.destinationId, init.categoryId])

  useEffect(() => {
    if (!dirty) return
    const t = setTimeout(() => void save(), AUTOSAVE_MS)
    return () => clearTimeout(t)
  }, [dirty, data, checked, status, nationality, residence, save])

  const touch = () => setDirty(true)

  return {
    loading, loadError, id, data, checked, status, nationality, residence, documents, saveState,
    save,
    setField(step: StepId, field: string, value: string) {
      setData((d) => ({ ...d, [step]: { ...d[step], [field]: value } }))
      touch()
    },
    setChecked(itemId: string, value: boolean) {
      setChecked((c) => ({ ...c, [itemId]: value }))
      touch()
    },
    setNationality(v: string) {
      setNationality(v)
      touch()
    },
    setResidence(v: string) {
      setResidence(v)
      touch()
    },
    setStatus(s: ApplicationStatus) {
      setStatus(s)
      touch()
    },
    async upload(itemId: string, file: File) {
      const appId = id ?? (await save())
      if (!appId) throw new Error('Save failed — try again')
      const doc = await visaApi.upload(appId, itemId, file)
      setDocuments((d) => [...d, doc])
      setChecked((c) => ({ ...c, [itemId]: true }))
      touch()
    },
    async removeDocument(docId: string) {
      await visaApi.deleteDocument(docId)
      setDocuments((d) => d.filter((x) => x.id !== docId))
    },
  }
}

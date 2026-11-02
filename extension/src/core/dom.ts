import { exclusionReason, type Exclusion, type FieldMeta } from './safety'
import type { FieldKey } from './payload'

export interface ScannedField extends FieldMeta {
  index: number
  currentValue: string
  /** An id or name based selector that identifies this control on the page, or null if it has no stable one. */
  selector: string | null
  /** For <select>: the option labels, so the popup can show what is available. */
  options: string[]
  /** Set when a site adapter pinned this element to a specific exported value. */
  hintKey?: FieldKey
}

export interface Assignment {
  index: number
  value: string
}

export type FillStatus = 'filled' | 'skipped' | 'failed'
export interface FillResult {
  index: number
  status: FillStatus
  reason?: string
}

type FormEl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement

// Elements found by the last scan, addressed by index so the page's DOM is never modified or tagged.
let registry: FormEl[] = []

const defaultVisible = (el: Element) => {
  const style = el.ownerDocument.defaultView?.getComputedStyle(el)
  return el.getClientRects().length > 0 && style?.visibility !== 'hidden' && style?.display !== 'none'
}

const clip = (s: string, n = 200) => s.replace(/\s+/g, ' ').trim().slice(0, n)

function labelOf(el: FormEl, doc: Document): string {
  const parts: string[] = []
  if (el.id) for (const l of Array.from(doc.querySelectorAll('label'))) if (l.htmlFor === el.id) parts.push(l.textContent ?? '')
  const wrapping = el.closest('label')
  if (wrapping) parts.push(wrapping.textContent ?? '')
  const aria = el.getAttribute('aria-label')
  if (aria) parts.push(aria)
  const by = el.getAttribute('aria-labelledby')
  if (by) for (const id of by.split(/\s+/)) parts.push(doc.getElementById(id)?.textContent ?? '')
  return clip(parts.join(' '))
}

function metaOf(el: FormEl, doc: Document, isVisible: (e: Element) => boolean): FieldMeta {
  const tag = el.tagName.toLowerCase() as FieldMeta['tag']
  return {
    tag,
    type: tag === 'input' ? (el as HTMLInputElement).type || 'text' : tag,
    name: el.getAttribute('name') ?? '',
    id: el.id,
    label: labelOf(el, doc),
    placeholder: el.getAttribute('placeholder') ?? '',
    autocomplete: el.getAttribute('autocomplete') ?? '',
    disabled: el.disabled,
    readOnly: tag !== 'select' && (el as HTMLInputElement | HTMLTextAreaElement).readOnly,
    visible: isVisible(el),
  }
}

const SAFE_TOKEN = /^[A-Za-z][A-Za-z0-9_.:-]{0,79}$/
// Ids that end in a long number are usually generated per page load (input_483920): they would not match next time.
const looksGenerated = (v: string) => /\d{4,}/.test(v)

/** A selector that finds exactly this control again later, or null when the page gives it no stable handle. */
export function stableSelector(el: FormEl, doc: Document): string | null {
  const tag = el.tagName.toLowerCase()
  if (el.id && SAFE_TOKEN.test(el.id) && !looksGenerated(el.id) && doc.querySelectorAll(`[id="${el.id}"]`).length === 1) return `[id="${el.id}"]`
  const name = el.getAttribute('name')
  if (name && SAFE_TOKEN.test(name) && !looksGenerated(name) && doc.querySelectorAll(`${tag}[name="${name}"]`).length === 1) return `${tag}[name="${name}"]`
  return null
}

export interface ScanOptions {
  isVisible?: (e: Element) => boolean
  /** CSS selector -> exported key, from the site adapter for this host. */
  hints?: Partial<Record<FieldKey, string>>
}

/** Lists the form controls on the page. Reading only: nothing on the page is changed. */
export function scanFields(doc: Document, opts: ScanOptions = {}): ScannedField[] {
  const isVisible = opts.isVisible ?? defaultVisible
  registry = Array.from(doc.querySelectorAll<FormEl>('input, textarea, select')).slice(0, 500)
  return registry.map((el, index) => {
    const meta = metaOf(el, doc, isVisible)
    let hintKey: FieldKey | undefined
    for (const [key, selector] of Object.entries(opts.hints ?? {})) {
      try {
        if (selector && el.matches(selector)) hintKey = key as FieldKey
      } catch {
        /* an invalid selector in an adapter must not break scanning */
      }
    }
    return {
      ...meta,
      index,
      selector: stableSelector(el, doc),
      currentValue: meta.tag === 'select' ? '' : clip((el as HTMLInputElement).value, 100),
      options: meta.tag === 'select' ? Array.from((el as HTMLSelectElement).options).map((o) => clip(o.text, 80)).slice(0, 300) : [],
      ...(hintKey ? { hintKey } : {}),
    }
  })
}

export interface FillOptions {
  overwrite: boolean
  shouldStop(): boolean
  isVisible?: (e: Element) => boolean
  onProgress?(done: number, total: number): void
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  // Frameworks such as React track the value through the prototype setter; assigning el.value directly can be ignored.
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set
  if (setter) setter.call(el, value)
  else el.value = value
}

function fire(el: Element) {
  const win = el.ownerDocument.defaultView!
  el.dispatchEvent(new win.Event('input', { bubbles: true }))
  el.dispatchEvent(new win.Event('change', { bubbles: true }))
}

const REASON: Record<Exclusion, string> = {
  'blocked-type': 'This kind of field is never filled', sensitive: 'Looks like a security, payment or password field',
  disabled: 'Field is disabled', readonly: 'Field is read-only', hidden: 'Field is not visible',
}

/**
 * Types the approved values into the fields. It re-checks every safety rule at fill time (the page may have changed
 * since the scan), never clicks anything, never submits, and stops as soon as the user asks.
 */
export async function fillFields(assignments: Assignment[], opts: FillOptions): Promise<FillResult[]> {
  const results: FillResult[] = []
  const isVisible = opts.isVisible ?? defaultVisible
  for (let i = 0; i < assignments.length; i++) {
    const a = assignments[i]!
    if (opts.shouldStop()) {
      for (const rest of assignments.slice(i)) results.push({ index: rest.index, status: 'skipped', reason: 'Stopped by you' })
      break
    }
    const el = registry[a.index]
    if (!el || !el.isConnected) {
      results.push({ index: a.index, status: 'failed', reason: 'The field is no longer on the page. Scan again.' })
    } else {
      const why = exclusionReason(metaOf(el, el.ownerDocument, isVisible))
      if (why) results.push({ index: a.index, status: 'skipped', reason: REASON[why] })
      else if (a.value.length > 3000) results.push({ index: a.index, status: 'failed', reason: 'Value is too long' })
      else if (el instanceof HTMLSelectElement) {
        const want = a.value.trim().toLowerCase()
        const opt = Array.from(el.options).find((o) => o.value.toLowerCase() === want || o.text.trim().toLowerCase() === want)
        if (!opt) results.push({ index: a.index, status: 'failed', reason: 'No matching option in the list' })
        else if (el.value && el.selectedIndex > 0 && !opts.overwrite) results.push({ index: a.index, status: 'skipped', reason: 'Already has a value' })
        else {
          el.value = opt.value
          fire(el)
          results.push({ index: a.index, status: 'filled' })
        }
      } else if (el.value.trim() && !opts.overwrite) {
        results.push({ index: a.index, status: 'skipped', reason: 'Already has a value' })
      } else if (el.maxLength > 0 && a.value.length > el.maxLength) {
        results.push({ index: a.index, status: 'failed', reason: `Longer than the ${el.maxLength} characters this field allows` })
      } else {
        setNativeValue(el, a.value)
        fire(el)
        results.push({ index: a.index, status: 'filled' })
      }
    }
    opts.onProgress?.(i + 1, assignments.length)
    await new Promise((r) => setTimeout(r, 0)) // yield so a Stop message can be handled between fields
  }
  return results
}

/** Test helper: forget the last scan. */
export function resetRegistry() {
  registry = []
}

import { adapterFor } from './core/adapters'
import type { FillResult, ScannedField } from './core/dom'
import { FIELD_LABELS, minutesLeft, type AssistantPayload, type FieldKey } from './core/payload'
import { valueFor } from './core/matcher'
import { mergeHints, pin } from './core/user-adapters'
import { buildProposals, type Proposal } from './core/proposals'
import { hostStatus } from './core/safety'
import { clearPayload, getAllowlist, getUserAdapters, loadPayload, savePayload, setUserAdapters } from './storage'

// Everything below that comes from a web page (labels, names) is untrusted: it is only ever written with textContent.
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {}, ...kids: (Node | string)[]) {
  const e = document.createElement(tag)
  const { class: cls, ...rest } = props as Record<string, unknown>
  if (cls) e.className = String(cls)
  Object.assign(e, rest)
  for (const k of kids) e.append(k)
  return e
}

let payload: AssistantPayload | null = null
let proposals: Proposal[] = []
let lastExcluded: Record<string, number> = {}
let lastUnmatched = 0
let teachable: ScannedField[] = []
let tabId: number | null = null
let host = ''
let busy = false

function setStatus(msg: string, kind: 'info' | 'error' | 'ok' = 'info') {
  const s = $('status')
  s.textContent = msg
  s.className = `status ${kind}`
}

async function render() {
  payload = await loadPayload()
  const info = $('data-info')
  info.textContent = payload
    ? `Loaded for ${payload.destination || 'your application'}: ${Object.keys(payload.fields).length} values, expires in ${minutesLeft(payload)} min.`
    : 'No data loaded. Export it from TripPilot (Assistant page) and load the file here.'
  $<HTMLButtonElement>('clear').disabled = !payload
  $<HTMLButtonElement>('scan').disabled = !payload || busy
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id || !tab.url) throw new Error('No active tab.')
  const url = new URL(tab.url)
  if (!/^https?:$/.test(url.protocol)) throw new Error('The assistant only works on web pages (http or https).')
  tabId = tab.id
  host = url.hostname
  return tab
}

function renderProposals(rows: Proposal[], excluded: Record<string, number>, unmatched: number) {
  lastExcluded = excluded
  lastUnmatched = unmatched
  const box = $('results')
  box.replaceChildren()
  if (rows.length === 0) {
    box.append(h('p', { class: 'muted' }, 'No fields on this page matched your exported data. You can still type it in yourself.'))
  } else {
    const list = h('ul', { class: 'rows' })
    for (const p of rows) {
      const cb = h('input', { type: 'checkbox', checked: p.selected, id: `p-${p.index}` })
      cb.addEventListener('change', () => (p.selected = cb.checked))
      const val = h('input', { type: p.key === 'applicant.address' || p.key === 'itinerary.plan' ? 'text' : 'text', value: p.value, class: 'val' })
      val.setAttribute('aria-label', `Value for ${p.pageLabel}`)
      val.addEventListener('input', () => (p.value = val.value))
      const row = h('li', { class: 'row' },
        h('label', { htmlFor: cb.id, class: 'lbl' }, cb, h('span', {}, ` ${p.pageLabel}`)),
        h('div', { class: 'meta' }, `${p.keyLabel} · ${p.confidence} confidence (${p.reason})`),
        val,
      )
      if (p.warning) row.append(h('div', { class: 'warn' }, p.warning))
      list.append(row)
    }
    box.append(list)
  }
  const notes: string[] = []
  const refused = Object.values(excluded).reduce((a, b) => a + b, 0)
  if (refused) notes.push(`${refused} security, payment, password or file field${refused === 1 ? ' was' : 's were'} left alone on purpose.`)
  if (unmatched) notes.push(`${unmatched} other field${unmatched === 1 ? '' : 's'} had no matching value.`)
  if (notes.length) box.append(h('p', { class: 'muted' }, notes.join(' ')))
  renderTeach(box)
  $('actions').hidden = rows.length === 0
}

/** "Teach this site": pin a field the extension could not match, and it is remembered for this website. */
function renderTeach(box: HTMLElement) {
  if (!payload || teachable.length === 0) return
  const keys = (Object.keys(payload.fields) as FieldKey[]).filter((k) => !proposals.some((p) => p.key === k))
  if (keys.length === 0) return
  const details = h('details', { class: 'teach' }, h('summary', {}, `Teach this site (${teachable.length} unmatched field${teachable.length === 1 ? '' : 's'})`))
  details.append(h('p', { class: 'muted' }, 'Choose which of your values belongs in a field. It is remembered for this website only, and you still approve every value before it is filled.'))
  for (const f of teachable.slice(0, 40)) {
    const sel = h('select', {})
    sel.setAttribute('aria-label', `Value for ${f.label || f.name || f.id}`)
    sel.append(h('option', { value: '' }, 'Choose a value…'))
    for (const k of keys) sel.append(h('option', { value: k }, FIELD_LABELS[k]))
    const btn = h('button', { type: 'button' }, 'Pin')
    btn.addEventListener('click', () => void pinField(f, sel.value as FieldKey | ''))
    details.append(h('div', { class: 'bar' }, h('span', { class: 'lbl' }, f.label || f.name || f.id || '(unlabelled field)'), sel, btn))
  }
  box.append(details)
}

async function pinField(f: ScannedField, key: FieldKey | '') {
  if (!payload || !key || !f.selector) return setStatus('Choose a value first.', 'error')
  const result = pin(await getUserAdapters(), host, key, f.selector)
  if (!result.ok) return setStatus(result.error, 'error')
  await setUserAdapters(result.adapters)
  const v = valueFor(key, payload.fields[key] ?? '', f)
  proposals.push({
    index: f.index, pageLabel: f.label || f.name || f.id || `(unlabelled ${f.tag})`, key, keyLabel: FIELD_LABELS[key], confidence: 'high',
    reason: 'you pinned this field', value: v.value, selected: v.verified, ...(v.verified ? {} : { warning: 'Date layout is a guess: check it matches what the site expects.' }),
  })
  teachable = teachable.filter((t) => t.index !== f.index)
  renderProposals(proposals, lastExcluded, Math.max(0, lastUnmatched - 1))
  setStatus(`Remembered for ${host}. Review it below before filling.`, 'ok')
}

async function scan() {
  if (!payload || busy) return
  busy = true
  try {
    setStatus('Scanning this page…')
    const tab = await activeTab()
    const allow = await getAllowlist()
    const hs = hostStatus(host, allow)
    if (hs === 'unlisted' && !$<HTMLInputElement>('allow-once').checked) {
      $('allow-once-row').hidden = false
      setStatus(`${host} is not on your allowed-sites list. Tick the box below to use it just this once, then scan again.`, 'error')
      return
    }
    await chrome.scripting.executeScript({ target: { tabId: tab.id! }, files: ['content.js'] })
    const adapter = adapterFor(host)
    const taught = (await getUserAdapters())[host]
    const res = (await chrome.tabs.sendMessage(tab.id!, { type: 'scan', hints: mergeHints(adapter?.hints, taught) })) as { fields: ScannedField[] }
    const out = buildProposals(res.fields, payload)
    proposals = out.proposals
    teachable = out.teachable
    renderProposals(out.proposals, out.excluded, out.unmatched)
    setStatus(`${out.proposals.length} suggestion${out.proposals.length === 1 ? '' : 's'} for ${host}${adapter ? ` (adapter: ${adapter.name})` : ''}. Review before filling.`, 'ok')
  } catch (e) {
    setStatus(e instanceof Error ? e.message : 'Could not scan this page.', 'error')
  } finally {
    busy = false
    void render()
  }
}

async function fill() {
  if (tabId === null || busy) return
  const chosen = proposals.filter((p) => p.selected && p.value.trim())
  if (chosen.length === 0) return setStatus('Tick at least one field first.', 'error')
  busy = true
  $('stop').hidden = false
  $<HTMLButtonElement>('fill').disabled = true
  setStatus(`Filling ${chosen.length} field${chosen.length === 1 ? '' : 's'}…`)
  try {
    const res = (await chrome.tabs.sendMessage(tabId, {
      type: 'fill', overwrite: $<HTMLInputElement>('overwrite').checked, assignments: chosen.map((p) => ({ index: p.index, value: p.value })),
    })) as { results: FillResult[] }
    const label = (i: number) => proposals.find((p) => p.index === i)?.pageLabel ?? `field ${i}`
    const done = res.results.filter((r) => r.status === 'filled').length
    const problems = res.results.filter((r) => r.status !== 'filled')
    const box = $('report')
    box.replaceChildren(h('p', {}, `Filled ${done} of ${res.results.length}.`))
    if (problems.length) box.append(h('ul', { class: 'problems' }, ...problems.map((r) => h('li', {}, `${label(r.index)}: ${r.reason ?? r.status}`))))
    box.append(h('p', { class: 'muted' }, 'Nothing was submitted. Check each value, then complete any CAPTCHA, consent, verification and payment yourself on the site.'))
    setStatus(problems.length ? `Done with ${problems.length} issue${problems.length === 1 ? '' : 's'}.` : 'Done.', problems.length ? 'error' : 'ok')
  } catch (e) {
    setStatus(e instanceof Error ? `Could not fill: ${e.message}` : 'Could not fill the page. Scan again.', 'error')
  } finally {
    busy = false
    $('stop').hidden = true
    $<HTMLButtonElement>('fill').disabled = false
  }
}

async function stop() {
  if (tabId === null) return
  await chrome.tabs.sendMessage(tabId, { type: 'stop' }).catch(() => undefined)
  setStatus('Stopping…')
}

document.addEventListener('DOMContentLoaded', () => {
  void render()
  $('scan').addEventListener('click', () => void scan())
  $('fill').addEventListener('click', () => void fill())
  $('stop').addEventListener('click', () => void stop())
  $('clear').addEventListener('click', async () => {
    await clearPayload()
    proposals = []
    $('results').replaceChildren()
    $('actions').hidden = true
    setStatus('Your data was removed from the extension.', 'ok')
    void render()
  })
  $('options').addEventListener('click', () => void chrome.runtime.openOptionsPage())
  $<HTMLInputElement>('file').addEventListener('change', async (e) => {
    const f = (e.target as HTMLInputElement).files?.[0]
    ;(e.target as HTMLInputElement).value = ''
    if (!f) return
    const r = await savePayload(await f.text())
    setStatus(r.ok ? 'Data loaded. It stays in memory only and expires automatically.' : r.error, r.ok ? 'ok' : 'error')
    void render()
  })
})

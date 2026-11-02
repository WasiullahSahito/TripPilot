import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fillFields, resetRegistry, scanFields, stableSelector } from './dom'
import { buildProposals } from './proposals'
import { parsePayload } from './payload'
import {
  exportAdapters, importAdapters, isSafeSelector, MAX_SITES, mergeHints, parseUserAdapters, pin, unpin, type UserAdapters,
} from './user-adapters'

describe('selector safety', () => {
  it('accepts only an id or name on a form control', () => {
    for (const ok of ['[id="surname"]', 'input[name="given_names"]', 'select[name="country.code"]', '[name="a-b:c"]']) expect(isSafeSelector(ok), ok).toBe(true)
    for (const bad of ['#surname', 'div > input', 'input[name="a"] , body', '[id=x]', '[id="a b"]', '[id=""]', 'input[onclick="x"]', "[id='x']", 'input[name="' + 'a'.repeat(81) + '"]', 42, null]) {
      expect(isSafeSelector(bad), String(bad)).toBe(false)
    }
  })
})

describe('parseUserAdapters (untrusted input)', () => {
  it('keeps valid sites and hints and drops everything else', () => {
    const out = parseUserAdapters({
      'Apply.Example.GOV': { 'applicant.surname': '[id="surname"]', 'applicant.email': '#nope', 'evil.key': '[id="x"]' },
      'not a host': { 'applicant.surname': '[id="x"]' },
      'empty.example': { 'applicant.surname': 'div > input' },
      'bad-shape.example': 'string',
    })
    expect(out).toEqual({ 'apply.example.gov': { 'applicant.surname': '[id="surname"]' } })
  })
  it('tolerates junk', () => {
    for (const junk of [null, undefined, 5, 'x', [], { a: null }]) expect(parseUserAdapters(junk)).toEqual({})
  })
  it('enforces the size limits', () => {
    const many = Object.fromEntries(Array.from({ length: MAX_SITES + 20 }, (_, i) => [`site${i}.example.com`, { 'applicant.surname': '[id="s"]' }]))
    expect(Object.keys(parseUserAdapters(many))).toHaveLength(MAX_SITES)
  })
})

describe('pin / unpin', () => {
  const key = 'applicant.surname' as const
  it('remembers a field for a site and moves it when pinned again', () => {
    const a = pin({}, 'apply.example.gov', key, '[id="surname"]')
    expect(a).toEqual({ ok: true, adapters: { 'apply.example.gov': { [key]: '[id="surname"]' } } })
    const b = pin((a as { adapters: UserAdapters }).adapters, 'apply.example.gov', key, '[name="family"]')
    expect((b as { adapters: UserAdapters }).adapters['apply.example.gov']).toEqual({ [key]: '[name="family"]' })
  })
  it('refuses unsafe selectors, bad hosts and over-limit pins, without changing anything', () => {
    expect(pin({}, 'apply.example.gov', key, 'div > input')).toMatchObject({ ok: false })
    expect(pin({}, 'not a host', key, '[id="x"]')).toMatchObject({ ok: false })
    const full = Object.fromEntries(Array.from({ length: MAX_SITES }, (_, i) => [`site${i}.example.com`, { [key]: '[id="s"]' }])) as UserAdapters
    expect(pin(full, 'one-more.example.com', key, '[id="s"]')).toMatchObject({ ok: false })
    expect(pin(full, 'site0.example.com', 'applicant.email', '[id="e"]')).toMatchObject({ ok: true })
  })
  it('removes one hint or a whole site, and does not mutate its input', () => {
    const start: UserAdapters = { 'a.example.com': { [key]: '[id="s"]', 'applicant.email': '[id="e"]' }, 'b.example.com': { [key]: '[id="s"]' } }
    const copy = JSON.stringify(start)
    expect(unpin(start, 'a.example.com', key)['a.example.com']).toEqual({ 'applicant.email': '[id="e"]' })
    expect(unpin(start, 'b.example.com', key)).not.toHaveProperty('b.example.com')
    expect(unpin(start, 'a.example.com')).not.toHaveProperty('a.example.com')
    expect(unpin(start, 'unknown.example.com')).toBe(start)
    expect(JSON.stringify(start)).toBe(copy)
  })
  it('taught pins override bundled ones for the same field', () => {
    expect(mergeHints({ 'applicant.surname': '#old', 'applicant.email': '#mail' }, { 'applicant.surname': '[id="new"]' })).toEqual({ 'applicant.surname': '[id="new"]', 'applicant.email': '#mail' })
    expect(mergeHints(undefined, undefined)).toEqual({})
  })
})

describe('export and import', () => {
  const a: UserAdapters = { 'apply.example.gov': { 'applicant.surname': '[id="surname"]' } }
  it('round-trips and merges into what is already there', () => {
    const r = importAdapters(exportAdapters(a), { 'other.example.com': { 'applicant.email': '[id="e"]' } })
    expect(r).toMatchObject({ ok: true, sitesAdded: 1 })
    expect((r as { adapters: UserAdapters }).adapters).toEqual({ 'other.example.com': { 'applicant.email': '[id="e"]' }, ...a })
  })
  it('rejects wrong, hostile or empty files', () => {
    expect(importAdapters('nope', {})).toMatchObject({ ok: false })
    expect(importAdapters(JSON.stringify({ app: 'other', version: 1, sites: a }), {})).toMatchObject({ ok: false })
    expect(importAdapters(JSON.stringify({ app: 'trippilot-adapters', version: 1, sites: { 'x.example.com': { 'applicant.surname': '<script>' } } }), {})).toMatchObject({ ok: false, error: expect.stringContaining('no valid') })
    expect(importAdapters('x'.repeat(200_001), {})).toMatchObject({ ok: false })
  })
})

describe('stable selectors on a real page', () => {
  const load = (html: string) => { document.body.innerHTML = html; resetRegistry() }
  const el = (sel: string) => document.querySelector(sel) as HTMLInputElement

  it('prefers a unique id, then a unique name, and refuses ambiguous or generated handles', () => {
    load('<input id="surname"><input name="given"><input name="dup"><input name="dup"><input id="input_483920"><input>')
    const sel = (i: number) => stableSelector(document.querySelectorAll('input')[i]!, document)
    expect(sel(0)).toBe('[id="surname"]')
    expect(sel(1)).toBe('input[name="given"]')
    expect(sel(2)).toBeNull() // two controls share the name
    expect(sel(3)).toBeNull()
    expect(sel(4)).toBeNull() // looks generated per page load
    expect(sel(5)).toBeNull() // no handle at all
    expect(isSafeSelector(stableSelector(el('#surname'), document))).toBe(true)
  })

  it('a pinned field is matched, previewed and filled on the next visit, with the usual safety checks', async () => {
    const page = '<form><label for="x1">Zork field</label><input id="x1" name="q"><label for="pw">Secret</label><input id="pw" type="password"></form>'
    load(page)
    const payload = parsePayload(JSON.stringify({ app: 'trippilot', version: 1, expiresAt: new Date(Date.now() + 600_000).toISOString(), fields: { 'applicant.surname': 'Rao' } }))
    if (!payload.ok) throw new Error(payload.error)
    const visible = () => true

    // first visit: the label means nothing to the matcher, so the field is offered for teaching
    let fields = scanFields(document, { isVisible: visible })
    const first = buildProposals(fields, payload.payload)
    expect(first.proposals).toHaveLength(0)
    expect(first.teachable.map((f) => f.id)).toEqual(['x1'])

    // the user pins it
    const pinned = pin({}, 'apply.example.gov', 'applicant.surname', first.teachable[0]!.selector!)
    if (!pinned.ok) throw new Error(pinned.error)

    // next visit (a fresh page load): the pin supplies the match
    load(page)
    fields = scanFields(document, { isVisible: visible, hints: mergeHints(undefined, pinned.adapters['apply.example.gov']) })
    const second = buildProposals(fields, payload.payload)
    expect(second.proposals).toHaveLength(1)
    expect(second.proposals[0]).toMatchObject({ key: 'applicant.surname', value: 'Rao', selected: true, reason: 'site adapter' })
    const res = await fillFields([{ index: second.proposals[0]!.index, value: 'Rao' }], { overwrite: false, shouldStop: () => false, isVisible: visible })
    expect(res[0]!.status).toBe('filled')
    expect(el('#x1').value).toBe('Rao')

    // a pin can never be used to reach a password field: the safety rules still apply
    const pw = fields.find((f) => f.id === 'pw')!
    const r2 = await fillFields([{ index: pw.index, value: 'hunter2' }], { overwrite: true, shouldStop: () => false, isVisible: visible })
    expect(r2[0]!.status).toBe('skipped')
    expect(el('#pw').value).toBe('')
  })

  it('the bundled test form still scans (smoke check)', () => {
    const html = readFileSync(join(process.cwd(), 'extension', 'test-page', 'form.html'), 'utf8')
    document.documentElement.innerHTML = html.replace(/^[\s\S]*?<html[^>]*>/i, '').replace(/<\/html>[\s\S]*$/i, '')
    resetRegistry()
    const fields = scanFields(document, { isVisible: () => true })
    expect(fields.find((f) => f.id === 'surname')!.selector).toBe('[id="surname"]')
  })
})

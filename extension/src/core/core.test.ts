import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { adapterFor } from './adapters'
import { fillFields, resetRegistry, scanFields } from './dom'
import { formatDateFor, matchField } from './matcher'
import { isExpired, minutesLeft, parsePayload, type AssistantPayload } from './payload'
import { buildProposals } from './proposals'
import { exclusionReason, hostStatus, normaliseHost, type FieldMeta } from './safety'

const NOW = new Date('2026-12-01T10:00:00Z')
const future = new Date(NOW.getTime() + 30 * 60_000).toISOString()

const payloadJson = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    app: 'trippilot', version: 1, createdAt: NOW.toISOString(), expiresAt: future, destination: 'France',
    fields: {
      'applicant.givenNames': 'Asha', 'applicant.surname': 'Rao', 'applicant.dateOfBirth': '1990-04-02', 'applicant.email': 'asha@example.com',
      'applicant.phone': '+91 90000 00000', 'applicant.address': '1 Main St\nPune', 'passport.number': 'Z1234567', 'passport.expiryDate': '2031-05-06',
      'travel.purpose': 'Tourism',
    },
    ...over,
  })

const meta = (over: Partial<FieldMeta> = {}): FieldMeta => ({
  tag: 'input', type: 'text', name: '', id: '', label: '', placeholder: '', autocomplete: '', disabled: false, readOnly: false, visible: true, ...over,
})

const payload = (): AssistantPayload => {
  const r = parsePayload(payloadJson(), NOW)
  if (!r.ok) throw new Error(r.error)
  return r.payload
}

describe('parsePayload', () => {
  it('accepts a valid export and keeps only known keys', () => {
    const r = parsePayload(payloadJson({ fields: { 'applicant.surname': 'Rao', 'evil.key': 'x', 'applicant.email': 42 } }), NOW)
    expect(r.ok).toBe(true)
    if (r.ok) expect(Object.keys(r.payload.fields)).toEqual(['applicant.surname'])
  })

  it('rejects expired, wrong-app, wrong-version, empty, oversize and malformed data', () => {
    const bad = (s: string) => parsePayload(s, NOW)
    expect(bad(payloadJson({ expiresAt: '2026-12-01T09:00:00Z' }))).toMatchObject({ ok: false, error: expect.stringMatching(/expired/) })
    expect(bad(payloadJson({ app: 'other' })).ok).toBe(false)
    expect(bad(payloadJson({ version: 2 })).ok).toBe(false)
    expect(bad(payloadJson({ fields: {} })).ok).toBe(false)
    expect(bad('not json').ok).toBe(false)
    expect(bad('x'.repeat(100_001)).ok).toBe(false)
    expect(bad(payloadJson({ expiresAt: 'tomorrow' })).ok).toBe(false)
  })

  it('reports remaining time', () => {
    const p = payload()
    expect(minutesLeft(p, NOW)).toBe(30)
    expect(isExpired(p, new Date(NOW.getTime() + 31 * 60_000))).toBe(true)
  })
})

describe('safety rules', () => {
  it('never allows password, file, hidden, button or checkbox controls', () => {
    for (const type of ['password', 'file', 'hidden', 'submit', 'checkbox', 'radio']) expect(exclusionReason(meta({ type }))).toBe('blocked-type')
  })

  it('refuses captcha, one-time codes, card and security fields by name, label or autocomplete', () => {
    expect(exclusionReason(meta({ name: 'g-recaptcha-response' }))).toBe('sensitive')
    expect(exclusionReason(meta({ label: 'Enter the verification code we sent' }))).toBe('sensitive')
    expect(exclusionReason(meta({ label: 'Card number' }))).toBe('sensitive')
    expect(exclusionReason(meta({ autocomplete: 'cc-number' }))).toBe('sensitive')
    expect(exclusionReason(meta({ autocomplete: 'one-time-code' }))).toBe('sensitive')
    expect(exclusionReason(meta({ name: 'csrf_token' }))).toBe('sensitive')
  })

  it('refuses disabled, read-only and invisible fields but allows ordinary ones', () => {
    expect(exclusionReason(meta({ disabled: true }))).toBe('disabled')
    expect(exclusionReason(meta({ readOnly: true }))).toBe('readonly')
    expect(exclusionReason(meta({ visible: false }))).toBe('hidden')
    expect(exclusionReason(meta({ label: 'Surname' }))).toBeNull()
  })

  it('normalises allowlist hosts and checks them', () => {
    expect(normaliseHost('https://Example.gov/path?x=1')).toBe('example.gov')
    expect(normaliseHost('*.example.gov')).toBeNull()
    expect(normaliseHost('javascript:alert(1)')).toBeNull()
    expect(normaliseHost('localhost')).toBe('localhost')
    expect(hostStatus('apply.example.gov', [])).toBe('no-list')
    expect(hostStatus('apply.example.gov', ['example.gov'])).toBe('allowed')
    expect(hostStatus('evil.com', ['example.gov'])).toBe('unlisted')
    expect(hostStatus('notexample.gov', ['example.gov'])).toBe('unlisted')
  })
})

describe('matchField', () => {
  it('uses autocomplete tokens first', () => {
    expect(matchField(meta({ autocomplete: 'family-name', label: 'Whatever' }))).toMatchObject({ key: 'applicant.surname', confidence: 'high' })
  })

  it('matches common labels', () => {
    const k = (label: string, extra: Partial<FieldMeta> = {}) => matchField(meta({ label, ...extra }))?.key
    expect(k('Last name')).toBe('applicant.surname')
    expect(k('First name')).toBe('applicant.givenNames')
    expect(k('Date of birth')).toBe('applicant.dateOfBirth')
    expect(k('Place of birth')).toBe('applicant.placeOfBirth')
    expect(k('Passport number')).toBe('passport.number')
    expect(k('Date of expiry')).toBe('passport.expiryDate')
    expect(k('Mobile phone')).toBe('applicant.phone')
    expect(k('Home address')).toBe('applicant.address')
    expect(k('Name of hotel')).toBe('accommodation.name')
    expect(k('Hotel address')).toBe('accommodation.address')
    expect(k('Purpose of visit')).toBe('travel.purpose')
    expect(k('Intended date of arrival')).toBe('travel.arrivalDate')
  })

  it('does not confuse email address with a postal address, or place of birth with date of birth', () => {
    expect(matchField(meta({ label: 'Email address' }))?.key).toBe('applicant.email')
    expect(matchField(meta({ label: 'Place of birth' }))?.key).not.toBe('applicant.dateOfBirth')
  })

  it('returns nothing for unknown fields instead of guessing', () => {
    expect(matchField(meta({ label: 'Favourite colour' }))).toBeNull()
  })

  it('rates a name-only match lower than a label match', () => {
    expect(matchField(meta({ name: 'surname' }))?.confidence).toBe('medium')
    expect(matchField(meta({ label: 'Surname' }))?.confidence).toBe('high')
  })
})

describe('formatDateFor', () => {
  it('uses ISO for date inputs and honours explicit placeholders', () => {
    expect(formatDateFor({ type: 'date', placeholder: '' }, '2031-05-06')).toEqual({ value: '2031-05-06', verified: true })
    expect(formatDateFor({ type: 'text', placeholder: 'dd/mm/yyyy' }, '2031-05-06')).toEqual({ value: '06/05/2031', verified: true })
    expect(formatDateFor({ type: 'text', placeholder: 'MM-DD-YYYY' }, '2031-05-06')).toEqual({ value: '05-06-2031', verified: true })
    expect(formatDateFor({ type: 'text', placeholder: 'YYYY.MM.DD' }, '2031-05-06')).toEqual({ value: '2031.05.06', verified: true })
  })
  it('flags a guessed layout as unverified', () => {
    expect(formatDateFor({ type: 'text', placeholder: '' }, '2031-05-06')).toEqual({ value: '2031-05-06', verified: false })
  })
})

describe('adapters', () => {
  it('finds an adapter by host', () => {
    expect(adapterFor('localhost')?.id).toBe('trippilot-test-form')
    expect(adapterFor('unknown.example')).toBeUndefined()
  })
})

describe('scan, propose and fill on the bundled test form', () => {
  const html = readFileSync(join(process.cwd(), 'extension', 'test-page', 'form.html'), 'utf8')
  const load = () => {
    document.documentElement.innerHTML = html.replace(/^[\s\S]*?<html[^>]*>/i, '').replace(/<\/html>[\s\S]*$/i, '')
    resetRegistry()
  }
  const visible = () => true
  const byId = (id: string) => document.getElementById(id) as HTMLInputElement

  it('scans every control with its label', () => {
    load()
    const fields = scanFields(document, { isVisible: visible })
    expect(fields.find((f) => f.id === 'dob')!.label).toBe('Date of birth')
    expect(fields.find((f) => f.id === 'purpose')!.options).toContain('Tourism')
  })

  it('proposes values, refuses sensitive fields, and ticks only confident suggestions', () => {
    load()
    const fields = scanFields(document, { isVisible: visible, hints: adapterFor('localhost')!.hints })
    const { proposals, excluded } = buildProposals(fields, payload())
    const forId = (id: string) => proposals.find((p) => fields[p.index]!.id === id)
    expect(forId('surname')).toMatchObject({ key: 'applicant.surname', value: 'Rao', selected: true, reason: 'site adapter' })
    expect(forId('dob')).toMatchObject({ value: '02/04/1990', selected: true })
    expect(forId('expiry')).toMatchObject({ value: '2031-05-06' })
    expect(forId('pw')).toBeUndefined()
    expect(forId('captcha')).toBeUndefined()
    expect(forId('card')).toBeUndefined()
    expect(forId('scan')).toBeUndefined()
    expect(excluded.sensitive).toBe(2) // captcha, card number
    expect(excluded['blocked-type']).toBe(3) // password, file upload, hidden token
  })

  it('fills approved fields with events fired, and leaves everything else untouched', async () => {
    load()
    let inputs = 0
    byId('given').addEventListener('input', () => inputs++)
    const fields = scanFields(document, { isVisible: visible })
    const { proposals } = buildProposals(fields, payload())
    const results = await fillFields(proposals.filter((p) => p.selected).map((p) => ({ index: p.index, value: p.value })), {
      overwrite: false, shouldStop: () => false, isVisible: visible,
    })
    expect(results.every((r) => r.status === 'filled')).toBe(true)
    expect(byId('given').value).toBe('Asha')
    expect(byId('surname').value).toBe('Rao')
    expect(inputs).toBe(1)
    expect(byId('pw').value).toBe('')
    expect(byId('captcha').value).toBe('')
    expect(byId('card').value).toBe('')
  })

  it('refuses to fill a sensitive field even if asked directly (defence in depth)', async () => {
    load()
    const fields = scanFields(document, { isVisible: visible })
    const idx = fields.find((f) => f.id === 'captcha')!.index
    const [r] = await fillFields([{ index: idx, value: 'ABCD' }], { overwrite: true, shouldStop: () => false, isVisible: visible })
    expect(r!.status).toBe('skipped')
    expect(byId('captcha').value).toBe('')
    const pw = fields.find((f) => f.id === 'pw')!.index
    expect((await fillFields([{ index: pw, value: 'hunter2' }], { overwrite: true, shouldStop: () => false, isVisible: visible }))[0]!.status).toBe('skipped')
  })

  it('does not overwrite existing values unless allowed', async () => {
    load()
    byId('surname').value = 'Existing'
    const fields = scanFields(document, { isVisible: visible })
    const idx = fields.find((f) => f.id === 'surname')!.index
    expect((await fillFields([{ index: idx, value: 'Rao' }], { overwrite: false, shouldStop: () => false, isVisible: visible }))[0]!.status).toBe('skipped')
    expect(byId('surname').value).toBe('Existing')
    expect((await fillFields([{ index: idx, value: 'Rao' }], { overwrite: true, shouldStop: () => false, isVisible: visible }))[0]!.status).toBe('filled')
    expect(byId('surname').value).toBe('Rao')
  })

  it('fills a <select> only when an option matches', async () => {
    load()
    const fields = scanFields(document, { isVisible: visible })
    const idx = fields.find((f) => f.id === 'purpose')!.index
    expect((await fillFields([{ index: idx, value: 'Tourism' }], { overwrite: false, shouldStop: () => false, isVisible: visible }))[0]!.status).toBe('filled')
    expect((document.getElementById('purpose') as HTMLSelectElement).value).toBe('Tourism')
    expect((await fillFields([{ index: idx, value: 'Pilgrimage' }], { overwrite: true, shouldStop: () => false, isVisible: visible }))[0]).toMatchObject({ status: 'failed' })
  })

  it('stops immediately when asked and reports the rest as skipped', async () => {
    load()
    const fields = scanFields(document, { isVisible: visible })
    const a = [fields.find((f) => f.id === 'given')!.index, fields.find((f) => f.id === 'surname')!.index].map((index) => ({ index, value: 'X' }))
    let calls = 0
    const results = await fillFields(a, { overwrite: false, shouldStop: () => ++calls > 1, isVisible: visible })
    expect(results.map((r) => r.status)).toEqual(['filled', 'skipped'])
    expect(results[1]!.reason).toMatch(/Stopped/)
    expect(byId('surname').value).toBe('')
  })

  it('reports a failure when the page changed after the scan, and respects maxlength', async () => {
    load()
    const fields = scanFields(document, { isVisible: visible })
    const idx = fields.find((f) => f.id === 'given')!.index
    byId('given').setAttribute('maxlength', '3')
    expect((await fillFields([{ index: idx, value: 'Asha' }], { overwrite: false, shouldStop: () => false, isVisible: visible }))[0]!.reason).toMatch(/3 characters/)
    byId('given').remove()
    expect((await fillFields([{ index: idx, value: 'Asha' }], { overwrite: false, shouldStop: () => false, isVisible: visible }))[0]).toMatchObject({ status: 'failed' })
  })

  it('never clicks or submits anything', async () => {
    load()
    let submitted = false
    document.querySelector('form')!.addEventListener('submit', () => (submitted = true))
    const fields = scanFields(document, { isVisible: visible })
    const { proposals } = buildProposals(fields, payload())
    await fillFields(proposals.map((p) => ({ index: p.index, value: p.value })), { overwrite: true, shouldStop: () => false, isVisible: visible })
    expect(submitted).toBe(false)
  })
})

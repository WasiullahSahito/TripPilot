import { parsePayload } from '../../../extension/src/core/payload'
import { buildAssistantExport, EXPORT_VALID_MINUTES } from './assistant-export'

const NOW = new Date('2026-12-01T10:00:00Z')
const data = {
  applicant: { givenNames: 'Asha', surname: 'Rao', dateOfBirth: '1990-04-02', email: 'asha@example.com', phone: '' },
  passport: { number: 'Z1234567', expiryDate: '2031-05-06' },
  travel: { purpose: 'Tourism' },
}

describe('buildAssistantExport', () => {
  it('flattens the saved application and omits empty values', () => {
    const x = buildAssistantExport({ data }, 'France', NOW)
    expect(x.fields['applicant.surname']).toBe('Rao')
    expect(x.fields['passport.number']).toBe('Z1234567')
    expect(x.fields['applicant.phone']).toBeUndefined()
    expect(x.destination).toBe('France')
  })

  it('expires after the stated number of minutes', () => {
    const x = buildAssistantExport({ data }, 'France', NOW)
    expect(Date.parse(x.expiresAt) - NOW.getTime()).toBe(EXPORT_VALID_MINUTES * 60_000)
  })

  it('produces a file the extension accepts, and the extension rejects it once expired', () => {
    const json = JSON.stringify(buildAssistantExport({ data }, 'France', NOW))
    expect(parsePayload(json, NOW).ok).toBe(true)
    expect(parsePayload(json, new Date(NOW.getTime() + (EXPORT_VALID_MINUTES + 1) * 60_000)).ok).toBe(false)
  })

  it('never includes fields the extension does not know about', () => {
    const x = buildAssistantExport({ data: { applicant: { surname: 'Rao', secretNote: 'x' } } }, 'France', NOW)
    expect(Object.keys(x.fields)).toEqual(['applicant.surname'])
  })
})

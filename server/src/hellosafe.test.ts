import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { atlasSignature, hellosafeInsurance } from './integrations/hellosafe.ts'

const trip = { destination: 'TH', residence: 'PK', startDate: '2026-09-10', endDate: '2026-09-24', travellers: [{ bornOn: '1994-01-01' }] }

function fake(responses: unknown[]) {
  const calls: { url: string; init: RequestInit }[] = []
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return new Response(JSON.stringify(responses.shift()), { status: 200 })
  }) as unknown as typeof fetch
  return { f, calls }
}

describe('HelloSafe Atlas adapter', () => {
  it('signs ts.METHOD.path.body with HMAC-SHA256 and a v2= prefix', () => {
    const expected = 'v2=' + createHmac('sha256', 's').update('1700000000.POST./api/v1/travel/quotes.{"a":1}').digest('hex')
    expect(atlasSignature('s', '1700000000', 'POST', '/api/v1/travel/quotes', '{"a":1}')).toBe(expected)
  })

  it('maps quotes and sends the signed body exactly as signed', async () => {
    const { f, calls } = fake([{
      mode: 'sandbox', sessionId: 'sess1',
      offers: [{ id: 7, name: 'Plan', plan: 'Gold', insurer: { name: 'Acme' }, price: { amount: 12.5, amountInCents: 1250, currency: 'EUR' }, highlights: { included: ['Medical'] }, documents: { cgvUrl: 'https://x/t' } }],
    }])
    const out = await hellosafeInsurance('ak_test_1', 'secret', f).quotes(trip)
    expect(out.offers[0]).toMatchObject({ id: 7, insurer: 'Acme', amountMinor: 1250, currency: 'EUR', included: ['Medical'] })
    const { init } = calls[0]!
    const h = init.headers as Record<string, string>
    expect(h['x-atlas-signature']).toBe(atlasSignature('secret', h['x-atlas-timestamp']!, 'POST', '/api/v1/travel/quotes', init.body as string))
    expect(JSON.parse(init.body as string).trip).toMatchObject({ countryResidence: 'PK', arrivalCountries: ['TH'], travellers: [{ age: 32 }] })
  })

  it('only returns links on hellosafe.com over https', async () => {
    const ok = fake([{ url: 'https://www.hellosafe.com/go/abc' }])
    await expect(hellosafeInsurance('k', 's', ok.f).link(trip, 'sess1', 7)).resolves.toContain('hellosafe.com')
    const bad = fake([{ url: 'https://evil.example/hellosafe.com' }])
    await expect(hellosafeInsurance('k', 's', bad.f).link(trip, 'sess1', 7)).rejects.toThrow(/unexpected link/)
  })
})

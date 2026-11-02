import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, Input, Select } from '@/components/ui/field'
import { ApiError } from '@/lib/api'
import { commerceApi, formatMinor, GATEWAY_LABEL, type Capabilities, type GatewayName, type OfferDto, type TravellerInput } from './commerce-api'

const blank = (): TravellerInput => ({ title: 'mr', gender: 'm', givenName: '', familyName: '', bornOn: '' })

/** Contact + traveller details for one offer, then hand-off to the hosted payment page. */
export function CheckoutPanel({ offer, onCancel }: { offer: OfferDto; onCancel: () => void }) {
  const [contact, setContact] = useState({ email: '', phone: '' })
  const [travellers, setTravellers] = useState<TravellerInput[]>(() => Array.from({ length: offer.travellers }, blank))
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [caps, setCaps] = useState<Capabilities | null>(null)
  const [gateway, setGateway] = useState<GatewayName | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const isFlight = offer.kind === 'flight'

  useEffect(() => {
    let live = true
    commerceApi.capabilities().then((c) => {
      if (!live) return
      setCaps(c)
      setGateway(c.defaultGateway ?? undefined)
    }).catch(() => undefined)
    return () => {
      live = false
    }
  }, [])

  const set = (i: number, patch: Partial<TravellerInput>) => setTravellers((t) => t.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const setPassport = (i: number, patch: Partial<NonNullable<TravellerInput['passport']>>) =>
    set(i, { passport: { number: '', issuingCountry: '', expiresOn: '', ...travellers[i]!.passport, ...patch } })

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const clean = travellers.map((t) => {
        const p = t.passport
        return { ...t, passport: p && p.number ? { ...p, issuingCountry: p.issuingCountry.toUpperCase() } : undefined }
      })
      const { url } = await commerceApi.checkout(offer, { email: contact.email.trim(), phone: contact.phone.replace(/[\s()-]/g, '') }, clean, gateway)
      window.location.assign(url)
    } catch (err) {
      const fields = err instanceof ApiError && err.fields ? Object.values(err.fields).join(' · ') : ''
      setError(err instanceof Error ? `${err.message}${fields ? `: ${fields}` : ''}` : 'Could not start checkout')
      setBusy(false)
    }
  }

  return (
    <Card className="space-y-5 border-accent-200 p-5">
      <form onSubmit={submit} aria-label="Checkout" className="space-y-5">
        <div>
          <h3 className="font-semibold">{offer.title}</h3>
          <p className="text-sm text-ink-soft">{offer.startDate}{offer.endDate ? ` → ${offer.endDate}` : ''}</p>
        </div>

        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-medium">Contact (the provider sends the confirmation here)</legend>
          <Field label="Email" htmlFor="c-email"><Input id="c-email" type="email" autoComplete="email" required value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} /></Field>
          <Field label="Phone (international format)" htmlFor="c-phone"><Input id="c-phone" type="tel" autoComplete="tel" placeholder="+33123456789" required value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} /></Field>
        </fieldset>

        {travellers.map((t, i) => (
          <fieldset key={i} className="grid gap-4 sm:grid-cols-3">
            <legend className="mb-2 text-sm font-medium">
              {offer.kind === 'hotel' ? 'Lead guest' : `Traveller ${i + 1}`}{isFlight ? ' (exactly as on the passport)' : ''}
            </legend>
            <Field label="Title" htmlFor={`t${i}-title`}>
              <Select id={`t${i}-title`} value={t.title} onChange={(e) => set(i, { title: e.target.value as TravellerInput['title'] })}>
                <option value="mr">Mr</option><option value="ms">Ms</option><option value="mrs">Mrs</option><option value="miss">Miss</option><option value="mx">Mx</option>
              </Select>
            </Field>
            <Field label="Given name(s)" htmlFor={`t${i}-given`}><Input id={`t${i}-given`} required value={t.givenName} onChange={(e) => set(i, { givenName: e.target.value })} /></Field>
            <Field label="Family name" htmlFor={`t${i}-family`}><Input id={`t${i}-family`} required value={t.familyName} onChange={(e) => set(i, { familyName: e.target.value })} /></Field>
            <Field label="Gender on passport" htmlFor={`t${i}-gender`}>
              <Select id={`t${i}-gender`} value={t.gender} onChange={(e) => set(i, { gender: e.target.value as 'm' | 'f' })}><option value="m">Male</option><option value="f">Female</option></Select>
            </Field>
            <Field label="Date of birth" htmlFor={`t${i}-dob`}><Input id={`t${i}-dob`} type="date" required value={t.bornOn} onChange={(e) => set(i, { bornOn: e.target.value })} /></Field>
            {isFlight && (
              <>
                <Field label="Passport number (if the airline requires it)" htmlFor={`t${i}-pn`}><Input id={`t${i}-pn`} autoComplete="off" value={t.passport?.number ?? ''} onChange={(e) => setPassport(i, { number: e.target.value })} /></Field>
                <Field label="Issuing country (2 letters)" htmlFor={`t${i}-pc`}><Input id={`t${i}-pc`} maxLength={2} placeholder="IN" value={t.passport?.issuingCountry ?? ''} onChange={(e) => setPassport(i, { issuingCountry: e.target.value })} /></Field>
                <Field label="Passport expiry" htmlFor={`t${i}-pe`}><Input id={`t${i}-pe`} type="date" value={t.passport?.expiresOn ?? ''} onChange={(e) => setPassport(i, { expiresOn: e.target.value })} /></Field>
              </>
            )}
          </fieldset>
        ))}

        <div className="rounded-xl bg-muted p-4 text-sm">
          <p className="flex justify-between"><span>Provider price</span><span>{formatMinor(offer.totalMinor - offer.feeMinor, offer.currency)}</span></p>
          {offer.feeMinor > 0 && <p className="flex justify-between"><span>TripPilot service fee</span><span>{formatMinor(offer.feeMinor, offer.currency)}</span></p>}
          <p className="mt-1 flex justify-between border-t border-line pt-2 font-semibold"><span>You pay</span><span>{formatMinor(offer.totalMinor, offer.currency)}</span></p>
          <p className="mt-2 text-xs text-ink-soft">
            You pay on {gateway === 'safepay' ? 'Safepay' : 'Stripe'}’s secure page; card details never reach TripPilot. If the provider cannot complete the booking, you are refunded automatically.
            The booking reference is shown only once the provider has issued it.
          </p>
        </div>

        {caps && caps.gateways.length > 1 && (
          <Field label="Pay with" htmlFor="c-gateway">
            <Select id="c-gateway" value={gateway} onChange={(e) => setGateway(e.target.value as GatewayName)}>
              {caps.gateways.map((g) => <option key={g} value={g}>{GATEWAY_LABEL[g]}</option>)}
            </Select>
          </Field>
        )}

        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          <span>The details above are correct. Changes after booking may be impossible or carry a fee, and I accept the provider’s conditions.</span>
        </label>

        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex gap-3">
          <Button type="submit" variant="accent" disabled={!agreed || busy}>{busy ? 'Opening payment…' : `Pay ${formatMinor(offer.totalMinor, offer.currency)}`}</Button>
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>Back</Button>
        </div>
      </form>
    </Card>
  )
}

import { HttpError } from '../middleware/security.ts'

/**
 * Server-side provider boundary for LIVE flight/hotel data and booking.
 * Credentials must stay on the server. Unconfigured search endpoints answer 501;
 * the client must not replace missing provider data with fabricated offers.
 *
 * To integrate a provider (e.g. an authorized flight/hotel API): implement these
 * interfaces, read credentials from env, and register the instance in `providers`.
 * Implementations must return provider-issued references only — never generate them.
 */
export interface LiveProvider<Q, R> {
  name: string
  search(query: Q): Promise<R>
}

export const providers: { flights?: LiveProvider<unknown, unknown>; hotels?: LiveProvider<unknown, unknown> } = {}

export function requireProvider(kind: 'flights' | 'hotels') {
  const p = providers[kind]
  if (!p) throw new HttpError(501, `No live ${kind} provider is configured.`)
  return p
}

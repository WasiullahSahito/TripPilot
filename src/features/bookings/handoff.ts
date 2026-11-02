/**
 * "I'm going to book this on a partner's site": a note, kept only for this browser tab, so that when the user comes
 * back TripPilot can offer to record the booking. It holds no personal data and creates NOTHING by itself: the user
 * still enters the confirmation reference the partner gave them, which is the only way a booking becomes confirmed.
 */
export interface Handoff {
  kind: 'flight' | 'hotel' | 'insurance'
  title: string
  startDate: string
  endDate: string | null
  partner: string
  at: number
}

const KEY = 'tp.booking-handoff'
const MAX_AGE_MS = 24 * 60 * 60 * 1000

export function saveHandoff(h: Omit<Handoff, 'at'>, now = Date.now()) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...h, at: now } satisfies Handoff))
  } catch {
    /* storage unavailable: the feature simply does nothing */
  }
}

export function loadHandoff(now = Date.now()): Handoff | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const h = JSON.parse(raw) as Partial<Handoff>
    const ok =
      (h.kind === 'flight' || h.kind === 'hotel' || h.kind === 'insurance') &&
      typeof h.title === 'string' && typeof h.partner === 'string' && typeof h.at === 'number' &&
      typeof h.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(h.startDate) &&
      (h.endDate === null || (typeof h.endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(h.endDate)))
    if (!ok || now - (h.at as number) > MAX_AGE_MS) {
      clearHandoff()
      return null
    }
    return h as Handoff
  } catch {
    return null
  }
}

export function clearHandoff() {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

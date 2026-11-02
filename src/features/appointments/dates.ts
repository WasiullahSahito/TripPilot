const pad = (n: number) => String(n).padStart(2, '0')

export function toISODate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Parse YYYY-MM-DD as a local date (no UTC shift). */
export function parseISODate(s: string) {
  return new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))
}

export function addDays(s: string, n: number) {
  const d = parseISODate(s)
  d.setDate(d.getDate() + n)
  return toISODate(d)
}

export function addMonths(s: string, n: number) {
  const d = parseISODate(s)
  d.setDate(1)
  d.setMonth(d.getMonth() + n)
  return toISODate(d)
}

/** Monday of the week containing the date. */
export function startOfWeek(s: string) {
  const d = parseISODate(s)
  const dow = (d.getDay() + 6) % 7
  return addDays(s, -dow)
}

export function weekDays(s: string) {
  const start = startOfWeek(s)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

export interface GridDay {
  date: string
  inMonth: boolean
}

/** Six Monday-first weeks covering the month containing `s`. */
export function monthGrid(s: string): GridDay[][] {
  const first = `${s.slice(0, 7)}-01`
  const month = first.slice(0, 7)
  const start = startOfWeek(first)
  return Array.from({ length: 6 }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = addDays(start, w * 7 + d)
      return { date, inMonth: date.startsWith(month) }
    }),
  )
}

export const dateOf = (startsAt: string) => startsAt.slice(0, 10)
export const timeOf = (startsAt: string) => startsAt.slice(11, 16)

export function monthLabel(s: string) {
  return parseISODate(s).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export function dayLabel(s: string) {
  return parseISODate(s).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

/**
 * Parser for the machine-readable zone of TD3 passports (ICAO 9303: two lines of 44 characters).
 * Pure functions: the OCR itself runs in the browser (see ocr.ts), and nothing here touches the network.
 */

export interface ParsedPassport {
  surname: string
  givenNames: string
  passportNumber: string
  issuingCountry: string // ICAO 3-letter code, e.g. "IND"
  nationality: string // ICAO 3-letter code
  dateOfBirth: string | null // YYYY-MM-DD
  expiryDate: string | null
  sex: 'M' | 'F' | 'X' | null
  checks: { passportNumber: boolean; dateOfBirth: boolean; expiryDate: boolean; composite: boolean }
  /** True only when every check digit verifies. If false, every field must be confirmed by the user. */
  allChecksPass: boolean
}

const WEIGHTS = [7, 3, 1]

function charValue(c: string): number {
  if (c === '<') return 0
  if (c >= '0' && c <= '9') return c.charCodeAt(0) - 48
  if (c >= 'A' && c <= 'Z') return c.charCodeAt(0) - 55
  return -1
}

export function checkDigit(field: string): number {
  let sum = 0
  for (let i = 0; i < field.length; i++) {
    const v = charValue(field[i]!)
    if (v < 0) return -1
    sum += v * WEIGHTS[i % 3]!
  }
  return sum % 10
}

const verifies = (field: string, digit: string) => /^\d$/.test(digit) && checkDigit(field) === Number(digit)

// OCR confuses look-alike glyphs; fix them according to what a position may legally contain.
const TO_DIGIT: Record<string, string> = { O: '0', Q: '0', D: '0', I: '1', L: '1', Z: '2', S: '5', B: '8', G: '6' }
const TO_LETTER: Record<string, string> = { '0': 'O', '1': 'I', '2': 'Z', '5': 'S', '8': 'B', '6': 'G' }
const asDigits = (s: string) => [...s].map((c) => TO_DIGIT[c] ?? c).join('')
const asLetters = (s: string) => [...s].map((c) => TO_LETTER[c] ?? c).join('')

/** Reduce raw OCR output to candidate MRZ lines. */
export function candidateLines(raw: string): string[] {
  return raw
    .toUpperCase()
    .split(/\r?\n/)
    .map((l) => l.replace(/[«]/g, '<').replace(/[^A-Z0-9<]/g, ''))
    .filter((l) => l.length >= 30)
}

function toIsoDate(yymmdd: string, kind: 'birth' | 'expiry', now: Date): string | null {
  if (!/^\d{6}$/.test(yymmdd)) return null
  const yy = Number(yymmdd.slice(0, 2))
  const mm = Number(yymmdd.slice(2, 4))
  const dd = Number(yymmdd.slice(4, 6))
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null
  let year = 2000 + yy
  // A birth date cannot be in the future; an expiry date is assumed to be in this century.
  if (kind === 'birth' && year > now.getFullYear()) year -= 100
  const iso = `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
  const d = new Date(`${iso}T00:00:00Z`)
  return d.getUTCMonth() + 1 === mm && d.getUTCDate() === dd ? iso : null
}

function parsePair(l1: string, l2: string, now: Date): ParsedPassport | null {
  l1 = l1.padEnd(44, '<').slice(0, 44)
  l2 = l2.padEnd(44, '<').slice(0, 44)
  if (l1[0] !== 'P') return null

  const number = l2.slice(0, 9)
  const numberCheck = asDigits(l2[9]!)
  const nationality = asLetters(l2.slice(10, 13))
  const dob = asDigits(l2.slice(13, 19))
  const dobCheck = asDigits(l2[19]!)
  const sex = l2[20]!
  const expiry = asDigits(l2.slice(21, 27))
  const expiryCheck = asDigits(l2[27]!)
  const personal = l2.slice(28, 42)
  const personalCheck = asDigits(l2[42]!)
  const compositeCheck = asDigits(l2[43]!)

  const compositeField = number + numberCheck + dob + dobCheck + expiry + expiryCheck + personal + personalCheck
  const checks = {
    passportNumber: verifies(number, numberCheck),
    dateOfBirth: verifies(dob, dobCheck),
    expiryDate: verifies(expiry, expiryCheck),
    composite: verifies(compositeField, compositeCheck),
  }

  const names = l1.slice(5).split('<<')
  const clean = (s: string) => asLetters(s).replace(/</g, ' ').replace(/\s+/g, ' ').trim()

  return {
    surname: clean(names[0] ?? ''),
    givenNames: clean(names.slice(1).join(' ')),
    passportNumber: number.replace(/</g, ''),
    issuingCountry: asLetters(l1.slice(2, 5)).replace(/</g, ''),
    nationality: nationality.replace(/</g, ''),
    dateOfBirth: toIsoDate(dob, 'birth', now),
    expiryDate: toIsoDate(expiry, 'expiry', now),
    sex: sex === 'M' || sex === 'F' ? sex : sex === '<' || sex === 'X' ? 'X' : null,
    checks,
    allChecksPass: Object.values(checks).every(Boolean),
  }
}

/** Find the best MRZ in raw OCR text. Prefers a candidate whose check digits all verify. */
export function parseMrz(raw: string, now = new Date()): ParsedPassport | null {
  const lines = candidateLines(raw)
  let best: ParsedPassport | null = null
  let bestScore = -1
  for (let i = 0; i < lines.length - 1; i++) {
    const p = parsePair(lines[i]!, lines[i + 1]!, now)
    if (!p) continue
    const score = Object.values(p.checks).filter(Boolean).length
    if (score > bestScore) {
      best = p
      bestScore = score
    }
  }
  return best
}

/** True when text looks like it contains an MRZ; used to stop passport data being sent to third parties. */
export function looksLikeMrz(text: string): boolean {
  return candidateLines(text).some((l) => (l.match(/</g)?.length ?? 0) >= 5 && l.length >= 36)
}

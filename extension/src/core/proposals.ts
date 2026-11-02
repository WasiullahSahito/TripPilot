import type { ScannedField } from './dom'
import { matchField, valueFor, type Confidence } from './matcher'
import { FIELD_LABELS, type AssistantPayload, type FieldKey } from './payload'
import { exclusionReason, type Exclusion } from './safety'

export interface Proposal {
  index: number
  pageLabel: string
  key: FieldKey
  keyLabel: string
  confidence: Confidence
  reason: string
  value: string
  /** Shown to the user when the value's format had to be guessed. */
  warning?: string
  selected: boolean
}

export interface ProposalResult {
  proposals: Proposal[]
  /** Fields the assistant refuses to touch, by reason (shown so users know nothing was hidden from them). */
  excluded: Record<string, number>
  unmatched: number
  /** Fields we may fill but could not match to your data: candidates for "pin this field". */
  teachable: ScannedField[]
}

/**
 * Turns a page scan into a reviewable list of suggested entries. Only high-confidence, format-verified suggestions
 * start ticked; the user decides everything else.
 */
export function buildProposals(fields: ScannedField[], payload: AssistantPayload): ProposalResult {
  const proposals: Proposal[] = []
  const excluded: Record<string, number> = {}
  let unmatched = 0
  const teachable: ScannedField[] = []
  const used = new Set<FieldKey>()

  for (const f of fields) {
    const why: Exclusion | null = exclusionReason(f)
    if (why) {
      // Don't count the many invisible/disabled helper inputs on a page as noise: report only the meaningful refusals.
      if (why === 'sensitive' || why === 'blocked-type') excluded[why] = (excluded[why] ?? 0) + 1
      continue
    }
    const hinted = f.hintKey ? { key: f.hintKey, confidence: 'high' as const, reason: 'site adapter' } : null
    const m = hinted ?? matchField(f)
    const raw = m ? payload.fields[m.key] : undefined
    if (!m || raw === undefined) {
      unmatched++
      if (f.selector && f.tag !== 'select') teachable.push(f)
      continue
    }
    const v = valueFor(m.key, raw, f)
    const duplicate = used.has(m.key)
    used.add(m.key)
    proposals.push({
      index: f.index,
      pageLabel: f.label || f.name || f.id || f.placeholder || `(unlabelled ${f.tag})`,
      key: m.key,
      keyLabel: FIELD_LABELS[m.key],
      confidence: m.confidence,
      reason: m.reason,
      value: v.value,
      ...(!v.verified ? { warning: 'Date layout is a guess: check it matches what the site expects.' } : duplicate ? { warning: 'Another field already uses this value.' } : {}),
      selected: m.confidence === 'high' && v.verified && !duplicate,
    })
  }
  return { proposals, excluded, unmatched, teachable }
}

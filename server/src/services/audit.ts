import { randomUUID } from 'node:crypto'
import type { Store } from '../models/store.ts'

export interface AuditInput {
  actorId: string | null
  action: string
  targetId?: string | null
  /** Small flags and counts only. Never put names, emails, document names or any personal data here. */
  meta?: Record<string, string | number | boolean>
}

/** Records who did what. A failure to write the log must never break the request it describes. */
export async function audit(store: Pick<Store, 'addAudit'>, input: AuditInput): Promise<void> {
  try {
    await store.addAudit({
      id: randomUUID(),
      at: new Date().toISOString(),
      actorId: input.actorId,
      action: input.action,
      targetId: input.targetId ?? null,
      meta: input.meta ?? {},
    })
  } catch (e) {
    console.error('Audit write failed:', e instanceof Error ? e.name : 'unknown')
  }
}

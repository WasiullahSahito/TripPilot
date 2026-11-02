/** Move `moving` next to `target` (before or after it). Returns a new array; the input is not changed. */
export function reorder(order: string[], moving: string, target: string, where: 'before' | 'after'): string[] {
  if (moving === target) return order
  const from = order.indexOf(moving)
  if (from < 0 || !order.includes(target)) return order
  const without = order.filter((id) => id !== moving)
  const at = without.indexOf(target) + (where === 'after' ? 1 : 0)
  return [...without.slice(0, at), moving, ...without.slice(at)]
}

/** Move one step up (-1) or down (1), staying in bounds. */
export function step(order: string[], id: string, dir: -1 | 1): string[] {
  const i = order.indexOf(id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= order.length) return order
  const next = [...order]
  ;[next[i], next[j]] = [next[j]!, next[i]!]
  return next
}

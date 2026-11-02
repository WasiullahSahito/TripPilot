import { reorder, step } from './reorder'

describe('reorder (drag and drop)', () => {
  const order = ['a', 'b', 'c', 'd']
  it('moves an item before or after another, forward and backward', () => {
    expect(reorder(order, 'a', 'c', 'before')).toEqual(['b', 'a', 'c', 'd'])
    expect(reorder(order, 'a', 'c', 'after')).toEqual(['b', 'c', 'a', 'd'])
    expect(reorder(order, 'd', 'a', 'before')).toEqual(['d', 'a', 'b', 'c'])
    expect(reorder(order, 'd', 'b', 'after')).toEqual(['a', 'b', 'd', 'c'])
    expect(reorder(order, 'a', 'd', 'after')).toEqual(['b', 'c', 'd', 'a'])
  })
  it('keeps every item exactly once', () => {
    for (const m of order) for (const t of order) for (const w of ['before', 'after'] as const) {
      expect([...reorder(order, m, t, w)].sort()).toEqual([...order].sort())
    }
  })
  it('ignores a drop on itself, and unknown ids, without changing anything', () => {
    expect(reorder(order, 'b', 'b', 'before')).toBe(order)
    expect(reorder(order, 'zzz', 'a', 'before')).toBe(order)
    expect(reorder(order, 'a', 'zzz', 'after')).toBe(order)
  })
  it('does not mutate its input', () => {
    const copy = [...order]
    reorder(order, 'a', 'd', 'after')
    expect(order).toEqual(copy)
  })
})

describe('step (keyboard buttons)', () => {
  it('moves one place and stays within bounds', () => {
    expect(step(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c'])
    expect(step(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b'])
    const same = ['a', 'b', 'c']
    expect(step(same, 'a', -1)).toBe(same)
    expect(step(same, 'c', 1)).toBe(same)
    expect(step(same, 'x', 1)).toBe(same)
  })
})

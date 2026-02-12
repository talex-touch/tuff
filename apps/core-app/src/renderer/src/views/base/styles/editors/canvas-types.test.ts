import { describe, expect, it } from 'vitest'
import { moveItem, normalizeCanvasConfig } from './canvas-types'

describe('canvas-types', () => {
  it('clamps item movement into grid bounds', () => {
    const items = [{ id: 'view', area: 'view', x: 0, y: 0, w: 4, h: 4 }]

    const result = moveItem(items, 'view', { x: 20, y: -2 }, 12)
    expect(result.valid).toBe(true)
    expect(result.items[0]?.x).toBe(8)
    expect(result.items[0]?.y).toBe(0)
  })

  it('returns invalid on collision and keeps original items', () => {
    const items = [
      { id: 'header', area: 'header', x: 0, y: 0, w: 12, h: 2 },
      { id: 'view', area: 'view', x: 0, y: 2, w: 12, h: 8 }
    ]

    const result = moveItem(items, 'view', { y: 1 }, 12)
    expect(result.valid).toBe(false)
    expect(result.items).toEqual(items)
  })

  it('normalizes canvas column/row/gap ranges', () => {
    const config = normalizeCanvasConfig({
      enabled: true,
      preset: 'custom',
      columns: 999,
      rowHeight: 2,
      gap: -10,
      items: [{ id: 'view', area: 'view', x: 0, y: 0, w: 40, h: 0 }]
    })

    expect(config.columns).toBe(24)
    expect(config.rowHeight).toBe(12)
    expect(config.gap).toBe(0)
    expect(config.items[0]?.w).toBe(24)
    expect(config.items[0]?.h).toBe(1)
  })
})

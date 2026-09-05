import type { TuffSection } from '@talex-touch/utils'
import { describe, expect, it } from 'vitest'
import {
  CORE_BOX_INTELLIGENCE_GRID_COLUMN_LIMIT,
  resolveBoxGridColumnCount
} from './box-grid-layout'

/**
 * This count is not only a CSS value: `useKeyboard.buildSectionRanges` derives its section
 * geometry from it, so an N returned here means ArrowDown moves N items at once.
 */

const section = (overrides: Partial<TuffSection> = {}): TuffSection =>
  ({
    id: 'section',
    layout: 'grid',
    itemIds: [],
    ...overrides
  }) as TuffSection

describe('resolveBoxGridColumnCount', () => {
  it('gives a list section one column so the arrows step item by item', () => {
    // Reported as the grid width, a five-item list made ArrowDown jump five rows — past the end,
    // which reads as "the arrow keys do nothing".
    expect(resolveBoxGridColumnCount(section({ layout: 'list' }), 5, 6)).toBe(1)
    expect(resolveBoxGridColumnCount(section({ layout: 'list' }), 1, 6)).toBe(1)
  })

  it('keeps a list section at one column even when it is flagged as intelligence', () => {
    expect(
      resolveBoxGridColumnCount(section({ layout: 'list', meta: { intelligence: true } }), 8, 6)
    ).toBe(1)
  })

  it('uses the container width for an ordinary grid section', () => {
    expect(resolveBoxGridColumnCount(section(), 12, 6)).toBe(6)
    expect(resolveBoxGridColumnCount(undefined, 12, 6)).toBe(6)
  })

  it('caps an intelligence grid at its own limit and never exceeds the item count', () => {
    expect(resolveBoxGridColumnCount(section({ meta: { intelligence: true } }), 12, 8)).toBe(
      CORE_BOX_INTELLIGENCE_GRID_COLUMN_LIMIT
    )
    expect(resolveBoxGridColumnCount(section({ meta: { intelligence: true } }), 3, 8)).toBe(3)
  })

  it('never returns less than one column', () => {
    // A zero would make the keyboard geometry divide by zero and the CSS collapse.
    expect(resolveBoxGridColumnCount(section(), 4, 0)).toBe(1)
    expect(resolveBoxGridColumnCount(section(), 4, -3)).toBe(1)
    expect(resolveBoxGridColumnCount(section({ meta: { intelligence: true } }), 0, 6)).toBe(1)
  })
})

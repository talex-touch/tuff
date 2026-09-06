import type { TuffSection } from '@talex-touch/utils'
import { describe, expect, it } from 'vitest'
import {
  CORE_BOX_INTELLIGENCE_GRID_COLUMN_LIMIT,
  resolveBoxGridColumnCount,
  resolveBoxGridFitColumns,
  resolveVisibleBoxGridColumnCount
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

describe('resolveBoxGridFitColumns', () => {
  it('keeps the declared columns while the row is wide enough', () => {
    // Six 84px tiles with 12px gaps need exactly 564px.
    expect(resolveBoxGridFitColumns(564, 12, 84, 6)).toBe(6)
    expect(resolveBoxGridFitColumns(900, 12, 84, 6)).toBe(6)
  })

  it('drops columns so tiles keep their minimum width instead of squeezing', () => {
    // The 40% column the preview pane leaves: 540px of content fits five 84px tiles, not six.
    // Squeezed to six, a title read as two letters and the badges overlapped their neighbours.
    expect(resolveBoxGridFitColumns(540, 12, 84, 6)).toBe(5)
    expect(resolveBoxGridFitColumns(200, 12, 84, 6)).toBe(2)
  })

  it('never returns less than one column', () => {
    expect(resolveBoxGridFitColumns(30, 12, 84, 6)).toBe(1)
    expect(resolveBoxGridFitColumns(300, 12, 84, 0)).toBe(1)
  })

  it('treats an unmeasured width as wide enough', () => {
    // Before the first layout (and in jsdom) the container measures 0; the grid must not collapse
    // to a single column while it waits.
    expect(resolveBoxGridFitColumns(0, 12, 84, 6)).toBe(6)
    expect(resolveBoxGridFitColumns(Number.NaN, 12, 84, 6)).toBe(6)
  })
})

describe('resolveVisibleBoxGridColumnCount', () => {
  it('caps an ordinary grid at what fits', () => {
    expect(resolveVisibleBoxGridColumnCount(section(), 12, 4)).toBe(4)
    expect(resolveVisibleBoxGridColumnCount(undefined, 12, 6)).toBe(6)
  })

  it('caps the intelligence tray at what fits as well', () => {
    // Its own five-column limit still holds when the row is wide; a narrow row wins otherwise.
    expect(resolveVisibleBoxGridColumnCount(section({ meta: { intelligence: true } }), 12, 8)).toBe(
      CORE_BOX_INTELLIGENCE_GRID_COLUMN_LIMIT
    )
    expect(resolveVisibleBoxGridColumnCount(section({ meta: { intelligence: true } }), 12, 3)).toBe(
      3
    )
  })

  it('keeps a list at one column', () => {
    expect(resolveVisibleBoxGridColumnCount(section({ layout: 'list' }), 5, 4)).toBe(1)
  })

  it('never returns less than one column', () => {
    expect(resolveVisibleBoxGridColumnCount(section(), 4, 0)).toBe(1)
  })
})

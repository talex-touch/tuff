import { describe, expect, it } from 'vitest'
import { resolveDivisionBoxHeaderHeight, resolveDivisionBoxInitialWindowBounds } from './layout'

describe('resolveDivisionBoxHeaderHeight', () => {
  it('keeps the default header height unless header is explicitly hidden', () => {
    expect(resolveDivisionBoxHeaderHeight({})).toBe(64)
    expect(resolveDivisionBoxHeaderHeight({ header: { show: true } })).toBe(64)
    expect(resolveDivisionBoxHeaderHeight({ header: { show: false } })).toBe(0)
  })
})

describe('resolveDivisionBoxInitialWindowBounds', () => {
  it('adds DivisionBox header height back to preserved detached content bounds', () => {
    expect(
      resolveDivisionBoxInitialWindowBounds(
        {
          initialBounds: {
            width: 720,
            height: 544
          }
        },
        { x: 20, y: 40, width: 720, height: 500 }
      )
    ).toEqual({ x: 20, y: 40, width: 720, height: 608 })
  })

  it('keeps explicit screen coordinates and honors hidden header sessions', () => {
    expect(
      resolveDivisionBoxInitialWindowBounds(
        {
          header: { show: false },
          initialBounds: {
            x: -320,
            y: 0,
            width: 680,
            height: 420
          }
        },
        { x: 20, y: 40, width: 720, height: 500 }
      )
    ).toEqual({ x: -320, y: 0, width: 680, height: 420 })
  })

  it('falls back to current bounds for invalid hints', () => {
    expect(
      resolveDivisionBoxInitialWindowBounds(
        {
          initialBounds: {
            width: 0,
            height: Number.NaN
          }
        },
        { x: 20, y: 40, width: 720, height: 500 }
      )
    ).toEqual({ x: 20, y: 40, width: 720, height: 500 })
  })
})

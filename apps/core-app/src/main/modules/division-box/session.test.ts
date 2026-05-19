import { describe, expect, it } from 'vitest'
import { resolveDivisionBoxHeaderHeight } from './layout'

describe('resolveDivisionBoxHeaderHeight', () => {
  it('keeps the default header height unless header is explicitly hidden', () => {
    expect(resolveDivisionBoxHeaderHeight({})).toBe(64)
    expect(resolveDivisionBoxHeaderHeight({ header: { show: true } })).toBe(64)
    expect(resolveDivisionBoxHeaderHeight({ header: { show: false } })).toBe(0)
  })
})

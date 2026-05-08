import { describe, expect, it } from 'vitest'
import * as components from '../../index'

describe('scroll export boundary', () => {
  it('exports TxScroll without the retired TouchScroll alias', () => {
    expect(components.TxScroll).toBeTruthy()
    expect('TouchScroll' in components).toBe(false)
  })
})

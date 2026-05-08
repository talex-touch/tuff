import { describe, expect, it, vi } from 'vitest'
import {
  createVibratePattern,
  hasDocument,
  hasNavigator,
  hasWindow,
  nextZIndex,
  resetZIndex,
  withInstall,
} from '../index'

describe('components utils re-export', () => {
  it('re-exports environment helpers', () => {
    expect(hasWindow()).toBe(true)
    expect(hasDocument()).toBe(true)
    expect(hasNavigator()).toBe(true)
  })

  it('re-exports z-index utilities', () => {
    resetZIndex(2000, 'components-utils-test')
    expect(nextZIndex()).toBe(2001)
  })

  it('re-exports component install and vibration helpers', () => {
    const component = { name: 'TxReExportProbe' }
    const installed = withInstall(component)
    const app = { component: vi.fn() }

    installed.install?.(app as any)

    expect(app.component).toHaveBeenCalledWith('TxReExportProbe', component)
    expect(createVibratePattern([1, 2], 'probe')).toEqual({
      pattern: [1, 2],
      description: 'probe',
    })
  })
})

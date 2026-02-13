import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  configureZIndex,
  getZIndex,
  nextZIndex,
  onZIndexEvent,
  refreshZIndex,
  resetZIndex,
} from '../z-index-manager'

describe('z-index-manager', () => {
  beforeEach(() => {
    configureZIndex({ overrides: undefined, seedSource: null, seed: 2000 })
    resetZIndex(2000, 'test')
  })

  it('increments monotonically by default', () => {
    const a = nextZIndex()
    const b = nextZIndex()
    expect(b).toBeGreaterThan(a)
  })

  it('supports overrides next/get', () => {
    configureZIndex({
      overrides: {
        next: ctx => ctx.current + 10,
        get: () => 123,
      },
    })

    resetZIndex(2000, 'test')
    expect(nextZIndex()).toBe(2010)
    expect(getZIndex()).toBe(123)
  })

  it('refresh does not decrease current', () => {
    resetZIndex(5000, 'test')
    refreshZIndex(1000, 'test')
    expect(getZIndex()).toBe(5000)
  })

  it('reset can decrease current', () => {
    resetZIndex(5000, 'test')
    resetZIndex(1000, 'test')
    expect(getZIndex()).toBe(1000)
  })

  it('seedSource subscribe triggers refresh', () => {
    let seed = 3000
    let subscribed: (() => void) | null = null
    const unsub = vi.fn()

    configureZIndex({
      seedSource: {
        getSeed: () => seed,
        subscribe: (listener) => {
          subscribed = listener
          return () => unsub()
        },
      },
    })

    resetZIndex(2000, 'test')
    refreshZIndex(undefined, 'manual')
    expect(getZIndex()).toBe(3000)

    seed = 4000
    subscribed?.()
    expect(getZIndex()).toBe(4000)

    configureZIndex({ seedSource: null })
    expect(unsub).toHaveBeenCalledTimes(1)
  })

  it('emits events', () => {
    const events: Array<TxEventType> = []
    const off = onZIndexEvent(e => events.push(e.type))

    nextZIndex()
    refreshZIndex(9000, 'test')
    resetZIndex(1000, 'test')

    off()
    expect(events).toEqual(expect.arrayContaining(['next', 'refresh', 'reset']))
  })
})

type TxEventType = 'next' | 'refresh' | 'reset' | 'configure'


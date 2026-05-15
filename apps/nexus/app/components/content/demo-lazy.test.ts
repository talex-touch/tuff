import { describe, expect, it } from 'vitest'
import { DEMO_LAZY_ACTIVATION_DELAY_MS, DEMO_LAZY_IDLE_TIMEOUT_MS, scheduleDemoActivation, shouldActivateDemo } from './demo-lazy'

describe('demo lazy activation', () => {
  it('keeps demos inactive until the wrapper enters the viewport', () => {
    expect(shouldActivateDemo(false, { isIntersecting: false, intersectionRatio: 0 })).toBe(false)
  })

  it('keeps an activated demo active after it leaves the viewport', () => {
    expect(shouldActivateDemo(true, { isIntersecting: false, intersectionRatio: 0 })).toBe(true)
  })

  it('activates demos when intersection observer reports visibility', () => {
    expect(shouldActivateDemo(false, { isIntersecting: true, intersectionRatio: 0 })).toBe(true)
    expect(shouldActivateDemo(false, { isIntersecting: false, intersectionRatio: 0.1 })).toBe(true)
  })

  it('uses browser idle time before activating demos when available', () => {
    let runIdleCallback: (() => void) | undefined
    let timeout: number | undefined

    const task = scheduleDemoActivation(() => {
      runIdleCallback = undefined
    }, {
      setTimeout,
      clearTimeout,
      requestIdleCallback: (callback, options) => {
        timeout = options?.timeout
        runIdleCallback = () => callback({ didTimeout: false, timeRemaining: () => 16 })
        return 7
      },
      cancelIdleCallback: () => {
        runIdleCallback = undefined
      },
    })

    expect(timeout).toBe(DEMO_LAZY_IDLE_TIMEOUT_MS)
    expect(runIdleCallback).toBeTypeOf('function')
    runIdleCallback?.()
    task.cancel()
  })

  it('falls back to the short activation delay without idle callback', () => {
    let delay = 0
    let didCancel = false

    const task = scheduleDemoActivation(() => {}, {
      setTimeout: ((_handler: TimerHandler, timeout?: number) => {
        delay = Number(timeout)
        return 1
      }) as typeof setTimeout,
      clearTimeout: (() => {
        didCancel = true
      }) as typeof clearTimeout,
    })

    expect(delay).toBe(DEMO_LAZY_ACTIVATION_DELAY_MS)
    task.cancel()
    expect(didCancel).toBe(true)
  })
})

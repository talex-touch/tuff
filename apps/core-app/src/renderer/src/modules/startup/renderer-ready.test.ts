import { AppEvents } from '@talex-touch/utils/transport/events'
import { describe, expect, it, vi } from 'vitest'
import { announceRendererReady, announceRendererReadyAfterRouter } from './renderer-ready'

/**
 * This announcement is what releases a destination route in main. Announcing too early delivers a
 * route into a page with no navigate listener, and failing to announce strands every queued
 * destination, so both the exact event and the failure policy are pinned here.
 */
describe('announceRendererReady', () => {
  it('sends the readiness event on the window channel', () => {
    const send = vi.fn(async () => undefined)

    announceRendererReady({ send })

    expect(send).toHaveBeenCalledExactlyOnceWith(AppEvents.window.rendererReady)
    expect(AppEvents.window.rendererReady.toEventName()).toBe('app:window:renderer-ready')
  })

  it('swallows a rejected or throwing send instead of failing the boot sequence', () => {
    const rejecting = vi.fn(async () => {
      throw new Error('channel closed')
    })
    const throwing = vi.fn(() => {
      throw new Error('transport not ready')
    })

    expect(() => announceRendererReady({ send: rejecting })).not.toThrow()
    expect(() => announceRendererReady({ send: throwing })).not.toThrow()
    expect(rejecting).toHaveBeenCalledTimes(1)
    expect(throwing).toHaveBeenCalledTimes(1)
  })
})

/**
 * Registering the navigate listener early is not enough: `app.use(router)` performs the initial
 * navigation, which discards a route pushed before the page settled. Main must therefore not hear
 * readiness until the router reports `isReady()`, and a router that never becomes ready must not
 * strand destinations forever.
 */
describe('announceRendererReadyAfterRouter', () => {
  it('holds the announcement until the router reports its initial navigation ready', async () => {
    const gate = Promise.withResolvers<unknown>()
    const send = vi.fn(async () => undefined)
    let returned = false

    const announcement = announceRendererReadyAfterRouter(
      { send },
      { isReady: () => gate.promise }
    ).then(() => {
      returned = true
    })

    await Promise.resolve()
    expect(send).not.toHaveBeenCalled()
    expect(returned).toBe(false)

    gate.resolve(undefined)
    await announcement

    expect(send).toHaveBeenCalledExactlyOnceWith(AppEvents.window.rendererReady)
    expect(returned).toBe(true)

    // Still exactly one announcement once the boot continues past this await.
    await Promise.resolve()
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('sends nothing and rejects when the router never became ready', async () => {
    const gate = Promise.withResolvers<unknown>()
    const send = vi.fn(async () => undefined)
    const failure = new Error('initial navigation failed')

    const announcement = announceRendererReadyAfterRouter({ send }, { isReady: () => gate.promise })
    await Promise.resolve()
    expect(send).not.toHaveBeenCalled()

    gate.reject(failure)

    // Claiming readiness here would consume main's queued route into a renderer whose initial
    // navigation never resolved, so the failure must surface instead of being swallowed.
    await expect(announcement).rejects.toThrow('initial navigation failed')
    expect(send).not.toHaveBeenCalled()
  })
})

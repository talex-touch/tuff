import { afterEach, describe, expect, it, vi } from 'vitest'
import { awaitWithAbort, sleepWithAbort, yieldToEventLoop } from './file-provider-async-utils'

describe('file-provider-async-utils', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('yields to the next event loop turn', async () => {
    let resolved = false
    const pending = yieldToEventLoop().then(() => {
      resolved = true
    })
    expect(resolved).toBe(false)
    await pending
    expect(resolved).toBe(true)
  })

  it('resolves sleepWithAbort after the requested duration when not aborted', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    let settled = false

    const sleep = sleepWithAbort(250, controller.signal).then(() => {
      settled = true
    })

    await vi.advanceTimersByTimeAsync(249)
    expect(settled).toBe(false)

    await vi.advanceTimersByTimeAsync(1)
    await sleep
    expect(settled).toBe(true)
  })

  it('rejects sleepWithAbort immediately when already aborted', async () => {
    const controller = new AbortController()
    const reason = new Error('ALREADY_ABORTED')
    controller.abort(reason)

    await expect(sleepWithAbort(1_000, controller.signal)).rejects.toBe(reason)
  })

  it('rejects sleepWithAbort when aborted mid-sleep and clears its timer', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const reason = new Error('MID_SLEEP_ABORT')

    const sleep = sleepWithAbort(5_000, controller.signal)
    controller.abort(reason)

    await expect(sleep).rejects.toBe(reason)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('awaits promise directly when awaitWithAbort has no signal', async () => {
    await expect(awaitWithAbort(Promise.resolve())).resolves.toBeUndefined()
    await expect(awaitWithAbort(Promise.reject(new Error('boom')))).rejects.toThrow('boom')
  })

  it('resolves awaitWithAbort when promise finishes before abort', async () => {
    const controller = new AbortController()
    await expect(awaitWithAbort(Promise.resolve(), controller.signal)).resolves.toBeUndefined()
  })

  it('rejects awaitWithAbort with signal.reason when aborted before promise settles', async () => {
    const controller = new AbortController()
    const reason = new Error('PUBLISH_ABORTED')
    const neverSettling = new Promise<void>(() => undefined)

    const race = awaitWithAbort(neverSettling, controller.signal)
    controller.abort(reason)

    await expect(race).rejects.toBe(reason)
  })

  it('rejects awaitWithAbort with promise error when promise rejects before abort', async () => {
    const controller = new AbortController()
    await expect(
      awaitWithAbort(Promise.reject(new Error('write-failed')), controller.signal)
    ).rejects.toThrow('write-failed')
  })
})

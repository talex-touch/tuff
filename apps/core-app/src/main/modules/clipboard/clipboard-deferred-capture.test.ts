import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CLIPBOARD_DEFER_MAX_ROUNDS,
  ClipboardDeferredCapture,
  createDeferralSignal,
  isDeferrableClipboardSource,
  mergeDeferralSignals
} from './clipboard-deferred-capture'

describe('ClipboardDeferredCapture', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('runs the retry once, after the delay, with its round advanced and its signal time', () => {
    const run = vi.fn()
    const deferred = new ClipboardDeferredCapture(run)
    const signalledAt = Date.now()

    expect(deferred.defer('native-watch', 0, 5_000)).toBe(true)
    vi.advanceTimersByTime(4_999)
    expect(run).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(run).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledWith({
      source: 'native-watch',
      round: 1,
      signal: { at: signalledAt, isChange: true }
    })

    vi.advanceTimersByTime(120_000)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('coalesces a burst into the timer armed first and keeps the highest round', () => {
    const run = vi.fn()
    const deferred = new ClipboardDeferredCapture(run)

    deferred.defer('native-watch', 0, 5_000)
    vi.advanceTimersByTime(1_000)
    const latestSignalAt = Date.now()
    deferred.defer('native-watch', 0, 9_000)
    deferred.defer('native-watch', 2, 9_000)
    deferred.defer('native-watch', 1, 9_000)
    expect(vi.getTimerCount()).toBe(1)

    vi.advanceTimersByTime(4_000)
    expect(run).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledWith({
      source: 'native-watch',
      round: 3,
      signal: { at: latestSignalAt, isChange: true }
    })
  })

  it('keeps the timer armed first when a later defer asks for a shorter delay', () => {
    const run = vi.fn()
    const deferred = new ClipboardDeferredCapture(run)

    deferred.defer('native-watch', 0, 5_000)
    vi.advanceTimersByTime(1_000)
    deferred.defer('native-watch', 0, 500)
    expect(vi.getTimerCount()).toBe(1)

    // 1_500 is when the shorter delay would have been due.
    vi.advanceTimersByTime(1_000)
    expect(run).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2_999)
    expect(run).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('lets the baseline source win when both kinds were dropped', () => {
    const run = vi.fn()
    const deferred = new ClipboardDeferredCapture(run)
    const signalledAt = Date.now()

    deferred.defer('native-watch', 0, 1_000)
    deferred.defer('corebox-show-baseline', 0, 1_000)
    deferred.defer('native-watch', 0, 1_000)
    vi.advanceTimersByTime(1_000)

    expect(run).toHaveBeenCalledWith({
      source: 'corebox-show-baseline',
      round: 1,
      signal: { at: signalledAt, isChange: true }
    })
  })

  it('refuses once the round cap is used up and arms nothing', () => {
    const run = vi.fn()
    const deferred = new ClipboardDeferredCapture(run)
    const signalledAt = Date.now()

    expect(deferred.defer('native-watch', CLIPBOARD_DEFER_MAX_ROUNDS - 1, 1_000)).toBe(true)
    vi.advanceTimersByTime(1_000)
    expect(run).toHaveBeenCalledWith({
      source: 'native-watch',
      round: CLIPBOARD_DEFER_MAX_ROUNDS,
      signal: { at: signalledAt, isChange: true }
    })

    expect(deferred.defer('native-watch', CLIPBOARD_DEFER_MAX_ROUNDS, 1_000)).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('refuses the baseline at the cap too, so the caller captures it', () => {
    const deferred = new ClipboardDeferredCapture(vi.fn())

    expect(deferred.defer('corebox-show-baseline', CLIPBOARD_DEFER_MAX_ROUNDS, 1_000)).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('defers again after a retry has run, carrying the signal it was given', () => {
    const run = vi.fn()
    const deferred = new ClipboardDeferredCapture(run)
    const signalledAt = Date.now()

    deferred.defer('native-watch', 0, 1_000)
    vi.advanceTimersByTime(1_000)
    const [{ signal }] = run.mock.calls[0]
    deferred.defer('native-watch', 1, 1_000, signal)
    vi.advanceTimersByTime(1_000)

    expect(run).toHaveBeenCalledTimes(2)
    expect(run).toHaveBeenLastCalledWith({
      source: 'native-watch',
      round: 2,
      signal: { at: signalledAt, isChange: true }
    })
  })

  it('clears the pending retry on cancel', () => {
    const run = vi.fn()
    const deferred = new ClipboardDeferredCapture(run)

    deferred.defer('native-watch', 0, 1_000)
    deferred.cancel()
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(10_000)
    expect(run).not.toHaveBeenCalled()

    deferred.defer('native-watch', 0, 1_000)
    vi.advanceTimersByTime(1_000)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('does not hold the process open', () => {
    const timeout = vi.spyOn(globalThis, 'setTimeout')
    const deferred = new ClipboardDeferredCapture(vi.fn())

    deferred.defer('native-watch', 0, 1_000)

    const timer = timeout.mock.results[0]?.value as NodeJS.Timeout
    expect(timer.hasRef()).toBe(false)
    deferred.cancel()
  })

  it('treats a negative delay as immediate', () => {
    const run = vi.fn()
    new ClipboardDeferredCapture(run).defer('native-watch', 0, -50)

    vi.advanceTimersByTime(0)
    expect(run).toHaveBeenCalledTimes(1)
  })

  describe('signal time of a coalesced retry', () => {
    type Dropped = [source: 'native-watch' | 'corebox-show-baseline', at: number]

    function replayOf(...signals: Dropped[]) {
      const run = vi.fn()
      const deferred = new ClipboardDeferredCapture(run)
      for (const [source, at] of signals) {
        deferred.defer(source, 0, 1_000, { at, isChange: source === 'native-watch' })
      }
      vi.advanceTimersByTime(1_000)
      expect(run).toHaveBeenCalledTimes(1)
      return run.mock.calls[0][0]
    }

    it('is the latest change signal, whatever order the signals arrive in', () => {
      const retry = replayOf(['native-watch', 300], ['native-watch', 200], ['native-watch', 400])

      expect(retry.signal).toEqual({ at: 400, isChange: true })
    })

    it('is the change signal when a baseline is mixed in, even a later one', () => {
      const retry = replayOf(
        ['corebox-show-baseline', 100],
        ['native-watch', 50],
        ['corebox-show-baseline', 900]
      )

      expect(retry.source).toBe('corebox-show-baseline')
      expect(retry.signal).toEqual({ at: 50, isChange: true })
    })

    it('is the first baseline when no change signal was dropped', () => {
      const retry = replayOf(
        ['corebox-show-baseline', 500],
        ['corebox-show-baseline', 700],
        ['corebox-show-baseline', 300]
      )

      expect(retry.signal).toEqual({ at: 300, isChange: false })
    })
  })
})

describe('createDeferralSignal', () => {
  it('marks only a native-watch signal as a change, stamped with the given time', () => {
    expect(createDeferralSignal('native-watch', 42)).toEqual({ at: 42, isChange: true })
    expect(createDeferralSignal('corebox-show-baseline', 42)).toEqual({ at: 42, isChange: false })
    expect(createDeferralSignal('background-poll', 42)).toEqual({ at: 42, isChange: false })
  })

  it('defaults to the clock', () => {
    vi.useFakeTimers()
    try {
      expect(createDeferralSignal('native-watch').at).toBe(Date.now())
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('mergeDeferralSignals', () => {
  const change = (at: number) => ({ at, isChange: true })
  const baseline = (at: number) => ({ at, isChange: false })

  it('takes the later of two change signals', () => {
    expect(mergeDeferralSignals(change(1), change(2))).toEqual(change(2))
    expect(mergeDeferralSignals(change(2), change(1))).toEqual(change(2))
  })

  it('takes a change signal over a baseline in either position', () => {
    expect(mergeDeferralSignals(change(1), baseline(9))).toEqual(change(1))
    expect(mergeDeferralSignals(baseline(9), change(1))).toEqual(change(1))
  })

  it('takes the earlier of two baselines', () => {
    expect(mergeDeferralSignals(baseline(1), baseline(2))).toEqual(baseline(1))
    expect(mergeDeferralSignals(baseline(2), baseline(1))).toEqual(baseline(1))
  })
})

describe('isDeferrableClipboardSource', () => {
  it('defers the change signal and the baseline, never a poll', () => {
    expect(isDeferrableClipboardSource('native-watch')).toBe(true)
    expect(isDeferrableClipboardSource('corebox-show-baseline')).toBe(true)
    expect(isDeferrableClipboardSource('background-poll')).toBe(false)
    expect(isDeferrableClipboardSource('visible-poll')).toBe(false)
  })
})

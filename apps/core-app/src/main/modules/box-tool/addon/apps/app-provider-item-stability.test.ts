import fs from 'node:fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  APP_STABILITY_PROBE_INTERVAL_MS,
  APP_STABILITY_SETTLE_MS,
  getItemStabilityFingerprint,
  getRetryableStabilityError,
  isMissingItemError,
  waitForItemStability
} from './app-provider-item-stability'

vi.mock('./app-provider-log', () => ({
  logApp: vi.fn()
}))

const APP_PATH = '/Applications/Probe.app'

describe('app-provider-item-stability', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('getItemStabilityFingerprint', () => {
    it('tracks mtimeMs for directories regardless of constant st_size', () => {
      const a = getItemStabilityFingerprint({ size: 96, mtimeMs: 1_000, isDirectory: () => true })
      const b = getItemStabilityFingerprint({ size: 4096, mtimeMs: 1_000, isDirectory: () => true })
      const c = getItemStabilityFingerprint({ size: 96, mtimeMs: 1_001, isDirectory: () => true })

      expect(a).toBe(b)
      expect(a).not.toBe(c)
    })

    it('tracks both size and mtimeMs for files', () => {
      const base = getItemStabilityFingerprint({
        size: 100,
        mtimeMs: 1_000,
        isDirectory: () => false
      })
      const larger = getItemStabilityFingerprint({
        size: 200,
        mtimeMs: 1_000,
        isDirectory: () => false
      })
      const newer = getItemStabilityFingerprint({
        size: 100,
        mtimeMs: 1_001,
        isDirectory: () => false
      })

      expect(base).not.toBe(larger)
      expect(base).not.toBe(newer)
    })
  })

  describe('isMissingItemError', () => {
    it('recognizes ENOENT and ENOTDIR as missing paths', () => {
      expect(isMissingItemError(Object.assign(new Error('missing'), { code: 'ENOENT' }))).toBe(true)
      expect(isMissingItemError(Object.assign(new Error('not dir'), { code: 'ENOTDIR' }))).toBe(
        true
      )
      expect(isMissingItemError(Object.assign(new Error('busy'), { code: 'EBUSY' }))).toBe(false)
      expect(isMissingItemError(new Error('generic'))).toBe(false)
      expect(isMissingItemError(null)).toBe(false)
    })
  })

  describe('getRetryableStabilityError', () => {
    it('returns an error only for changing and error outcomes', () => {
      const changingError = getRetryableStabilityError({ status: 'changing', attempts: 5 })
      expect(changingError).toBeInstanceOf(Error)
      expect((changingError as Error).message).toContain('APP_ITEM_UNSTABLE')

      const statError = Object.assign(new Error('busy'), { code: 'EBUSY' })
      expect(getRetryableStabilityError({ status: 'error', error: statError })).toBe(statError)

      expect(getRetryableStabilityError({ status: 'stable' })).toBeNull()
      expect(
        getRetryableStabilityError({
          status: 'missing',
          error: Object.assign(new Error('gone'), { code: 'ENOENT' })
        })
      ).toBeNull()
      expect(getRetryableStabilityError({ status: 'aborted' })).toBeNull()
    })
  })

  describe('waitForItemStability', () => {
    it('probes at 300ms and settles for 250ms once the bundle stops changing', async () => {
      vi.useFakeTimers()
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')
      vi.spyOn(fs, 'stat').mockResolvedValue({
        size: 96,
        mtimeMs: 1_000,
        isDirectory: () => true
      } as never)

      const pending = waitForItemStability(APP_PATH)
      await vi.advanceTimersByTimeAsync(APP_STABILITY_PROBE_INTERVAL_MS + APP_STABILITY_SETTLE_MS)
      const result = await pending

      expect(result).toEqual({ status: 'stable' })
      expect(setTimeoutSpy).toHaveBeenNthCalledWith(
        1,
        expect.any(Function),
        APP_STABILITY_PROBE_INTERVAL_MS
      )
      expect(setTimeoutSpy).toHaveBeenNthCalledWith(
        2,
        expect.any(Function),
        APP_STABILITY_SETTLE_MS
      )
      expect(vi.getTimerCount()).toBe(0)
    })

    it('returns changing after exhausting retries while directory mtime keeps moving', async () => {
      vi.useFakeTimers()
      let mtime = 1_000
      const statSpy = vi
        .spyOn(fs, 'stat')
        .mockImplementation(
          async () => ({ size: 96, mtimeMs: (mtime += 1), isDirectory: () => true }) as never
        )

      const pending = waitForItemStability(APP_PATH, { delayMs: 50, retries: 3, settleMs: 25 })
      await vi.advanceTimersByTimeAsync(50 * 3)
      const result = await pending

      expect(result).toEqual({ status: 'changing', attempts: 3 })
      expect(statSpy).toHaveBeenCalledTimes(6)
      expect(vi.getTimerCount()).toBe(0)
    })

    it('succeeds when a file stops growing before retries are exhausted', async () => {
      vi.useFakeTimers()
      const sizes = [100, 200, 300, 300]
      let index = 0
      const statSpy = vi.spyOn(fs, 'stat').mockImplementation(async () => {
        const size = sizes[Math.min(index, sizes.length - 1)]
        index += 1
        return { size, mtimeMs: 1_000, isDirectory: () => false } as never
      })

      const pending = waitForItemStability('/Applications/Tool.exe', {
        delayMs: 50,
        retries: 3,
        settleMs: 25
      })
      await vi.advanceTimersByTimeAsync(50 * 2 + 25)
      const result = await pending

      expect(result).toEqual({ status: 'stable' })
      expect(statSpy).toHaveBeenCalledTimes(4)
      expect(vi.getTimerCount()).toBe(0)
    })

    it('classifies ENOENT as missing without extra probes', async () => {
      const enoent = Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      const statSpy = vi.spyOn(fs, 'stat').mockRejectedValue(enoent)

      const result = await waitForItemStability(APP_PATH, { delayMs: 50, retries: 3 })

      expect(result).toEqual({ status: 'missing', error: enoent })
      expect(statSpy).toHaveBeenCalledTimes(1)
    })

    it('classifies non-missing stat errors separately as error', async () => {
      const ebusy = Object.assign(new Error('EBUSY'), { code: 'EBUSY' })
      const statSpy = vi.spyOn(fs, 'stat').mockRejectedValue(ebusy)

      const result = await waitForItemStability(APP_PATH, { delayMs: 50, retries: 3 })

      expect(result).toEqual({ status: 'error', error: ebusy })
      expect(statSpy).toHaveBeenCalledTimes(1)
    })

    it('aborts immediately before probing when signal is already aborted', async () => {
      const controller = new AbortController()
      controller.abort()
      const statSpy = vi.spyOn(fs, 'stat')

      const result = await waitForItemStability(APP_PATH, { signal: controller.signal })

      expect(result).toEqual({ status: 'aborted' })
      expect(statSpy).not.toHaveBeenCalled()
    })

    it('aborts cleanly during probe wait without leaking timers', async () => {
      vi.useFakeTimers()
      const controller = new AbortController()
      vi.spyOn(fs, 'stat').mockResolvedValue({
        size: 96,
        mtimeMs: 1_000,
        isDirectory: () => true
      } as never)

      const pending = waitForItemStability(APP_PATH, {
        delayMs: 300,
        retries: 5,
        settleMs: 250,
        signal: controller.signal
      })
      await Promise.resolve()
      expect(vi.getTimerCount()).toBe(1)

      controller.abort()
      const result = await pending

      expect(result).toEqual({ status: 'aborted' })
      expect(vi.getTimerCount()).toBe(0)
    })

    it('aborts cleanly during settle wait without leaking timers', async () => {
      vi.useFakeTimers()
      const controller = new AbortController()
      vi.spyOn(fs, 'stat').mockResolvedValue({
        size: 96,
        mtimeMs: 1_000,
        isDirectory: () => true
      } as never)

      const pending = waitForItemStability(APP_PATH, {
        delayMs: 300,
        retries: 5,
        settleMs: 250,
        signal: controller.signal
      })
      await vi.advanceTimersByTimeAsync(300)
      expect(vi.getTimerCount()).toBe(1)

      controller.abort()
      const result = await pending

      expect(result).toEqual({ status: 'aborted' })
      expect(vi.getTimerCount()).toBe(0)
    })
  })
})

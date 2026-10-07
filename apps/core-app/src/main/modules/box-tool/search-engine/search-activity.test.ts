import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dbWriteScheduler } from '../../../db/db-write-scheduler'
import {
  beginForegroundSearchActivity,
  endForegroundSearchActivity,
  isIndexMaintenanceIdle,
  isSearchRecentlyActive,
  markSearchActivity,
  waitForIndexMaintenanceIdle
} from './search-activity'

describe('search activity', () => {
  const releaseOwnedTasks = new Set<() => void>()

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    markSearchActivity(0)
  })

  afterEach(async () => {
    for (const release of releaseOwnedTasks) release()
    endForegroundSearchActivity('activity:first')
    endForegroundSearchActivity('activity:second')
    markSearchActivity(0)
    try {
      // Keep the fake clock alive until scheduler cooperative immediates/backoff finish.
      // A failed assertion must not strand this file's singleton tasks for the next case.
      await vi.advanceTimersByTimeAsync(1000)
      await dbWriteScheduler.drain()
    } finally {
      releaseOwnedTasks.clear()
      vi.useRealTimers()
    }
  })

  it('expires input activity at the requested window boundary', () => {
    markSearchActivity(Date.now())
    vi.advanceTimersByTime(1200)
    expect(isSearchRecentlyActive(1200)).toBe(true)
    vi.advanceTimersByTime(1)
    expect(isSearchRecentlyActive(1200)).toBe(false)
  })

  it('waits for every foreground search, even after a long period without input', async () => {
    beginForegroundSearchActivity('activity:first')
    beginForegroundSearchActivity('activity:second')
    const controller = new AbortController()
    let admitted = false
    const waiting = waitForIndexMaintenanceIdle(controller.signal).then(() => {
      admitted = true
    })
    try {
      await vi.advanceTimersByTimeAsync(60_000)
      expect(isSearchRecentlyActive(2000)).toBe(false)
      expect(isIndexMaintenanceIdle()).toBe(false)
      expect(admitted).toBe(false)

      endForegroundSearchActivity('activity:first')
      await vi.advanceTimersByTimeAsync(1000)
      expect(admitted).toBe(false)

      endForegroundSearchActivity('activity:second')
      await vi.advanceTimersByTimeAsync(1000)
      await waiting
      expect(admitted).toBe(true)
    } finally {
      controller.abort()
      await waiting.catch(() => undefined)
    }
  })

  it('can abort an idle wait without releasing another live search or poisoning the next wait', async () => {
    beginForegroundSearchActivity('activity:first')
    const controller = new AbortController()
    const reason = new Error('maintenance cancelled')
    const waiting = waitForIndexMaintenanceIdle(controller.signal)
    const rejection = expect(waiting).rejects.toBe(reason)
    controller.abort(reason)
    await rejection
    expect(isIndexMaintenanceIdle()).toBe(false)

    endForegroundSearchActivity('activity:first')
    await vi.advanceTimersByTimeAsync(3000)
    await expect(waitForIndexMaintenanceIdle()).resolves.toBeUndefined()
  })

  it('extends a pending idle wait when the user supplies more input', async () => {
    markSearchActivity(Date.now())
    const controller = new AbortController()
    let admitted = false
    const waiting = waitForIndexMaintenanceIdle(controller.signal).then(() => {
      admitted = true
    })
    try {
      await vi.advanceTimersByTimeAsync(1500)
      markSearchActivity(Date.now())
      await vi.advanceTimersByTimeAsync(1500)
      expect(admitted).toBe(false)
      await vi.advanceTimersByTimeAsync(1000)
      await waiting
      expect(admitted).toBe(true)
    } finally {
      controller.abort()
      await waiting.catch(() => undefined)
    }
  })

  it.each(['primary', 'aux'] as const)(
    'does not admit maintenance while an interactive write is queued or active in %s',
    async (lane) => {
      const backgroundStarted = Promise.withResolvers<void>()
      const backgroundRelease = Promise.withResolvers<void>()
      const interactiveStarted = Promise.withResolvers<void>()
      const interactiveRelease = Promise.withResolvers<void>()
      const release = (): void => {
        backgroundRelease.resolve()
        interactiveRelease.resolve()
      }
      releaseOwnedTasks.add(release)
      const tasks: Promise<unknown>[] = []
      try {
        const background = dbWriteScheduler.schedule(
          `idle-test.${lane}.background`,
          async () => {
            backgroundStarted.resolve()
            await backgroundRelease.promise
          },
          { lane, priority: 'background' }
        )
        tasks.push(background)
        await backgroundStarted.promise
        expect(isIndexMaintenanceIdle()).toBe(true)
        const interactive = dbWriteScheduler.schedule(
          `idle-test.${lane}.interactive`,
          async () => {
            interactiveStarted.resolve()
            await interactiveRelease.promise
          },
          { lane, priority: 'interactive' }
        )
        tasks.push(interactive)
        expect(isIndexMaintenanceIdle()).toBe(false)
        backgroundRelease.resolve()
        // The lane resolves the first task, then yields via setImmediate before dequeueing.
        // Drive that exact cooperative pulse before awaiting the next operation's signal.
        await vi.advanceTimersByTimeAsync(1)
        await interactiveStarted.promise
        expect(isIndexMaintenanceIdle()).toBe(false)
        interactiveRelease.resolve()
        await vi.advanceTimersByTimeAsync(1)
        await Promise.all(tasks)
        await dbWriteScheduler.drain()
        expect(isIndexMaintenanceIdle()).toBe(true)
      } finally {
        release()
        await vi.advanceTimersByTimeAsync(1)
        await Promise.allSettled(tasks)
        await vi.advanceTimersByTimeAsync(1)
        await dbWriteScheduler.drain()
        releaseOwnedTasks.delete(release)
      }
    }
  )

  it.each(['primary', 'aux'] as const)(
    'keeps maintenance blocked while an interactive write is parked for SQLITE_BUSY in %s',
    async (lane) => {
      let attempts = 0
      const interactive = dbWriteScheduler.schedule(
        `idle-test.${lane}.busy`,
        async () => {
          attempts += 1
          if (attempts === 1) {
            throw Object.assign(new Error('database is locked'), {
              code: 'SQLITE_BUSY',
              rawCode: 5
            })
          }
          return 'committed'
        },
        { lane, priority: 'interactive', busyRetries: 1, busyBaseDelayMs: 100, busyMaxDelayMs: 100 }
      )
      const outcome = interactive.then(
        (value) => ({ value }),
        (error: unknown) => ({ error })
      )
      try {
        const barrier = dbWriteScheduler.schedule(
          `idle-test.${lane}.barrier`,
          async () => undefined,
          {
            lane,
            priority: 'background'
          }
        )
        await vi.advanceTimersByTimeAsync(1)
        await barrier
        expect(attempts).toBe(1)
        expect(isIndexMaintenanceIdle()).toBe(false)
        await vi.advanceTimersByTimeAsync(1000)
        expect(await outcome).toEqual({ value: 'committed' })
        expect(isIndexMaintenanceIdle()).toBe(true)
      } finally {
        await vi.advanceTimersByTimeAsync(1000)
        await outcome
        await vi.advanceTimersByTimeAsync(1)
        await dbWriteScheduler.drain()
      }
    }
  )
})

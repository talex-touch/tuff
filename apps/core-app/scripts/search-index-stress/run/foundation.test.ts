import net from 'node:net'
import { describe, expect, it } from 'vitest'
import { realClock, sleepUntil } from './clock'
import { allocateAppPorts, allocatePorts } from './ports'
import { createRateLimiter } from './rate-limiter'
import { createVirtualClock } from './test-support/virtual-clock'

describe('virtual clock', () => {
  it('fires timers in due order and keeps insertion order for ties', async () => {
    const clock = createVirtualClock(0)
    const fired: string[] = []
    void clock.sleep(30).then(() => fired.push('c'))
    void clock.sleep(10).then(() => fired.push('a'))
    void clock.sleep(10).then(() => fired.push('b'))
    await clock.advance(9)
    expect(fired).toEqual([])
    await clock.advance(1)
    expect(fired).toEqual(['a', 'b'])
    await clock.advance(100)
    expect(fired).toEqual(['a', 'b', 'c'])
    expect(clock.now()).toBe(110)
  })

  it('wakes a sleeper early when its signal aborts', async () => {
    const clock = createVirtualClock(0)
    const controller = new AbortController()
    let woke = false
    void clock.sleep(10_000, controller.signal).then(() => {
      woke = true
    })
    await clock.advance(5)
    expect(woke).toBe(false)
    controller.abort()
    await clock.advance(0)
    expect(woke).toBe(true)
    expect(clock.pendingTimers()).toBe(0)
  })

  it('runUntil jumps over idle time and reports a deadlock instead of hanging', async () => {
    const clock = createVirtualClock(0)
    const result = await clock.runUntil(
      (async () => {
        await clock.sleep(60_000)
        await clock.sleep(60_000)
        return clock.now()
      })()
    )
    expect(result).toBe(120_000)
    await expect(clock.runUntil(new Promise<void>(() => {}))).rejects.toThrow(/deadlock/)
  })

  it('sleepUntil is a no-op for a moment in the past', async () => {
    const clock = createVirtualClock(1000)
    await sleepUntil(clock, 500)
    expect(clock.pendingTimers()).toBe(0)
  })
})

describe('real clock', () => {
  it('resolves immediately for an already aborted signal', async () => {
    const controller = new AbortController()
    controller.abort()
    const started = Date.now()
    await realClock.sleep(5_000, controller.signal)
    expect(Date.now() - started).toBeLessThan(500)
  })
})

describe('rate limiter', () => {
  it('spaces queries at the configured rate and counts what it delayed', async () => {
    const clock = createVirtualClock(0)
    const limiter = createRateLimiter(10, clock)
    const stamps: number[] = []
    const run = async (): Promise<void> => {
      await limiter.acquire()
      stamps.push(clock.now())
    }
    await clock.runUntil(Promise.all([run(), run(), run(), run()]))
    expect(stamps).toEqual([0, 100, 200, 300])
    expect(limiter.issued).toBe(4)
    expect(limiter.waitedMs).toBe(600)
  })

  it('does not bank idle time into a burst', async () => {
    const clock = createVirtualClock(0)
    const limiter = createRateLimiter(10, clock)
    await limiter.acquire()
    await clock.advance(10_000)
    const stamps: number[] = []
    const run = async (): Promise<void> => {
      await limiter.acquire()
      stamps.push(clock.now())
    }
    await clock.runUntil(Promise.all([run(), run(), run()]))
    expect(stamps).toEqual([10_000, 10_100, 10_200])
  })

  it('rejects a non-positive rate and treats Infinity as uncapped', async () => {
    const clock = createVirtualClock(0)
    expect(() => createRateLimiter(0, clock)).toThrow(RangeError)
    const open = createRateLimiter(Number.POSITIVE_INFINITY, clock)
    await open.acquire()
    await open.acquire()
    expect(open.waitedMs).toBe(0)
  })
})

describe('port allocation', () => {
  it('returns distinct ports that can be bound right after', async () => {
    const ports = await allocatePorts(4)
    expect(new Set(ports).size).toBe(4)
    for (const port of ports) {
      await new Promise<void>((resolve, reject) => {
        const server = net.createServer()
        server.once('error', reject)
        server.listen(port, '127.0.0.1', () => server.close(() => resolve()))
      })
    }
  })

  it('never hands out an avoided port and names the three app ports', async () => {
    const [first] = await allocatePorts(1)
    const ports = await allocatePorts(3, [first])
    expect(ports).not.toContain(first)
    const app = await allocateAppPorts()
    expect(new Set([app.cdp, app.inspect, app.vite]).size).toBe(3)
    expect([app.cdp, app.inspect, app.vite]).not.toContain(5173)
  })
})

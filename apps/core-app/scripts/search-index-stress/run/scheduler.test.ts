import { describe, expect, it } from 'vitest'
import type { Pressure } from '../eval-types'
import { RunAbort } from './errors'
import { createPacer } from './pacing'
import type { ItemState, Schedulable } from './scheduler'
import { runPhase } from './scheduler'
import { createVirtualClock } from './test-support/virtual-clock'

interface Item extends Schedulable {
  ms: number
  ok?: boolean
}

function item(id: string, ms = 100, extra: Partial<Item> = {}): Item {
  return { id, ms, ...extra }
}

function rig(options: { base?: number; level?: () => Pressure } = {}) {
  const clock = createVirtualClock()
  const controller = new AbortController()
  const states = new Map<string, ItemState>()
  const log = {
    started: [] as Array<[string, number]>,
    finished: [] as string[],
    blocked: [] as Array<[string, string]>,
    settled: [] as string[]
  }
  const flight = { now: 0, max: 0, atStart: new Map<string, number>() }
  const failures: unknown[] = []
  const pacer = createPacer({
    clock,
    base: options.base ?? 3,
    pressure: () => ({ level: options.level?.() ?? 'ok' }),
    mark: () => undefined
  })
  const phase = (items: Item[]) =>
    runPhase(items, {
      clock,
      pacer,
      signal: controller.signal,
      states,
      tickMs: 100,
      fail: (error) => {
        failures.push(error)
        controller.abort()
      },
      onSettled: (settled, state) => log.settled.push(`${settled.id}:${state}`),
      block: (blocked, reason) => {
        log.blocked.push([blocked.id, reason])
      },
      execute: async (running) => {
        log.started.push([running.id, clock.now()])
        flight.now += 1
        flight.max = Math.max(flight.max, flight.now)
        flight.atStart.set(running.id, flight.now)
        await clock.sleep(running.ms, controller.signal)
        flight.now -= 1
        if (controller.signal.aborted) throw new RunAbort('aborted', 'run aborted')
        log.finished.push(running.id)
        return running.ok !== false
      }
    })
  return { clock, controller, states, log, flight, failures, pacer, phase }
}

describe('runPhase', () => {
  it('starts scenarios in plan order and never has more than the limit in flight', async () => {
    const r = rig({ base: 3 })
    const items = Array.from({ length: 10 }, (_, index) => item(`s${index}`))
    await r.clock.runUntil(r.phase(items))

    expect(r.log.started.map(([id]) => id)).toEqual(items.map((entry) => entry.id))
    expect(r.flight.max).toBe(3)
    expect(r.log.finished).toHaveLength(10)
    expect(r.log.settled.every((entry) => entry.endsWith(':ok'))).toBe(true)
  })

  it('keeps a scenario back until the ones it requires finished, without holding up the rest', async () => {
    const r = rig({ base: 4 })
    const items = [
      item('a', 1_000),
      item('b', 100, { requires: ['a'] }),
      item('c'),
      item('d'),
      item('e')
    ]
    await r.clock.runUntil(r.phase(items))

    const startedAt = new Map(r.log.started)
    expect(startedAt.get('c')).toBeLessThan(startedAt.get('b') as number)
    expect(startedAt.get('d')).toBeLessThan(startedAt.get('b') as number)
    expect((startedAt.get('b') as number) - (startedAt.get('a') as number)).toBeGreaterThanOrEqual(
      1_000
    )
    expect(r.log.finished.indexOf('a')).toBeLessThan(r.log.finished.indexOf('b'))
  })

  it('blocks a scenario whose required scenario failed, was skipped or is not in the run', async () => {
    const r = rig()
    const items = [
      item('a', 100, { ok: false }),
      item('b', 100, { requires: ['a'] }),
      item('c', 100, { requires: ['b'] }),
      item('d', 100, { requires: ['nowhere'] }),
      item('e')
    ]
    await r.clock.runUntil(r.phase(items))

    expect(Object.fromEntries(r.log.blocked)).toEqual({
      b: 'required scenario a did not complete its steps',
      c: 'required scenario b was skipped',
      d: 'required scenario nowhere is not part of this run'
    })
    expect(r.log.started.map(([id]) => id)).toEqual(['a', 'e'])
    expect(r.states.get('a')).toBe('failed')
    expect(r.states.get('e')).toBe('ok')
  })

  it('lets a later phase require a scenario of an earlier one', async () => {
    const r = rig()
    await r.clock.runUntil(r.phase([item('a'), item('x', 100, { ok: false })]))
    await r.clock.runUntil(
      r.phase([item('b', 100, { requires: ['a'] }), item('c', 100, { requires: ['x'] })])
    )

    expect(r.log.finished).toContain('b')
    expect(r.log.blocked).toEqual([['c', 'required scenario x did not complete its steps']])
  })

  it('blocks scenarios that wait for something that cannot run in this phase', async () => {
    const r = rig()
    r.states.set('later', 'pending')
    await r.clock.runUntil(r.phase([item('a', 100, { requires: ['later'] }), item('b')]))

    expect(r.log.blocked).toEqual([
      ['a', 'required scenario later did not run before this phase ended']
    ])
    expect(r.log.finished).toEqual(['b'])
  })

  it('halves the scenarios in flight while pressure is elevated', async () => {
    let level: Pressure = 'ok'
    const r = rig({ base: 6, level: () => level })
    const items = Array.from({ length: 40 }, (_, index) => item(`s${index}`, 200))
    const running = r.phase(items)
    void r.clock.sleep(300).then(() => {
      level = 'elevated'
    })
    await r.clock.runUntil(running)

    const lateStarts = r.log.started.filter(([, at]) => at >= r.log.started[0][1] + 700)
    expect(lateStarts.length).toBeGreaterThan(10)
    expect(
      Math.max(...lateStarts.map(([id]) => r.flight.atStart.get(id) as number))
    ).toBeLessThanOrEqual(3)
    expect(r.flight.max).toBe(6)
    expect(r.pacer.stats().throttledSeconds).toBeGreaterThan(0)
    expect(r.log.finished).toHaveLength(40)
  })

  it('releases nothing while pressure is critical and carries on three quiet seconds after it cleared', async () => {
    let level: Pressure = 'ok'
    const r = rig({ base: 2, level: () => level })
    const items = Array.from({ length: 12 }, (_, index) => item(`s${index}`, 100))
    const running = r.phase(items)
    void (async () => {
      await r.clock.sleep(250)
      level = 'critical'
      await r.clock.sleep(5_000)
      level = 'ok'
    })()
    await r.clock.runUntil(running)

    const startTimes = r.log.started.map(([, at]) => at)
    const base = startTimes[0]
    const during = startTimes.filter((at) => at - base > 450 && at - base < 5_250 + 3_000 - 50)
    expect(during).toEqual([])
    expect(r.log.finished).toHaveLength(12)
    expect(r.pacer.stats().criticalHolds).toBe(1)
  })

  it('stops releasing when a scenario rejects, lets the others end and throws the first error', async () => {
    const r = rig({ base: 3 })
    const boom = new RunAbort('driver-unhealthy', 'too many failed searches')
    const items = [item('a', 500), item('b', 500), item('c', 500), item('d'), item('e')]
    const phase = runPhase(items, {
      clock: r.clock,
      pacer: r.pacer,
      signal: r.controller.signal,
      states: r.states,
      tickMs: 100,
      fail: (error) => {
        r.failures.push(error)
        r.controller.abort()
      },
      block: () => undefined,
      execute: async (running) => {
        r.log.started.push([running.id, r.clock.now()])
        await r.clock.sleep(running.id === 'b' ? 100 : 500, r.controller.signal)
        if (running.id === 'b') throw boom
        throw new RunAbort('aborted', 'run aborted')
      }
    })

    await expect(r.clock.runUntil(phase)).rejects.toBe(boom)
    expect(r.failures).toEqual([boom])
    expect(r.log.started.map(([id]) => id)).toEqual(['a', 'b', 'c'])
    expect(r.states.get('a')).toBe('pending')
    expect(r.states.get('d')).toBe('pending')
  })

  it('aborts on the outside signal: no new scenario, in-flight ones end, and the phase says so', async () => {
    const r = rig({ base: 2 })
    const items = Array.from({ length: 8 }, (_, index) => item(`s${index}`, 1_000))
    const running = r.phase(items)
    void r.clock.sleep(1_500).then(() => r.controller.abort())

    await expect(r.clock.runUntil(running)).rejects.toMatchObject({ reason: 'aborted' })
    expect(r.log.started.length).toBeLessThan(8)
    expect(r.flight.now).toBe(0)
  })

  it('finishes quietly when the signal fires only after everything ran', async () => {
    const r = rig()
    const running = r.phase([item('a'), item('b')])
    await r.clock.runUntil(running)
    r.controller.abort()
    expect(r.log.finished).toEqual(['a', 'b'])
  })
})

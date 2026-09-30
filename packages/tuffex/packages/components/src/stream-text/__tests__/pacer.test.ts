import type { StreamState } from '../src/types'
import type { StreamPacerOptions } from '../src/use-stream-pacer'
import { describe, expect, it } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { useStreamPacer } from '../src/use-stream-pacer'

/** A deterministic frame + timer clock the pacer runs on instead of the browser's. */
function createClock() {
  let time = 1000
  let id = 0
  let frames: { id: number, callback: (time: number) => void }[] = []
  let timers: { id: number, at: number, callback: () => void }[] = []
  return {
    now: () => time,
    requestFrame: (callback: (time: number) => void) => {
      frames.push({ id: ++id, callback })
      return id
    },
    cancelFrame: (frame: number) => {
      frames = frames.filter(entry => entry.id !== frame)
    },
    setTimer: (callback: () => void, ms: number) => {
      timers.push({ id: ++id, at: time + ms, callback })
      return id
    },
    clearTimer: (timer: unknown) => {
      timers = timers.filter(entry => entry.id !== timer)
    },
    /** Runs 16ms frames (and due timers) until `ms` has passed. */
    advance(ms: number) {
      const end = time + ms
      while (time < end) {
        time = Math.min(end, time + 16)
        const due = frames
        frames = []
        for (const frame of due)
          frame.callback(time)
        const fire = timers.filter(entry => entry.at <= time)
        timers = timers.filter(entry => entry.at > time)
        for (const timer of fire)
          timer.callback()
      }
    },
    pending: () => frames.length + timers.length,
  }
}

function setup(overrides: Omit<Partial<StreamPacerOptions>, 'total' | 'streaming'> & { total?: number, streaming?: boolean } = {}) {
  const { total: initialTotal, streaming: initialStreaming, ...options } = overrides
  const clock = createClock()
  const total = ref(initialTotal ?? 0)
  const streaming = ref(initialStreaming ?? true)
  const states: StreamState[] = []
  const scope = effectScope()
  const pacer = scope.run(() => useStreamPacer({
    total: () => total.value,
    streaming: () => streaming.value,
    settleMs: () => 460,
    onState: state => states.push(state),
    now: clock.now,
    requestFrame: clock.requestFrame,
    cancelFrame: clock.cancelFrame,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    ...options,
  }))!
  return { clock, total, streaming, states, pacer, scope }
}

describe('useStreamPacer', () => {
  it('shows content that was there at mount as it is, without entrances', () => {
    const { pacer } = setup({ total: 12, streaming: false })
    expect(pacer.revealed.value).toBe(12)
    expect(pacer.settled.value).toBe(12)
    expect(pacer.state.value).toBe('done')
  })

  it('with appear, content present at setup enters from the first unit', () => {
    const paced = setup({ total: 12, streaming: false, appear: true })
    expect(paced.pacer.revealed.value).toBe(0)
    paced.clock.advance(100)
    expect(paced.pacer.revealed.value).toBeGreaterThan(0)
    expect(paced.pacer.revealed.value).toBeLessThan(12)
    paced.clock.advance(1000)
    expect(paced.pacer.revealed.value).toBe(12)

    // Unpaced (a parent keeps the time): shown at once, still entering.
    const unpaced = setup({ total: 12, streaming: false, appear: true, paced: () => false })
    expect(unpaced.pacer.revealed.value).toBe(12)
    expect(unpaced.pacer.settled.value).toBe(0)
    unpaced.clock.advance(480)
    expect(unpaced.pacer.settled.value).toBe(12)
  })

  it('releases the first new unit on the next frame, then one every wordMs', async () => {
    const { clock, total, pacer } = setup()
    // 20 units at 24ms take 480ms, inside the 600ms lag bound: pure cadence.
    total.value = 20
    await nextTick()
    clock.advance(16)
    expect(pacer.revealed.value).toBe(1)
    clock.advance(240)
    // 24ms apart: 10 more in 240ms, give or take the frame boundary.
    expect(pacer.revealed.value).toBeGreaterThanOrEqual(10)
    expect(pacer.revealed.value).toBeLessThanOrEqual(12)
  })

  it('spreads a burst evenly instead of dumping it at the deadline', async () => {
    const { clock, total, pacer } = setup()
    total.value = 300
    await nextTick()
    clock.advance(304)
    // Halfway to the 600ms deadline, about half is out.
    expect(pacer.revealed.value).toBeGreaterThan(120)
    expect(pacer.revealed.value).toBeLessThan(180)
  })

  it('speeds up so a burst never trails the source by more than maxLagMs', async () => {
    const { clock, total, pacer } = setup({ maxLagMs: () => 600 })
    total.value = 300
    await nextTick()
    clock.advance(600 + 32)
    expect(pacer.revealed.value).toBe(300)
  })

  it('drains the backlog within drainMs once the source stops', async () => {
    const { clock, total, streaming, pacer, states } = setup()
    total.value = 60
    await nextTick()
    clock.advance(48)
    streaming.value = false
    await nextTick()
    expect(pacer.state.value).toBe('draining')
    clock.advance(320 + 32)
    expect(pacer.revealed.value).toBe(60)
    expect(pacer.state.value).toBe('done')
    expect(states.at(-1)).toBe('done')
  })

  it('reports paused after pauseMs without a new unit, and streaming again when one comes', async () => {
    const { clock, total, pacer } = setup()
    total.value = 3
    await nextTick()
    clock.advance(200)
    expect(pacer.revealed.value).toBe(3)
    expect(pacer.state.value).toBe('streaming')
    clock.advance(400)
    expect(pacer.state.value).toBe('paused')
    total.value = 5
    await nextTick()
    expect(pacer.state.value).toBe('streaming')
  })

  it('starts the pause clock when the source starts, not when the stream mounted', async () => {
    const { clock, streaming, pacer, states } = setup({ streaming: false })
    clock.advance(2000)
    streaming.value = true
    await nextTick()
    expect(pacer.state.value).toBe('streaming')
    clock.advance(384)
    expect(pacer.state.value).toBe('streaming')
    clock.advance(32)
    expect(pacer.state.value).toBe('paused')
    expect(states).toEqual(['streaming', 'paused'])
  })

  it('walks idle → streaming → paused → streaming → draining → done', async () => {
    const { clock, total, streaming, states } = setup({ streaming: false })
    streaming.value = true
    total.value = 4
    await nextTick()
    clock.advance(700)
    total.value = 30
    await nextTick()
    clock.advance(48)
    streaming.value = false
    await nextTick()
    clock.advance(400)
    expect(states).toEqual(['streaming', 'paused', 'streaming', 'draining', 'done'])
  })

  it('settles each unit once its entrance time has passed', async () => {
    const { clock, total, pacer } = setup()
    total.value = 2
    await nextTick()
    clock.advance(64)
    expect(pacer.revealed.value).toBe(2)
    expect(pacer.settled.value).toBe(0)
    clock.advance(460)
    expect(pacer.settled.value).toBe(2)
  })

  it('replays a complete content from the first unit at the normal cadence and ends done', () => {
    const { clock, pacer, states } = setup({ total: 20, streaming: false })
    pacer.replay()
    expect(pacer.revealed.value).toBe(0)
    expect(pacer.state.value).toBe('streaming')
    clock.advance(120)
    expect(pacer.revealed.value).toBeGreaterThan(2)
    expect(pacer.revealed.value).toBeLessThan(20)
    clock.advance(600)
    expect(pacer.revealed.value).toBe(20)
    expect(pacer.state.value).toBe('done')
    expect(states).toEqual(['streaming', 'done'])
  })

  it('skips to everything shown and settled', async () => {
    const { total, pacer } = setup()
    total.value = 50
    await nextTick()
    pacer.skip()
    expect(pacer.revealed.value).toBe(50)
    expect(pacer.settled.value).toBe(50)
  })

  it('releases everything at once when not paced, but still lets it settle over time', async () => {
    const { clock, total, pacer } = setup({ paced: () => false })
    total.value = 25
    await nextTick()
    expect(pacer.revealed.value).toBe(25)
    expect(pacer.settled.value).toBe(0)
    clock.advance(480)
    expect(pacer.settled.value).toBe(25)
  })

  it('re-releases from a rewound index', () => {
    const { clock, pacer } = setup({ total: 10 })
    expect(pacer.revealed.value).toBe(10)
    pacer.rewind(6)
    expect(pacer.revealed.value).toBe(6)
    clock.advance(200)
    expect(pacer.revealed.value).toBe(10)
  })

  it('without a clock (server render) shows everything at once and schedules nothing', async () => {
    const scheduled: number[] = []
    const { total, pacer } = setup({
      requestFrame: null,
      setTimer: (_callback, ms) => {
        scheduled.push(ms)
        return scheduled.length
      },
    })
    total.value = 8
    await nextTick()
    expect(pacer.revealed.value).toBe(8)
    expect(pacer.settled.value).toBe(8)
    expect(pacer.state.value).toBe('streaming')
    expect(scheduled).toEqual([])
  })

  it('stops releasing when its scope is disposed', async () => {
    const { clock, total, pacer, scope } = setup()
    total.value = 30
    await nextTick()
    clock.advance(32)
    const shown = pacer.revealed.value
    expect(shown).toBeGreaterThan(0)
    scope.stop()
    clock.advance(300)
    expect(pacer.revealed.value).toBe(shown)
  })
})

import type { StreamState } from '../src/controllers/stream-pacer'
import { describe, expect, it } from 'vitest'
import {
  buildStreamModel,
  createStreamPacer,
  segmentWords,
  sliceStreamContent,

} from '../src/controllers/stream-pacer'
import { shallowRef } from '../src/reactivity'

function createFakeClock() {
  let time = 0
  let nextFrameId = 1
  const frames = new Map<number, (t: number) => void>()
  let nextTimerId = 1
  const timers = new Map<number, { at: number, cb: () => void }>()

  return {
    now: () => time,
    requestFrame: (cb: (t: number) => void) => {
      const id = nextFrameId++
      frames.set(id, cb)
      return id
    },
    cancelFrame: (id: number) => {
      frames.delete(id)
    },
    setTimer: (cb: () => void, ms: number) => {
      const id = nextTimerId++
      timers.set(id, { at: time + ms, cb })
      return id
    },
    clearTimer: (id: unknown) => {
      timers.delete(id as number)
    },
    advance(ms: number) {
      time += ms
      const dueFrames = Array.from(frames.entries())
      frames.clear()
      for (const [, cb] of dueFrames)
        cb(time)
      for (const [id, entry] of Array.from(timers.entries())) {
        if (entry.at <= time) {
          timers.delete(id)
          entry.cb()
        }
      }
    },
  }
}

describe('createStreamPacer & stream model', () => {
  it('segments words, builds stream models, and slices prefixes cleanly', () => {
    const words = segmentWords('Hello, world! (test)', 'en')
    expect(words.map(w => w.text)).toEqual(['Hello,', 'world!', '(test)'])
    expect(words[0]!.ws).toBe(' ')

    const model = buildStreamModel([
      { type: 'text', text: 'One two', marks: ['strong'] },
      { type: 'text', text: ' three', href: 'https://tuff.tagzxia.com' },
    ], 'en')
    expect(model.units).toHaveLength(3)
    const sliced = sliceStreamContent(model, 2)
    expect(sliced).toEqual([{ type: 'text', text: 'One two ', marks: ['strong'] }])
  })

  it('paces streaming units, transitions through paused/draining/done, and supports skip/replay/rewind', () => {
    const clock = createFakeClock()
    const total = shallowRef(0)
    const streaming = shallowRef(true)
    const states: StreamState[] = []

    const pacer = createStreamPacer({
      total: () => total.value,
      streaming: () => streaming.value,
      wordMs: () => 20,
      pauseMs: () => 100,
      drainMs: () => 80,
      settleMs: () => 40,
      onState: next => states.push(next),
      now: clock.now,
      requestFrame: clock.requestFrame,
      cancelFrame: clock.cancelFrame,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    })

    expect(pacer.state.value).toBe('streaming')
    total.value = 3
    clock.advance(20)
    expect(pacer.revealed.value).toBeGreaterThanOrEqual(1)

    // Advance enough frames to release & settle all 3 units
    clock.advance(20)
    clock.advance(20)
    clock.advance(50)
    expect(pacer.revealed.value).toBe(3)
    expect(pacer.settled.value).toBe(3)

    // Silence triggers paused state
    clock.advance(120)
    expect(pacer.state.value).toBe('paused')

    // New burst then source stops -> draining -> done
    total.value = 8
    streaming.value = false
    expect(pacer.state.value).toBe('draining')

    pacer.skip()
    expect(pacer.revealed.value).toBe(8)
    expect(pacer.settled.value).toBe(8)
    expect(pacer.state.value).toBe('done')

    // Rewind resets back to index
    pacer.rewind(4)
    expect(pacer.revealed.value).toBe(4)

    // Replay resets to 0 and enters streaming
    pacer.replay()
    expect(pacer.revealed.value).toBe(0)
    expect(pacer.state.value).toBe('streaming')

    pacer.stop()
    expect(states).toContain('paused')
    expect(states).toContain('draining')
    expect(states).toContain('done')
  })

  it('reveals and settles immediately without a clock (SSR mode)', () => {
    const total = shallowRef(5)
    const pacer = createStreamPacer({
      total: () => total.value,
      streaming: () => false,
      appear: true,
      requestFrame: null,
    })

    expect(pacer.revealed.value).toBe(5)
    expect(pacer.settled.value).toBe(5)
    expect(pacer.state.value).toBe('done')
    pacer.stop()
  })
})

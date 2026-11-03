import type { PacedText } from '../src/use-paced-text'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { usePacedText } from '../src/use-paced-text'

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
  }
}

function setup(initial = '', streaming = true) {
  const clock = createClock()
  const text = ref(initial)
  const live = ref(streaming)
  let paced!: PacedText
  const wrapper = mount(defineComponent({
    setup() {
      paced = usePacedText({ text: () => text.value, streaming: () => live.value, clock })
      return () => h('span', paced.shown.value)
    },
  }))
  return { clock, text, live, wrapper, paced: () => paced }
}

const THOUGHT = 'The prompt asks for a patternless number, so I should avoid anything an algorithm could predict. '

describe('usePacedText', () => {
  it('shows text that was already there at mount as it is', () => {
    const { paced } = setup(THOUGHT, false)

    expect(paced().shown.value).toBe(THOUGHT)
    expect(paced().pending.value).toBe(false)
  })

  it('paces the text a live body mounts with, since the host only mounts it once there is text', () => {
    const { clock, paced } = setup(THOUGHT, true)

    expect(paced().shown.value).toBe('')
    clock.advance(64)
    const early = paced().shown.value
    expect(early.length).toBeGreaterThan(0)
    expect(early.length).toBeLessThan(THOUGHT.length)
    clock.advance(1000)
    expect(paced().shown.value).toBe(THOUGHT)
  })

  it('releases a thought that arrived in one piece a little at a time, never all at once', async () => {
    const { clock, text, paced } = setup('', true)

    text.value = THOUGHT
    await nextTick()
    clock.advance(16)
    const first = paced().shown.value
    expect(first.length).toBeGreaterThan(0)
    expect(first.length).toBeLessThan(THOUGHT.length)

    clock.advance(160)
    const later = paced().shown.value
    expect(later.length).toBeGreaterThan(first.length)
    expect(later.length).toBeLessThan(THOUGHT.length)
    expect(paced().pending.value).toBe(true)
  })

  it('only ever shows a prefix of what arrived, so nothing is rewritten', async () => {
    const { clock, text, paced } = setup('', true)

    text.value = THOUGHT
    await nextTick()
    for (let frame = 0; frame < 60; frame++) {
      clock.advance(16)
      expect(THOUGHT.startsWith(paced().shown.value)).toBe(true)
    }
  })

  it('catches up within its lag bound however much arrives, so it never falls far behind', async () => {
    const { clock, text, paced } = setup('', true)
    const long = THOUGHT.repeat(12)

    text.value = long
    await nextTick()
    clock.advance(700)

    // maxLagMs is 600: a full burst is on screen shortly after that, not still crawling.
    expect(paced().shown.value).toBe(long)
    expect(paced().pending.value).toBe(false)
  })

  it('keeps the earlier part in place when more of the thought arrives', async () => {
    const { clock, text, paced } = setup('', true)

    text.value = THOUGHT
    await nextTick()
    clock.advance(1000)
    expect(paced().shown.value).toBe(THOUGHT)

    text.value = `${THOUGHT}Then I will pick digits with no structure. `
    await nextTick()
    clock.advance(16)
    const shown = paced().shown.value
    expect(shown.startsWith(THOUGHT)).toBe(true)
    expect(shown.length).toBeLessThan(text.value.length)
  })

  it('drains whatever is left when the step settles, then shows it all', async () => {
    const { clock, text, live, paced } = setup('', true)

    text.value = THOUGHT.repeat(3)
    await nextTick()
    clock.advance(16)
    expect(paced().pending.value).toBe(true)

    live.value = false
    await nextTick()
    clock.advance(500)

    expect(paced().shown.value).toBe(THOUGHT.repeat(3))
    expect(paced().pending.value).toBe(false)
  })

  it('shows everything on skip', async () => {
    const { clock, text, paced } = setup('', true)

    text.value = THOUGHT
    await nextTick()
    clock.advance(16)
    paced().skip()

    expect(paced().shown.value).toBe(THOUGHT)
  })

  it('cuts Chinese on word boundaries, not mid-character', async () => {
    const { clock, text, paced } = setup('', true)
    const thought = '我们需要先确认这个数字是否真的没有任何规律，然后再给出结论。'

    text.value = thought
    await nextTick()
    clock.advance(16)

    const shown = paced().shown.value
    expect(thought.startsWith(shown)).toBe(true)
    expect(shown.length).toBeGreaterThan(0)
    expect(shown.length).toBeLessThan(thought.length)
  })
})

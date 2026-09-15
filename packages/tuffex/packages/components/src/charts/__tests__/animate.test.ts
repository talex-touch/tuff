import type { Ref } from 'vue'
import type { TweenedNumbersOptions } from '../src/core/animate'
import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { cubicBezier, easings, prefersReducedMotion, tween, useTweenedNumbers } from '../src/core/animate'

const easingNames = ['linear', 'cubicIn', 'cubicOut', 'cubicInOut'] as const

// The setup file forces `prefers-reduced-motion: reduce` to match so component
// tests observe final geometry. These tests drive the query explicitly and
// restore whatever the host provided.
const originalMatchMedia = window.matchMedia
const wrappers: VueWrapper[] = []

function setReducedMotion(matches: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

function removeMatchMedia(): void {
  window.matchMedia = undefined as unknown as typeof window.matchMedia
}

/**
 * Frame clock whose timestamps the caller controls, so tween timing is asserted
 * against exact milliseconds instead of real elapsed time.
 */
function installFrameClock(): {
  advanceTo: (timestamp: number) => void
  pending: () => number
} {
  let nextId = 0
  const scheduled = new Map<number, FrameRequestCallback>()

  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    nextId += 1
    scheduled.set(nextId, callback)
    return nextId
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    scheduled.delete(id)
  })

  return {
    advanceTo(timestamp) {
      const due = [...scheduled.values()]
      scheduled.clear()
      due.forEach(callback => callback(timestamp))
    },
    pending: () => scheduled.size,
  }
}

function mountTweenedNumbers(
  source: Ref<number[]>,
  options: TweenedNumbersOptions = {},
): Ref<number[]> {
  let displayed!: Ref<number[]>
  const Probe = defineComponent({
    setup() {
      displayed = useTweenedNumbers(() => source.value, options)
      return () => h('div', displayed.value.join(','))
    },
  })
  wrappers.push(mount(Probe))
  return displayed
}

afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  window.matchMedia = originalMatchMedia
  vi.unstubAllGlobals()
})

describe('easings', () => {
  for (const name of easingNames) {
    it(`${name} maps 0 to 0 and 1 to 1`, () => {
      const ease = easings[name]
      expect(ease(0)).toBe(0)
      expect(ease(1)).toBe(1)
    })

    it(`${name} is monotonically non-decreasing across [0, 1]`, () => {
      const ease = easings[name]
      let previous = ease(0)
      for (let step = 1; step <= 100; step++) {
        const value = ease(step / 100)
        expect(value).toBeGreaterThanOrEqual(previous)
        previous = value
      }
    })
  }

  it('matches the closed form at the sampled points', () => {
    expect(easings.cubicIn(0.5)).toBe(0.125)
    expect(easings.cubicOut(0.5)).toBe(0.875)
    expect(easings.cubicInOut(0.25)).toBe(0.0625)
    expect(easings.cubicInOut(0.5)).toBe(0.5)
  })

  it('keeps cubicOut the mirror image of cubicIn', () => {
    for (let step = 0; step <= 20; step++) {
      const t = step / 20
      expect(easings.cubicOut(t)).toBeCloseTo(1 - easings.cubicIn(1 - t), 12)
    }
  })

  it('keeps cubicInOut symmetric about its midpoint', () => {
    for (let step = 0; step <= 20; step++) {
      const t = step / 20
      expect(easings.cubicInOut(1 - t)).toBeCloseTo(1 - easings.cubicInOut(t), 12)
    }
  })
})

describe('cubicBezier', () => {
  it('returns the exact endpoints', () => {
    const ease = cubicBezier(0.23, 1, 0.32, 1)
    expect(ease(0)).toBe(0)
    expect(ease(1)).toBe(1)
  })

  it('rises strictly and stays inside [0, 1] over the domain', () => {
    const ease = cubicBezier(0.23, 1, 0.32, 1)
    let previous = ease(0)
    for (let step = 1; step <= 100; step++) {
      const value = ease(step / 100)
      expect(value).toBeGreaterThan(previous)
      expect(value).toBeLessThanOrEqual(1)
      previous = value
    }
    expect(previous).toBe(1)
  })

  it('front-loads its progress like the tooltip curve it models', () => {
    const ease = cubicBezier(0.23, 1, 0.32, 1)
    expect(ease(0.5)).toBeGreaterThan(0.7)
    expect(ease(0.5)).toBeLessThan(1)
  })

  it('keeps the degenerate cubicBezier(1, 1, 0, 0) monotonic between its endpoints', () => {
    const ease = cubicBezier(1, 1, 0, 0)
    expect(ease(0)).toBe(0)
    expect(ease(1)).toBe(1)
    let previous = ease(0)
    for (let step = 1; step <= 100; step++) {
      const value = ease(step / 100)
      expect(value).toBeGreaterThanOrEqual(previous)
      previous = value
    }
  })
})

describe('tween', () => {
  it('applies the final frame synchronously when reduced motion is requested', () => {
    setReducedMotion(true)
    const clock = installFrameClock()
    const updates: number[] = []
    let completions = 0

    const cancel = tween({
      duration: 1000,
      onUpdate: (progress) => { updates.push(progress) },
      onComplete: () => { completions += 1 },
    })

    expect(updates).toEqual([1])
    expect(completions).toBe(1)
    expect(clock.pending()).toBe(0)

    cancel()
    cancel()
    expect(updates).toEqual([1])
    expect(completions).toBe(1)
  })

  it('applies the final frame immediately when the duration is not positive', () => {
    setReducedMotion(false)
    const clock = installFrameClock()
    const updates: number[] = []
    let completions = 0

    tween({
      duration: 0,
      onUpdate: (progress) => { updates.push(progress) },
      onComplete: () => { completions += 1 },
    })

    expect(updates).toEqual([1])
    expect(completions).toBe(1)
    expect(clock.pending()).toBe(0)
  })

  it('holds every update until the delay elapses, then reaches 1 exactly at the duration', () => {
    setReducedMotion(false)
    const clock = installFrameClock()
    const updates: number[] = []
    let completions = 0

    tween({
      duration: 1000,
      delay: 100,
      easing: easings.linear,
      onUpdate: (progress) => { updates.push(progress) },
      onComplete: () => { completions += 1 },
    })

    clock.advanceTo(1000)
    clock.advanceTo(1099)
    expect(updates).toEqual([])

    clock.advanceTo(1100)
    expect(updates).toEqual([0])

    clock.advanceTo(1600)
    expect(updates).toEqual([0, 0.5])

    clock.advanceTo(2099)
    expect(updates).toEqual([0, 0.5, 0.999])
    expect(completions).toBe(0)

    clock.advanceTo(2100)
    expect(updates).toEqual([0, 0.5, 0.999, 1])
    expect(completions).toBe(1)
    expect(clock.pending()).toBe(0)

    clock.advanceTo(3000)
    expect(updates).toEqual([0, 0.5, 0.999, 1])
    expect(completions).toBe(1)
  })

  it('stops updating and never completes once cancelled', () => {
    setReducedMotion(false)
    const clock = installFrameClock()
    const updates: number[] = []
    let completions = 0

    const cancel = tween({
      duration: 500,
      easing: easings.linear,
      onUpdate: (progress) => { updates.push(progress) },
      onComplete: () => { completions += 1 },
    })

    clock.advanceTo(1000)
    clock.advanceTo(1250)
    expect(updates).toEqual([0, 0.5])

    cancel()
    expect(clock.pending()).toBe(0)

    clock.advanceTo(1500)
    clock.advanceTo(2000)
    expect(updates).toEqual([0, 0.5])
    expect(completions).toBe(0)
  })
})

describe('prefersReducedMotion', () => {
  it('assumes reduced motion when the host has no matchMedia', () => {
    removeMatchMedia()
    expect(prefersReducedMotion()).toBe(true)
  })

  it('is true when the query matches', () => {
    setReducedMotion(true)
    expect(prefersReducedMotion()).toBe(true)
  })

  it('is false when the query does not match', () => {
    setReducedMotion(false)
    expect(prefersReducedMotion()).toBe(false)
  })
})

describe('useTweenedNumbers', () => {
  it('snapshots the source on mount without starting an update tween', async () => {
    setReducedMotion(false)
    const clock = installFrameClock()
    const source = ref([1, 2, 3])

    const displayed = mountTweenedNumbers(source, { duration: 500 })

    expect(displayed.value).toEqual([1, 2, 3])
    await nextTick()
    expect(displayed.value).toEqual([1, 2, 3])
    expect(clock.pending()).toBe(0)
  })

  it('starts no tween when the source changes to identical values', async () => {
    setReducedMotion(false)
    const clock = installFrameClock()
    const source = ref([1, 2, 3])

    const displayed = mountTweenedNumbers(source, { duration: 500 })
    source.value = [1, 2, 3]
    await nextTick()

    expect(displayed.value).toEqual([1, 2, 3])
    expect(clock.pending()).toBe(0)
  })

  it('animates from the previous values and settles exactly on the new ones', async () => {
    setReducedMotion(false)
    const clock = installFrameClock()
    const source = ref([1, 2, 3])

    const displayed = mountTweenedNumbers(source, { duration: 500 })
    source.value = [11, 22, 33]
    await nextTick()

    expect(clock.pending()).toBe(1)
    expect(displayed.value).toEqual([1, 2, 3])

    clock.advanceTo(1000)
    expect(displayed.value).toEqual([1, 2, 3])

    clock.advanceTo(1250)
    expect(displayed.value).toEqual([6, 12, 18])

    clock.advanceTo(1500)
    expect(displayed.value).toEqual([11, 22, 33])
    expect(clock.pending()).toBe(0)
  })

  it('jumps straight to the new values while disabled', async () => {
    setReducedMotion(false)
    const clock = installFrameClock()
    const source = ref([1, 2, 3])
    let enabled = true

    const displayed = mountTweenedNumbers(source, { duration: 500, enabled: () => enabled })
    enabled = false
    source.value = [11, 22, 33]
    await nextTick()

    expect(displayed.value).toEqual([11, 22, 33])
    expect(clock.pending()).toBe(0)
  })

  it('animates existing indices from their previous values and new ones from enter()', async () => {
    setReducedMotion(false)
    const clock = installFrameClock()
    const source = ref([1, 2])

    const displayed = mountTweenedNumbers(source, {
      duration: 500,
      enter: (index, target) => (index === 2 ? 0 : target),
    })
    expect(displayed.value).toEqual([1, 2])

    source.value = [10, 20, 30]
    await nextTick()
    expect(clock.pending()).toBe(1)

    clock.advanceTo(1000)
    expect(displayed.value).toEqual([1, 2, 0])

    clock.advanceTo(1250)
    expect(displayed.value).toEqual([5.5, 11, 15])

    clock.advanceTo(1500)
    expect(displayed.value).toEqual([10, 20, 30])
    expect(clock.pending()).toBe(0)
  })
})

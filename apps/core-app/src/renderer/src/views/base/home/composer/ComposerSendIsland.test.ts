// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COMPOSER_MOTION } from './composer-motion'
import ComposerSendIsland from './ComposerSendIsland.vue'

vi.mock('~/components/shell/MetaHintBadge.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    default: defineComponent({
      props: { command: String, placement: String },
      setup: (props) => () => h('span', { class: 'hint-stub', 'data-command': props.command })
    })
  }
})

interface AnimateCall {
  target: Element
  keyframes: Record<string, unknown>[]
  options: KeyframeAnimationOptions
  cancel: ReturnType<typeof vi.fn>
}

let calls: AnimateCall[] = []
let reduced = false
let now = 0

beforeEach(() => {
  calls = []
  reduced = false
  now = 0
  vi.useFakeTimers()
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  Element.prototype.animate = function (this: Element, keyframes, options) {
    const cancel = vi.fn()
    calls.push({
      target: this,
      keyframes: keyframes as Record<string, unknown>[],
      options: options as KeyframeAnimationOptions,
      cancel
    })
    return { cancel, onfinish: null } as unknown as Animation
  }
  window.matchMedia = ((query: string) => ({
    matches: reduced && query.includes('reduce'),
    media: query
  })) as unknown as typeof window.matchMedia
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  // @ts-expect-error jsdom ships no WAAPI; the stub is removed again.
  delete Element.prototype.animate
})

/** Advances the fake clock and the timers together, so `performance.now()` agrees with them. */
async function advance(ms: number): Promise<void> {
  now += ms
  vi.advanceTimersByTime(ms)
  await nextTick()
}

function mountIsland(state: string): VueWrapper {
  return mount(ComposerSendIsland, {
    props: {
      state: state as never,
      sendLabel: 'Send',
      stopLabel: 'Stop generating',
      stopText: 'Stop'
    },
    attachTo: document.body
  })
}

function callsOn(wrapper: VueWrapper, selector: string): AnimateCall[] {
  const element = selector ? wrapper.get(selector).element : wrapper.element
  return calls.filter((call) => call.target === element)
}

function widthCalls(wrapper: VueWrapper): AnimateCall[] {
  return callsOn(wrapper, '').filter((call) => 'width' in (call.keyframes[0] ?? {}))
}

/**
 * jsdom runs no animations, so a half-way frame is staged: `getComputedStyle` answers these values
 * for the matching element, as a browser does for one caught mid-animation.
 */
function stageFrame(wrapper: VueWrapper, selector: string, frame: Record<string, string>): void {
  const element = wrapper.get(selector).element
  const real = window.getComputedStyle.bind(window)
  vi.spyOn(window, 'getComputedStyle').mockImplementation((target, pseudo) =>
    target === element
      ? ({ getPropertyValue: (name: string) => frame[name] ?? '' } as CSSStyleDeclaration)
      : real(target, pseudo)
  )
}

/** T3 as the page drives it: launch at the press, the draft clears, the turn starts. */
async function launchIntoWaiting(wrapper: VueWrapper): Promise<void> {
  ;(wrapper.vm as unknown as { launch: () => void }).launch()
  await wrapper.setProps({ state: 'empty' })
  await wrapper.setProps({ state: 'waiting' })
}

describe('ComposerSendIsland', () => {
  it('is a circle that sends, and a capsule that stops', async () => {
    const wrapper = mountIsland('ready')
    expect(wrapper.attributes('data-shape')).toBe('circle')
    expect(wrapper.attributes('aria-label')).toBe('Send')
    expect(wrapper.attributes('aria-disabled')).toBeUndefined()
    await wrapper.trigger('click')
    expect(wrapper.emitted('send')).toHaveLength(1)

    const capsule = mountIsland('streaming')
    expect(capsule.attributes('data-shape')).toBe('capsule')
    expect(capsule.attributes('aria-label')).toBe('Stop generating')
    expect(capsule.classes()).toContain('is-bloomed')
    await capsule.trigger('click')
    expect(capsule.emitted('stop')).toHaveLength(1)
    wrapper.unmount()
    capsule.unmount()
  })

  it('keeps an empty key focusable but inert to clicks', async () => {
    const wrapper = mountIsland('empty')
    expect(wrapper.attributes('aria-disabled')).toBe('true')
    expect(wrapper.attributes('disabled')).toBeUndefined()
    await wrapper.trigger('click')
    expect(wrapper.emitted('send')).toBeUndefined()
    wrapper.unmount()
  })

  it('launches on the press: arrow up and out, mic yields, then grow at 40, ink at 60, bloom at 120', async () => {
    const wrapper = mountIsland('ready')
    ;(wrapper.vm as unknown as { launch: () => void }).launch()
    await nextTick()

    expect(wrapper.emitted('yield')).toEqual([[true]])
    expect(wrapper.classes()).toContain('is-arrow-hidden')
    const arrowExit = callsOn(wrapper, '.ComposerSendIsland-Arrow')[0]!
    expect(arrowExit.keyframes.at(-1)).toMatchObject({
      opacity: 0,
      translate: `0 -${COMPOSER_MOTION.glyphOut.risePx}px`
    })
    expect(arrowExit.options.duration).toBe(COMPOSER_MOTION.glyphOut.ms)

    // The send clears the draft a flush before the turn starts; the key must not grey on the way.
    await wrapper.setProps({ state: 'empty' })
    expect(wrapper.attributes('data-tone')).toBe('primary')
    await wrapper.setProps({ state: 'waiting' })

    await advance(COMPOSER_MOTION.capsule.growDelayMs - 1)
    expect(widthCalls(wrapper)).toHaveLength(0)
    expect(wrapper.attributes('data-shape')).toBe('circle')
    await advance(1)
    expect(wrapper.attributes('data-shape')).toBe('capsule')
    expect(widthCalls(wrapper)[0]!.keyframes).toEqual([{ width: '32px' }, { width: '72px' }])

    await advance(COMPOSER_MOTION.capsule.toneDelayMs - COMPOSER_MOTION.capsule.growDelayMs)
    expect(wrapper.attributes('data-tone')).toBe('ink')
    expect(wrapper.classes()).toContain('is-morphing')

    await advance(COMPOSER_MOTION.stopBloom.delayMs - COMPOSER_MOTION.capsule.toneDelayMs - 1)
    expect(wrapper.classes()).not.toContain('is-bloomed')
    await advance(1)
    expect(wrapper.classes()).toContain('is-bloomed')
    const bloom = callsOn(wrapper, '.ComposerSendIsland-Stop')
    expect(
      bloom.some((call) => call.keyframes[0]?.scale === COMPOSER_MOTION.stopBloom.fromScale)
    ).toBe(true)
    wrapper.unmount()
  })

  it('never shows the stop label for a turn that ends inside 120ms (T7)', async () => {
    const wrapper = mountIsland('ready')
    ;(wrapper.vm as unknown as { launch: () => void }).launch()
    await wrapper.setProps({ state: 'empty' })
    await wrapper.setProps({ state: 'waiting' })
    await advance(80)
    expect(wrapper.attributes('data-shape')).toBe('capsule')

    await wrapper.setProps({ state: 'empty' })
    await advance(600)
    expect(wrapper.classes()).not.toContain('is-bloomed')
    const stopCalls = callsOn(wrapper, '.ComposerSendIsland-Stop')
    expect(stopCalls.every((call) => call.keyframes.at(-1)?.opacity !== 1)).toBe(true)
    // It opened a little and closed again: the width went back from where it was.
    expect(widthCalls(wrapper).at(-1)!.keyframes.at(-1)).toEqual({ width: '32px' })
    expect(wrapper.attributes('data-shape')).toBe('circle')
    expect(wrapper.classes()).not.toContain('is-arrow-hidden')
    expect(wrapper.emitted('yield')).toEqual([[true], [false]])
    wrapper.unmount()
  })

  it('folds back when the reply ends: label out, width at 45, mic back at 160 (T5)', async () => {
    const wrapper = mountIsland('streaming')
    await wrapper.setProps({ state: 'ready' })
    const fold = callsOn(wrapper, '.ComposerSendIsland-Stop')[0]!
    expect(fold.keyframes.at(-1)).toMatchObject({
      opacity: 0,
      scale: COMPOSER_MOTION.stopFold.toScale
    })
    expect(wrapper.classes()).not.toContain('is-bloomed')

    await advance(COMPOSER_MOTION.capsule.retractDelayMs - 1)
    expect(widthCalls(wrapper)).toHaveLength(0)
    await advance(1)
    expect(widthCalls(wrapper)[0]!.keyframes).toEqual([{ width: '72px' }, { width: '32px' }])
    expect(wrapper.attributes('data-tone')).toBe('primary')
    // The arrow re-arms from below.
    const rearm = callsOn(wrapper, '.ComposerSendIsland-Arrow')
    expect(
      rearm.some((call) => call.keyframes[0]?.translate === `0 ${COMPOSER_MOTION.glyphIn.fromPx}px`)
    ).toBe(true)

    expect(wrapper.emitted('yield')).toBeUndefined()
    await advance(COMPOSER_MOTION.micYield.backDelayMs - COMPOSER_MOTION.capsule.retractDelayMs)
    expect(wrapper.emitted('yield')).toEqual([[false]])
    wrapper.unmount()
  })

  it('ticks the square once when the first token lands (T4)', async () => {
    const wrapper = mountIsland('waiting')
    await wrapper.setProps({ state: 'streaming' })
    const tick = callsOn(wrapper, '.ComposerSendIsland-Square')
    expect(tick).toHaveLength(1)
    expect(tick[0]!.keyframes.map((frame) => frame.scale)).toEqual([
      1,
      COMPOSER_MOTION.firstTokenTick.scale,
      1
    ])
    // Blocked and back is the ring's business, not a second tick.
    await wrapper.setProps({ state: 'blocked' })
    await wrapper.setProps({ state: 'streaming' })
    expect(callsOn(wrapper, '.ComposerSendIsland-Square')).toHaveLength(1)
    wrapper.unmount()
  })

  it('wakes with the first character and greys without a bounce (T1 / T2)', async () => {
    const wrapper = mountIsland('empty')
    await wrapper.setProps({ state: 'ready' })
    expect(wrapper.attributes('data-tone')).toBe('primary')
    expect(wrapper.classes()).toContain('is-morphing')
    const wake = callsOn(wrapper, '.ComposerSendIsland-Skin')
    expect(wake[0]!.keyframes).toEqual([{ scale: COMPOSER_MOTION.wake.fromScale }, { scale: 1 }])

    await wrapper.setProps({ state: 'empty' })
    expect(wrapper.attributes('data-tone')).toBe('neutral')
    expect(callsOn(wrapper, '.ComposerSendIsland-Skin')).toHaveLength(1)
    await advance(COMPOSER_MOTION.tone.circleMs + 40)
    expect(wrapper.classes()).not.toContain('is-morphing')
    wrapper.unmount()
  })

  it('puts the arrow back when a launch is not followed by a turn', async () => {
    const wrapper = mountIsland('ready')
    ;(wrapper.vm as unknown as { launch: () => void }).launch()
    await nextTick()
    expect(wrapper.classes()).toContain('is-arrow-hidden')
    await advance(COMPOSER_MOTION.launchSettleMs)
    expect(wrapper.classes()).not.toContain('is-arrow-hidden')
    expect(wrapper.emitted('yield')).toEqual([[true], [false]])
    wrapper.unmount()
  })

  it('folds a bloom cut short from its half-open frame, never flashing it full first', async () => {
    const wrapper = mountIsland('ready')
    await launchIntoWaiting(wrapper)
    await advance(COMPOSER_MOTION.stopBloom.delayMs)
    expect(wrapper.classes()).toContain('is-bloomed')

    // The turn fails 60ms into the bloom: 「■ 停止」 is still coming up.
    stageFrame(wrapper, '.ComposerSendIsland-Stop', { opacity: '0.4', scale: '0.8' })
    await wrapper.setProps({ state: 'empty' })
    const fold = callsOn(wrapper, '.ComposerSendIsland-Stop').at(-1)!
    expect(fold.keyframes).toEqual([
      { opacity: '0.4', scale: '0.8' },
      { opacity: 0, scale: COMPOSER_MOTION.stopFold.toScale }
    ])
    wrapper.unmount()
  })

  it('turns an arrow still leaving back from where it is, at once (T7)', async () => {
    const wrapper = mountIsland('ready')
    await launchIntoWaiting(wrapper)
    await advance(30)
    stageFrame(wrapper, '.ComposerSendIsland-Arrow', { opacity: '0.7', translate: '0px -3px' })
    await wrapper.setProps({ state: 'empty' })

    const back = callsOn(wrapper, '.ComposerSendIsland-Arrow').slice(-2)
    expect(back.map((call) => call.keyframes[0])).toEqual([
      { translate: '0px -3px' },
      { opacity: '0.7' }
    ])
    // No wait for a fold that never happened: it does not vanish to re-arm from below.
    expect(back.map((call) => call.options.delay)).toEqual([0, 0])
    wrapper.unmount()
  })

  it('lets the waiting breath go to full from where it was when the first token lands (T4)', async () => {
    const wrapper = mountIsland('waiting')
    stageFrame(wrapper, '.ComposerSendIsland-RingPulse', { opacity: '0.62' })
    await wrapper.setProps({ state: 'streaming' })
    const release = callsOn(wrapper, '.ComposerSendIsland-RingPulse')
    expect(release).toHaveLength(1)
    expect(release[0]!.keyframes).toEqual([{ opacity: '0.62' }, { opacity: 1 }])
    expect(release[0]!.options.duration).toBe(COMPOSER_MOTION.ring.settleMs)
    wrapper.unmount()
  })

  it('lands every state at once under reduced motion, without a single animation', async () => {
    reduced = true
    const wrapper = mountIsland('ready')
    ;(wrapper.vm as unknown as { launch: () => void }).launch()
    await wrapper.setProps({ state: 'empty' })
    await wrapper.setProps({ state: 'waiting' })
    expect(wrapper.attributes('data-shape')).toBe('capsule')
    expect(wrapper.attributes('data-tone')).toBe('ink')
    expect(wrapper.classes()).toContain('is-bloomed')
    expect(wrapper.emitted('yield')).toEqual([[true]])

    await wrapper.setProps({ state: 'streaming' })
    await wrapper.setProps({ state: 'ready' })
    expect(wrapper.attributes('data-shape')).toBe('circle')
    expect(wrapper.classes()).not.toContain('is-bloomed')
    expect(wrapper.classes()).not.toContain('is-arrow-hidden')
    expect(wrapper.emitted('yield')).toEqual([[true], [false]])

    await wrapper.trigger('pointerdown', { button: 0 })
    await advance(1000)
    expect(calls).toHaveLength(0)
    wrapper.unmount()
  })
})

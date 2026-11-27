// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick, ref } from 'vue'
import {
  installLiveAnimationClock,
  LIVE_ANIM_ATTR,
  LIVE_ANIM_CLOCK_ATTR,
  LIVE_ANIM_DEFAULT_DURATION_MS,
  LIVE_ANIM_DEFAULT_STEPS,
  LIVE_ANIM_DURATION_ATTR,
  LIVE_ANIM_PAUSED_ATTR,
  LIVE_ANIM_STAGGER_ATTR,
  LIVE_ANIM_STEPS_ATTR,
  LOW_BATTERY_MOTION_ATTR,
  useLiveAnimation
} from './live-animation-clock'

interface MockAnimation {
  keyframes: Keyframe[] | PropertyIndexedKeyframes | null
  options: KeyframeAnimationOptions | number | undefined
  startTime: number | null
  playState: AnimationPlayState
  cancel: ReturnType<typeof vi.fn>
  pause: ReturnType<typeof vi.fn>
  play: ReturnType<typeof vi.fn>
}

interface MatchMediaMockController {
  setMatches: (next: boolean) => void
  listenerCount: () => number
  restore: () => void
}

function installMatchMediaMock(initialMatches = false): MatchMediaMockController {
  const original = window.matchMedia
  let matches = initialMatches
  const listeners = new Set<(event: MediaQueryListEvent) => void>()

  const mql = {
    media: '(prefers-reduced-motion: reduce)',
    get matches() {
      return matches
    },
    onchange: null,
    addEventListener: vi.fn((type: string, cb: (event: MediaQueryListEvent) => void) => {
      if (type === 'change') listeners.add(cb)
    }),
    removeEventListener: vi.fn((type: string, cb: (event: MediaQueryListEvent) => void) => {
      if (type === 'change') listeners.delete(cb)
    }),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn()
  } as unknown as MediaQueryList

  window.matchMedia = vi.fn().mockReturnValue(mql)

  return {
    setMatches(next: boolean) {
      matches = next
      const event = { matches: next, media: mql.media } as MediaQueryListEvent
      for (const listener of Array.from(listeners)) {
        listener(event)
      }
    },
    listenerCount: () => listeners.size,
    restore() {
      window.matchMedia = original
    }
  }
}

function installElementAnimateMock() {
  const original = Element.prototype.animate
  const created: Array<{ el: HTMLElement; animation: MockAnimation }> = []

  const animateSpy = vi.fn(function (
    this: HTMLElement,
    keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
    options?: KeyframeAnimationOptions | number
  ) {
    const animation: MockAnimation = {
      keyframes,
      options,
      startTime: 12345, // non-zero sentinel to verify controller resets startTime = 0
      playState: 'running',
      cancel: vi.fn(() => {
        animation.playState = 'idle'
      }),
      pause: vi.fn(() => {
        animation.playState = 'paused'
      }),
      play: vi.fn(() => {
        animation.playState = 'running'
      })
    }
    created.push({ el: this, animation })
    return animation as unknown as Animation
  })

  Element.prototype.animate = animateSpy as unknown as typeof Element.prototype.animate

  return {
    animateSpy,
    created,
    restore() {
      Element.prototype.animate = original
    }
  }
}

function setDocumentHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    value: hidden
  })
  document.dispatchEvent(new Event('visibilitychange'))
}

async function flushMutations(): Promise<void> {
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('live-animation-clock', () => {
  let matchMediaMock: MatchMediaMockController
  let animateMock: ReturnType<typeof installElementAnimateMock>

  beforeEach(() => {
    document.body.innerHTML = ''
    document.documentElement.removeAttribute(LOW_BATTERY_MOTION_ATTR)
    document.documentElement.removeAttribute(LIVE_ANIM_CLOCK_ATTR)
    setDocumentHidden(false)
    matchMediaMock = installMatchMediaMock(false)
    animateMock = installElementAnimateMock()
  })

  afterEach(() => {
    animateMock.restore()
    matchMediaMock.restore()
    document.body.innerHTML = ''
    document.documentElement.removeAttribute(LOW_BATTERY_MOTION_ATTR)
    document.documentElement.removeAttribute(LIVE_ANIM_CLOCK_ATTR)
    setDocumentHidden(false)
  })

  it('attaches phase-locked stepped WAAPI animations with startTime = 0 and low-FPS steps', () => {
    const container = document.createElement('div')
    const dotA = document.createElement('span')
    dotA.setAttribute(LIVE_ANIM_ATTR, 'dot')
    const dotB = document.createElement('span')
    dotB.setAttribute(LIVE_ANIM_ATTR, 'dot')
    dotB.setAttribute(LIVE_ANIM_STAGGER_ATTR, '1')
    const spinner = document.createElement('span')
    spinner.setAttribute(LIVE_ANIM_ATTR, 'spin')

    container.append(dotA, dotB, spinner)
    document.body.appendChild(container)

    const clock = installLiveAnimationClock(container)

    expect(container.getAttribute(LIVE_ANIM_CLOCK_ATTR)).toBe('active')
    expect(clock.activeCount()).toBe(3)
    expect(animateMock.created).toHaveLength(3)

    const [entryA, entryB, entrySpin] = animateMock.created
    expect(entryA.animation.startTime).toBe(0)
    expect(entryB.animation.startTime).toBe(0)
    expect(entrySpin.animation.startTime).toBe(0)

    const optsA = entryA.animation.options as KeyframeAnimationOptions
    expect(optsA.easing).toBe(`steps(${LIVE_ANIM_DEFAULT_STEPS})`)
    expect(optsA.duration).toBe(LIVE_ANIM_DEFAULT_DURATION_MS)
    expect(optsA.iterations).toBe(Number.POSITIVE_INFINITY)
    expect(optsA.delay).toBe(0)

    // Staggered dot shifts by an exact multiple of the 90ms step grid (-180ms) while keeping startTime = 0.
    const optsB = entryB.animation.options as KeyframeAnimationOptions
    expect(optsB.easing).toBe(`steps(${LIVE_ANIM_DEFAULT_STEPS})`)
    expect(optsB.delay).toBe(-180)

    // Spinner runs on 12 steps × 90ms = 1080ms (~11.1fps), sharing the same 90ms tick grid.
    const optsSpin = entrySpin.animation.options as KeyframeAnimationOptions
    expect(optsSpin.easing).toBe('steps(12)')
    expect(optsSpin.duration).toBe(1080)

    clock.dispose()
    expect(container.hasAttribute(LIVE_ANIM_CLOCK_ATTR)).toBe(false)
    expect(clock.activeCount()).toBe(0)
    expect(entryA.animation.cancel).toHaveBeenCalledTimes(1)
    expect(entryB.animation.cancel).toHaveBeenCalledTimes(1)
    expect(entrySpin.animation.cancel).toHaveBeenCalledTimes(1)
  })

  it('honors custom step budget via options and per-element attributes', () => {
    const container = document.createElement('div')
    const pulse = document.createElement('span')
    pulse.setAttribute(LIVE_ANIM_ATTR, 'pulse')
    const custom = document.createElement('span')
    custom.setAttribute(LIVE_ANIM_ATTR, 'pulse')
    custom.setAttribute(LIVE_ANIM_STEPS_ATTR, '20')
    custom.setAttribute(LIVE_ANIM_DURATION_ATTR, '2000')

    container.append(pulse, custom)
    document.body.appendChild(container)

    const clock = installLiveAnimationClock(container, { targetFps: 10 })

    const optsPulse = animateMock.created[0].animation.options as KeyframeAnimationOptions
    expect(optsPulse.easing).toBe('steps(14)') // round(1.44s * 10fps) = 14

    const optsCustom = animateMock.created[1].animation.options as KeyframeAnimationOptions
    expect(optsCustom.easing).toBe('steps(20)')
    expect(optsCustom.duration).toBe(2000)

    clock.dispose()
  })

  it('suppresses animations under prefers-reduced-motion: reduce and reacts to live preference changes', () => {
    matchMediaMock.setMatches(true)

    const container = document.createElement('div')
    const el = document.createElement('span')
    el.setAttribute(LIVE_ANIM_ATTR, 'pulse')
    container.appendChild(el)
    document.body.appendChild(container)

    const clock = installLiveAnimationClock(container)
    expect(clock.isSuppressed()).toBe(true)
    expect(clock.activeCount()).toBe(0)
    expect(animateMock.created).toHaveLength(0)

    // User turns off reduced motion -> clock attaches phase-locked animation.
    matchMediaMock.setMatches(false)
    expect(clock.isSuppressed()).toBe(false)
    expect(clock.activeCount()).toBe(1)
    expect(animateMock.created).toHaveLength(1)
    expect(animateMock.created[0].animation.startTime).toBe(0)

    // User re-enables reduced motion -> clock cancels active animations back to static resting state.
    matchMediaMock.setMatches(true)
    expect(clock.isSuppressed()).toBe(true)
    expect(clock.activeCount()).toBe(0)
    expect(animateMock.created[0].animation.cancel).toHaveBeenCalledTimes(1)

    clock.dispose()
    expect(matchMediaMock.listenerCount()).toBe(0)
  })

  it('pauses active animations when document.hidden becomes true and re-locks startTime = 0 on resume', () => {
    const container = document.createElement('div')
    const el = document.createElement('span')
    el.setAttribute(LIVE_ANIM_ATTR, 'pulse')
    container.appendChild(el)
    document.body.appendChild(container)

    const clock = installLiveAnimationClock(container)
    expect(clock.activeCount()).toBe(1)
    const anim = animateMock.created[0].animation

    setDocumentHidden(true)
    expect(clock.isPaused()).toBe(true)
    expect(anim.pause).toHaveBeenCalledTimes(1)

    // Simulate WAAPI shifting startTime if resumed without re-locking.
    anim.startTime = 99999
    setDocumentHidden(false)
    expect(clock.isPaused()).toBe(false)
    expect(anim.play).toHaveBeenCalledTimes(1)
    expect(anim.startTime).toBe(0)

    clock.dispose()
  })

  it('does not start animations for elements mounted while document.hidden is true until visible', async () => {
    setDocumentHidden(true)
    const container = document.createElement('div')
    document.body.appendChild(container)

    const clock = installLiveAnimationClock(container)

    const el = document.createElement('span')
    el.setAttribute(LIVE_ANIM_ATTR, 'pulse')
    container.appendChild(el)
    await flushMutations()

    expect(clock.activeCount()).toBe(0)
    expect(animateMock.created).toHaveLength(0)

    setDocumentHidden(false)
    expect(clock.activeCount()).toBe(1)
    expect(animateMock.created).toHaveLength(1)
    expect(animateMock.created[0].animation.startTime).toBe(0)

    clock.dispose()
  })

  it('cancels and restores animations when html[data-low-battery-motion="1"] toggles', async () => {
    const container = document.createElement('div')
    const el = document.createElement('span')
    el.setAttribute(LIVE_ANIM_ATTR, 'breathe')
    container.appendChild(el)
    document.body.appendChild(container)

    const clock = installLiveAnimationClock(container)
    expect(clock.activeCount()).toBe(1)
    const firstAnim = animateMock.created[0].animation

    document.documentElement.setAttribute(LOW_BATTERY_MOTION_ATTR, '1')
    await flushMutations()
    expect(clock.isSuppressed()).toBe(true)
    expect(clock.activeCount()).toBe(0)
    expect(firstAnim.cancel).toHaveBeenCalledTimes(1)

    document.documentElement.removeAttribute(LOW_BATTERY_MOTION_ATTR)
    await flushMutations()
    expect(clock.isSuppressed()).toBe(false)
    expect(clock.activeCount()).toBe(1)
    expect(animateMock.created[1].animation.startTime).toBe(0)

    clock.dispose()
  })

  it('handles dynamic DOM add, attribute mutation, pause attribute, and subtree removal cleanly', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    const clock = installLiveAnimationClock(container)
    expect(clock.activeCount()).toBe(0)

    // Dynamic subtree insertion
    const wrapper = document.createElement('div')
    const indicator = document.createElement('span')
    indicator.setAttribute(LIVE_ANIM_ATTR, 'pulse')
    wrapper.appendChild(indicator)
    container.appendChild(wrapper)
    await flushMutations()

    expect(clock.activeCount()).toBe(1)
    const firstAnim = animateMock.created[0].animation
    expect(firstAnim.startTime).toBe(0)

    // Preset switch cancels old animation and creates new phase-locked animation
    indicator.setAttribute(LIVE_ANIM_ATTR, 'spin')
    await flushMutations()
    expect(firstAnim.cancel).toHaveBeenCalledTimes(1)
    expect(clock.activeCount()).toBe(1)
    const spinAnim = animateMock.created[1].animation
    expect((spinAnim.options as KeyframeAnimationOptions).easing).toBe('steps(12)')
    expect(spinAnim.startTime).toBe(0)

    // Per-element pause attribute cancels immediately
    indicator.setAttribute(LIVE_ANIM_PAUSED_ATTR, 'true')
    await flushMutations()
    expect(spinAnim.cancel).toHaveBeenCalledTimes(1)
    expect(clock.activeCount()).toBe(0)

    // Clearing pause attribute re-attaches phase-locked animation
    indicator.removeAttribute(LIVE_ANIM_PAUSED_ATTR)
    await flushMutations()
    expect(clock.activeCount()).toBe(1)
    const resumedAnim = animateMock.created[2].animation

    // Removing the ancestor wrapper cleans up the nested indicator with zero leaks
    wrapper.remove()
    await flushMutations()
    expect(resumedAnim.cancel).toHaveBeenCalledTimes(1)
    expect(clock.activeCount()).toBe(0)

    clock.dispose()
    // Double dispose is idempotent
    expect(() => clock.dispose()).not.toThrow()
  })

  it('degrades gracefully with zero errors when Element.prototype.animate is unavailable', async () => {
    const container = document.createElement('div')
    const el = document.createElement('span')
    el.setAttribute(LIVE_ANIM_ATTR, 'pulse')
    container.appendChild(el)
    document.body.appendChild(container)

    // Simulate plain jsdom where Element.prototype.animate is undefined
    // @ts-expect-error testing missing WAAPI runtime
    Element.prototype.animate = undefined

    const clock = installLiveAnimationClock(container)
    expect(container.getAttribute(LIVE_ANIM_CLOCK_ATTR)).toBe('unsupported')
    expect(clock.activeCount()).toBe(0)

    setDocumentHidden(true)
    setDocumentHidden(false)
    clock.pause()
    clock.resume()
    clock.refresh()

    const extra = document.createElement('span')
    extra.setAttribute(LIVE_ANIM_ATTR, 'dot')
    container.appendChild(extra)
    await flushMutations()

    expect(clock.activeCount()).toBe(0)
    expect(() => clock.dispose()).not.toThrow()
    expect(container.hasAttribute(LIVE_ANIM_CLOCK_ATTR)).toBe(false)
  })

  it('supports Vue useLiveAnimation both standalone and under an active host clock without duplicate animations', async () => {
    const TestDot = defineComponent({
      props: {
        active: { type: Boolean, default: true }
      },
      setup(props) {
        const dotRef = ref<HTMLElement | null>(null)
        useLiveAnimation(dotRef, {
          preset: 'pulse',
          active: () => props.active
        })
        return { dotRef }
      },
      template: '<span ref="dotRef" class="test-dot" />'
    })

    // Standalone (no host clock): composable drives its own stepped WAAPI clock
    const standalone = mount(TestDot, { attachTo: document.body })
    await nextTick()
    expect(standalone.element.getAttribute(LIVE_ANIM_ATTR)).toBe('pulse')
    expect(animateMock.created).toHaveLength(1)
    expect(animateMock.created[0].animation.startTime).toBe(0)

    await standalone.setProps({ active: false })
    await nextTick()
    expect(standalone.element.hasAttribute(LIVE_ANIM_ATTR)).toBe(false)
    expect(animateMock.created[0].animation.cancel).toHaveBeenCalledTimes(1)
    standalone.unmount()

    // Under a host clock: delegates cleanly via attributes without spawning a second animation
    const host = document.createElement('div')
    document.body.appendChild(host)
    const hostClock = installLiveAnimationClock(host)

    const beforeCount = animateMock.created.length
    const hosted = mount(TestDot, { attachTo: host })
    await nextTick()
    await flushMutations()

    expect(hostClock.activeCount()).toBe(1)
    expect(animateMock.created.length - beforeCount).toBe(1)

    hosted.unmount()
    await flushMutations()
    expect(hostClock.activeCount()).toBe(0)
    hostClock.dispose()
  })

  it('drives multi-dot staggered indicator trees in lockstep and releases them when switched static or unmounted', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const clock = installLiveAnimationClock(host)

    const wrapper = mount(
      {
        props: {
          active: { type: Boolean, default: true }
        },
        template: `
          <div class="indicator-dots">
            <span :data-live-anim="active ? 'dot' : undefined" />
            <span :data-live-anim="active ? 'dot' : undefined" data-live-anim-stagger="1" />
            <span :data-live-anim="active ? 'dot' : undefined" data-live-anim-stagger="2" />
          </div>
        `
      },
      {
        props: { active: true },
        attachTo: host
      }
    )
    await nextTick()
    await flushMutations()

    expect(clock.activeCount()).toBe(3)
    const [dot0, dot1, dot2] = animateMock.created.slice(-3)
    expect(dot0.animation.startTime).toBe(0)
    expect(dot1.animation.startTime).toBe(0)
    expect(dot2.animation.startTime).toBe(0)
    expect((dot0.animation.options as KeyframeAnimationOptions).delay).toBe(0)
    expect((dot1.animation.options as KeyframeAnimationOptions).delay).toBe(-180)
    expect((dot2.animation.options as KeyframeAnimationOptions).delay).toBe(-360)
    expect((dot0.animation.options as KeyframeAnimationOptions).easing).toBe(
      `steps(${LIVE_ANIM_DEFAULT_STEPS})`
    )

    await wrapper.setProps({ active: false })
    await nextTick()
    await flushMutations()
    expect(clock.activeCount()).toBe(0)
    expect(dot0.animation.cancel).toHaveBeenCalledTimes(1)
    expect(dot1.animation.cancel).toHaveBeenCalledTimes(1)
    expect(dot2.animation.cancel).toHaveBeenCalledTimes(1)

    await wrapper.setProps({ active: true })
    await nextTick()
    await flushMutations()
    expect(clock.activeCount()).toBe(3)

    wrapper.unmount()
    await flushMutations()
    expect(clock.activeCount()).toBe(0)
    clock.dispose()
  })
})

// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COMPOSER_MOTION } from './composer-motion'
import ComposerMic from './ComposerMic.vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

interface AnimateCall {
  target: Element
  keyframes: Record<string, unknown>[]
}

let calls: AnimateCall[] = []
let reduced = false

beforeEach(() => {
  calls = []
  reduced = false
  vi.useFakeTimers()
  Element.prototype.animate = function (this: Element, keyframes) {
    calls.push({ target: this, keyframes: keyframes as Record<string, unknown>[] })
    return { cancel: vi.fn(), onfinish: null } as unknown as Animation
  }
  window.matchMedia = ((query: string) => ({
    matches: reduced && query.includes('reduce'),
    media: query
  })) as unknown as typeof window.matchMedia
})

afterEach(() => {
  vi.useRealTimers()
  // @ts-expect-error jsdom ships no WAAPI; the stub is removed again.
  delete Element.prototype.animate
})

const silence = new Array<number>(COMPOSER_MOTION.mic.levelHistory).fill(0)

function mountMic(props: Record<string, unknown> = {}): VueWrapper {
  return mount(ComposerMic, {
    props: { state: 'idle', levels: silence, elapsedMs: 0, ...props },
    attachTo: document.body
  })
}

async function advance(ms: number): Promise<void> {
  vi.advanceTimersByTime(ms)
  await nextTick()
}

function button(wrapper: VueWrapper) {
  return wrapper.get('button.ComposerMic')
}

describe('ComposerMic', () => {
  it('names and presses per state, and ignores a click while recognizing', async () => {
    const wrapper = mountMic()
    expect(button(wrapper).attributes('aria-pressed')).toBe('false')
    expect(button(wrapper).attributes('aria-label')).toBe('home.voice')
    await button(wrapper).trigger('click')
    expect(wrapper.emitted('toggle')).toHaveLength(1)

    await wrapper.setProps({ state: 'starting' })
    expect(button(wrapper).attributes('aria-pressed')).toBe('true')
    expect(button(wrapper).attributes('aria-label')).toBe('home.composer.dictationStop')
    expect(button(wrapper).attributes('aria-busy')).toBe('true')

    await wrapper.setProps({ state: 'listening' })
    expect(button(wrapper).attributes('aria-busy')).toBeUndefined()
    expect(wrapper.get('[role="status"]').text()).toBe('home.composer.dictationListening')

    await wrapper.setProps({ state: 'finishing' })
    expect(button(wrapper).attributes('aria-disabled')).toBe('true')
    expect(wrapper.get('[role="status"]').text()).toBe('home.composer.dictationFinishing')
    await button(wrapper).trigger('click')
    expect(wrapper.emitted('toggle')).toHaveLength(1)

    await wrapper.setProps({ state: 'idle', outcome: 'inserted' })
    expect(wrapper.get('[role="status"]').text()).toBe('home.composer.dictationInserted')
    wrapper.unmount()
  })

  it('leaves the slot to the stop capsule while yielded: hidden, inert, silent', async () => {
    const wrapper = mountMic({ yielded: true })
    expect(button(wrapper).attributes('inert')).toBeDefined()
    expect(button(wrapper).attributes('aria-hidden')).toBe('true')
    expect(button(wrapper).classes()).toContain('is-yielded')
    await button(wrapper).trigger('click')
    expect(wrapper.emitted('toggle')).toBeUndefined()

    await wrapper.setProps({ yielded: false })
    expect(button(wrapper).attributes('inert')).toBeUndefined()
    // Back on the release spring, from the yielded scale.
    expect(
      calls.some(
        (call) =>
          call.target === button(wrapper).element &&
          call.keyframes[0]?.scale === COMPOSER_MOTION.micYield.scale
      )
    ).toBe(true)
    wrapper.unmount()
  })

  it('grows into the dictation capsule over the model pill, and gives it back after it retracts', async () => {
    const wrapper = mountMic({ coverWidth: 150 })
    await wrapper.setProps({ state: 'starting' })
    // The model pill yields at once; the key grows after the glyph's head start.
    expect(wrapper.emitted('cover')).toEqual([[true]])
    expect(button(wrapper).classes()).not.toContain('is-open')
    await advance(COMPOSER_MOTION.capsule.growDelayMs)
    expect(button(wrapper).classes()).toContain('is-open')
    const grow = calls.filter(
      (call) => call.target === button(wrapper).element && 'width' in (call.keyframes[0] ?? {})
    )
    expect(grow[0]!.keyframes).toEqual([{ width: '32px' }, { width: '150px' }])
    expect(button(wrapper).attributes('style')).toContain('--composer-mic-capsule: 150px')

    await advance(COMPOSER_MOTION.mic.contentDelayMs)
    expect(button(wrapper).classes()).toContain('is-live-shown')

    await wrapper.setProps({ state: 'idle' })
    await advance(COMPOSER_MOTION.capsule.retractDelayMs)
    expect(button(wrapper).classes()).not.toContain('is-open')
    expect(wrapper.emitted('cover')).toEqual([[true]])
    await advance(COMPOSER_MOTION.micYield.backDelayMs - COMPOSER_MOTION.capsule.retractDelayMs)
    expect(wrapper.emitted('cover')).toEqual([[true], [false]])
    wrapper.unmount()
  })

  it('never grows narrower than the waveform and timer need', () => {
    const wrapper = mountMic({ state: 'listening', coverWidth: 0 })
    expect(button(wrapper).attributes('style')).toContain(
      `--composer-mic-capsule: ${COMPOSER_MOTION.mic.capsuleMinPx}px`
    )
    wrapper.unmount()
  })

  it('spans exactly a measured cover, so a short model pill never lets it reach further left', () => {
    // A one-word model name: pill 48 + gap 8 + microphone 32. The unmeasured 96 would overhang the
    // pill by 8px, toward the permission chip in a narrow toolbar.
    const short = mountMic({ state: 'listening', coverWidth: 88 })
    expect(button(short).attributes('style')).toContain('--composer-mic-capsule: 88px')
    expect(short.findAll('.ComposerMic-Bar').length).toBeGreaterThanOrEqual(3)
    short.unmount()
  })

  it('draws as many bars as the capsule has room for, newest on the right', () => {
    const levels = [...silence.slice(2), 0.5, 1]
    const wrapper = mountMic({ state: 'listening', coverWidth: 150, levels })
    const bars = wrapper.findAll('.ComposerMic-Bar')
    const { barStride, timerPx } = COMPOSER_MOTION.mic
    expect(bars).toHaveLength(Math.floor((150 - 32 - timerPx) / barStride))
    expect(bars.at(-1)!.attributes('style')).toContain('--composer-mic-level: 1.000')
    expect(bars.at(-2)!.attributes('style')).toContain('--composer-mic-level: 0.590')
    expect(bars[0]!.attributes('style')).toContain('--composer-mic-level: 0.180')
    wrapper.unmount()
  })

  it('shows the time since the capture opened as m:ss', () => {
    const wrapper = mountMic({ state: 'listening', elapsedMs: 65_000 })
    expect(wrapper.get('.ComposerMic-Timer').text()).toBe('1:05')
    wrapper.unmount()
  })

  it('folds a waveform that had only half opened from where it was (a session that failed at once)', async () => {
    const wrapper = mountMic({ coverWidth: 150 })
    await wrapper.setProps({ state: 'starting' })
    await advance(COMPOSER_MOTION.mic.contentDelayMs)
    expect(button(wrapper).classes()).toContain('is-live-shown')

    // jsdom runs no animations: stage the frame a browser would read 40ms into the entrance.
    const live = wrapper.get('.ComposerMic-Live').element
    const real = window.getComputedStyle.bind(window)
    const spy = vi.spyOn(window, 'getComputedStyle').mockImplementation((target, pseudo) =>
      target === live
        ? ({
            getPropertyValue: (name: string) => ({ opacity: '0.5', scale: '0.9' })[name] ?? ''
          } as CSSStyleDeclaration)
        : real(target, pseudo)
    )
    await wrapper.setProps({ state: 'idle' })
    const fold = calls.filter((call) => call.target === live).at(-1)!
    expect(fold.keyframes).toEqual([
      { opacity: '0.5', scale: '0.9' },
      { opacity: 0, scale: 0.8 }
    ])
    spy.mockRestore()
    wrapper.unmount()
  })

  it('lands open and closed at once under reduced motion', async () => {
    reduced = true
    const wrapper = mountMic({ coverWidth: 150 })
    await wrapper.setProps({ state: 'listening' })
    expect(button(wrapper).classes()).toContain('is-open')
    expect(wrapper.emitted('cover')).toEqual([[true]])
    await wrapper.setProps({ state: 'idle' })
    expect(button(wrapper).classes()).not.toContain('is-open')
    expect(wrapper.emitted('cover')).toEqual([[true], [false]])
    await wrapper.setProps({ yielded: true })
    await wrapper.setProps({ yielded: false })
    await button(wrapper).trigger('pointerdown', { button: 0 })
    await advance(1000)
    expect(calls).toHaveLength(0)
    wrapper.unmount()
  })
})

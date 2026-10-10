// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { COMPOSER_MOTION } from './composer-motion'
import ComposerChip from './ComposerChip.vue'

interface Played {
  target: Element
  keyframes: Record<string, string | number>[]
  options: KeyframeAnimationOptions
  animation: Animation & { onfinish: (() => void) | null }
}

let played: Played[] = []
let reduceMotion = false

beforeEach(() => {
  played = []
  reduceMotion = false
  vi.useFakeTimers()
  Element.prototype.animate = function (
    this: Element,
    keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
    options?: number | KeyframeAnimationOptions
  ) {
    const animation = { cancel: vi.fn(), onfinish: null } as unknown as Played['animation']
    played.push({
      target: this,
      keyframes: keyframes as unknown as Played['keyframes'],
      options: (options ?? {}) as KeyframeAnimationOptions,
      animation
    })
    return animation
  }
  window.matchMedia = ((query: string) => ({
    matches: reduceMotion && query.includes('reduce'),
    media: query
  })) as unknown as typeof window.matchMedia
})

afterEach(() => {
  vi.useRealTimers()
  // @ts-expect-error jsdom ships no WAAPI; the stub is removed again.
  delete Element.prototype.animate
})

/** jsdom lays nothing out: the chip reports a width per label, as a laid-out chip would. */
const WIDTHS: Record<string, number> = { 自动审阅: 96, 禁用: 60, 完全允许: 96 }
/** Where a width tween still running holds the chip — a chip caught halfway. */
const MIDWAY = 78

function mountChip(props: { label: string; icon?: string; suffix?: string; danger?: boolean }) {
  const wrapper = mount(ComposerChip, { props, attachTo: document.body })
  Object.defineProperty(wrapper.element, 'offsetWidth', {
    configurable: true,
    get: () => {
      const tweening = played.some(
        (entry) =>
          entry.target === wrapper.element &&
          vi.mocked(entry.animation.cancel).mock.calls.length === 0
      )
      if (tweening) return MIDWAY
      return WIDTHS[wrapper.element.querySelector('.ComposerChip-Label')?.textContent ?? ''] ?? 0
    }
  })
  return wrapper
}

describe('ComposerChip', () => {
  it('renders icon, label and suffix, and swallows a disabled click', async () => {
    const wrapper = mount(ComposerChip, {
      props: { label: 'gpt-5.6-luna', suffix: '高', icon: 'i-ri-shield-line' }
    })
    expect(wrapper.classes()).toEqual(expect.arrayContaining(['ComposerChip', 'has-icon']))
    expect(wrapper.get('.ComposerChip-Icon span').classes()).toContain('i-ri-shield-line')
    expect(wrapper.get('.ComposerChip-Label').text()).toBe('gpt-5.6-luna')
    expect(wrapper.get('.ComposerChip-Suffix').text()).toBe('· 高')

    await wrapper.trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)

    await wrapper.setProps({ disabled: true })
    expect(wrapper.attributes('aria-disabled')).toBe('true')
    await wrapper.trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)
  })

  it('has no prefix, tint or ring of its own: danger and open are the only states it wears', async () => {
    const wrapper = mount(ComposerChip, { props: { label: '自动审阅' } })
    expect(wrapper.find('.ComposerChip-Prefix').exists()).toBe(false)
    expect(wrapper.classes()).not.toContain('is-danger')
    expect(wrapper.classes()).not.toContain('is-open')

    await wrapper.setProps({ label: '完全允许', danger: true, open: true })
    expect(wrapper.classes()).toEqual(expect.arrayContaining(['is-danger', 'is-open']))
  })

  it('morphs a new value: the old face fades where it stood, the new one fades in, the width tweens', async () => {
    const wrapper = mountChip({ label: '自动审阅', icon: 'i-ri-shield-check-line' })
    // Mounting is not a change.
    expect(played).toHaveLength(0)

    await wrapper.setProps({ label: '禁用', icon: 'i-ri-shield-line' })
    await nextTick()
    const { chip } = COMPOSER_MOTION

    // The new value is in the DOM straight away; only its appearance is eased.
    expect(wrapper.get('.ComposerChip-Label').text()).toBe('禁用')
    expect(wrapper.findAll('.ComposerChip > .ComposerChip-Icon span')).toHaveLength(1)

    const resize = played.find((entry) => entry.target === wrapper.element)
    expect(resize?.keyframes).toEqual([{ width: '96px' }, { width: '60px' }])
    expect(resize?.options.duration).toBe(chip.widthMs)

    // The leaving value: a hidden copy of the old icon and label, faded out on top of the chip.
    const ghost = wrapper.get('.ComposerChip-Ghost').element as HTMLElement
    expect(ghost.getAttribute('aria-hidden')).toBe('true')
    expect(ghost.style.position).toBe('absolute')
    expect(ghost.textContent).toContain('自动审阅')
    expect(ghost.querySelector('.i-ri-shield-check-line')).not.toBeNull()
    const leave = played.find((entry) => entry.target === ghost)
    expect(leave?.keyframes).toEqual([{ opacity: 1 }, { opacity: 0 }])
    expect(leave?.options.duration).toBe(chip.fadeOutMs)

    // The arriving value: the icon and the text, from transparent, just behind the leaving one.
    const arriving = played.filter((entry) =>
      (entry.target as HTMLElement).matches(
        '.ComposerChip > .ComposerChip-Icon, .ComposerChip > .ComposerChip-Text'
      )
    )
    expect(arriving).toHaveLength(2)
    for (const entry of arriving) {
      expect(entry.keyframes).toEqual([{ opacity: 0 }, { opacity: 1 }])
      expect(entry.options.delay).toBe(chip.fadeInDelayMs)
      expect(entry.options.fill).toBe('backwards')
    }

    // The copy leaves with its fade; nothing waits on a timer.
    expect(vi.getTimerCount()).toBe(0)
    leave!.animation.onfinish?.()
    expect(wrapper.find('.ComposerChip-Ghost').exists()).toBe(false)
  })

  it('keeps the leaving words in the ink they were drawn in when the new value turns danger', async () => {
    const wrapper = mountChip({ label: '自动审阅', icon: 'i-ri-shield-check-line' })
    const label = wrapper.get('.ComposerChip-Label').element as HTMLElement
    // jsdom computes no inherited colour from scoped CSS; give the old label an ink to carry.
    label.style.color = 'rgb(72, 72, 74)'

    await wrapper.setProps({ label: '完全允许', danger: true })
    await nextTick()

    const copied = wrapper.get('.ComposerChip-Ghost .ComposerChip-Label').element as HTMLElement
    expect(copied.style.color).toBe('rgb(72, 72, 74)')
  })

  it('restarts a change caught mid-morph from the width on screen, with one copy at a time', async () => {
    const wrapper = mountChip({ label: '自动审阅', icon: 'i-ri-shield-check-line' })

    await wrapper.setProps({ label: '禁用' })
    await nextTick()
    const first = played.filter((entry) => entry.target === wrapper.element)
    expect(first).toHaveLength(1)

    await wrapper.setProps({ label: '完全允许' })
    await nextTick()
    // The first morph is stopped and its copy taken away; the new copy is the value that was showing.
    for (const entry of played.slice(0, played.indexOf(first[0]!) + 1)) {
      expect(entry.animation.cancel).toHaveBeenCalled()
    }
    const ghosts = wrapper.findAll('.ComposerChip-Ghost')
    expect(ghosts).toHaveLength(1)
    expect(ghosts[0]!.text()).toContain('禁用')
    // From where the first tween had got to, not from where it was going.
    const second = played.filter((entry) => entry.target === wrapper.element)
    expect(second.at(-1)?.keyframes).toEqual([{ width: `${MIDWAY}px` }, { width: '96px' }])
  })

  it('lands a new value in the same frame under reduced motion', async () => {
    reduceMotion = true
    const wrapper = mountChip({ label: '自动审阅', icon: 'i-ri-shield-check-line' })

    await wrapper.setProps({ label: '禁用', icon: 'i-ri-shield-line' })
    await nextTick()

    expect(wrapper.get('.ComposerChip-Label').text()).toBe('禁用')
    expect(wrapper.get('.ComposerChip-Icon span').classes()).toContain('i-ri-shield-line')
    expect(wrapper.find('.ComposerChip-Ghost').exists()).toBe(false)
    expect(wrapper.classes()).not.toContain('is-morphing')
    expect(played).toHaveLength(0)
    expect(vi.getTimerCount()).toBe(0)
  })
})

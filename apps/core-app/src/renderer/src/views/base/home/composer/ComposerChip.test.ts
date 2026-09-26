// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COMPOSER_MOTION } from './composer-motion'
import ComposerChip from './ComposerChip.vue'

let calls = 0
let reduced = false

beforeEach(() => {
  calls = 0
  reduced = false
  vi.useFakeTimers()
  Element.prototype.animate = function () {
    calls += 1
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

function currentLabel(wrapper: VueWrapper): string {
  return wrapper.get('.ComposerChip-Label .tx-text-transformer__layer--current').text()
}

describe('ComposerChip', () => {
  it('renders prefix, value and suffix in its tone, and swallows a disabled click', async () => {
    const wrapper = mount(ComposerChip, {
      props: {
        prefix: '权限 ·',
        label: '完全允许',
        suffix: '',
        tone: 'danger',
        icon: 'i-ri-shield-flash-line'
      }
    })
    expect(wrapper.classes()).toEqual(expect.arrayContaining(['is-danger', 'has-icon']))
    expect(wrapper.get('.ComposerChip-Prefix').text()).toBe('权限 ·')
    expect(currentLabel(wrapper)).toBe('完全允许')
    expect(wrapper.find('.ComposerChip-Suffix').exists()).toBe(false)

    await wrapper.setProps({ disabled: true })
    expect(wrapper.attributes('aria-disabled')).toBe('true')
    await wrapper.trigger('click')
    expect(wrapper.emitted('click')).toBeUndefined()
  })

  it('lets the icon lead: the label swaps 50ms later, and colour eases only while it morphs', async () => {
    const wrapper = mount(ComposerChip, { props: { label: 'Tuff 智能', tone: 'muted' } })
    await wrapper.setProps({ label: 'Claude Opus', suffix: '高' })
    expect(wrapper.classes()).toContain('is-morphing')
    expect(currentLabel(wrapper)).toBe('Tuff 智能')

    vi.advanceTimersByTime(COMPOSER_MOTION.chip.labelDelayMs)
    await nextTick()
    expect(currentLabel(wrapper)).toBe('Claude Opus')
    expect(wrapper.get('.ComposerChip-Suffix').text()).toContain('高')

    const { labelDelayMs, labelFadeMs, widthMs } = COMPOSER_MOTION.chip
    vi.advanceTimersByTime(Math.max(labelFadeMs, widthMs))
    await nextTick()
    expect(wrapper.classes()).not.toContain('is-morphing')
    expect(labelDelayMs).toBe(50)
  })

  it('lands a change at once under reduced motion', async () => {
    reduced = true
    const wrapper = mount(ComposerChip, { props: { label: '禁用', tone: 'muted' } })
    await wrapper.setProps({ label: '自动审阅', tone: 'info' })
    expect(wrapper.classes()).not.toContain('is-morphing')
    expect(wrapper.classes()).toContain('is-info')
    expect(currentLabel(wrapper)).toBe('自动审阅')
    expect(calls).toBe(0)
  })
})

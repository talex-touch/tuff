// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ComposerChip from './ComposerChip.vue'

let calls = 0

beforeEach(() => {
  calls = 0
  vi.useFakeTimers()
  Element.prototype.animate = function () {
    calls += 1
    return { cancel: vi.fn(), onfinish: null } as unknown as Animation
  }
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query
  })) as unknown as typeof window.matchMedia
})

afterEach(() => {
  vi.useRealTimers()
  // @ts-expect-error jsdom ships no WAAPI; the stub is removed again.
  delete Element.prototype.animate
})

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

  it('lands a new value in the same frame: nothing waits on a timer and nothing tweens', async () => {
    const wrapper = mount(ComposerChip, {
      props: { label: '自动审阅', icon: 'i-ri-shield-check-line' }
    })

    await wrapper.setProps({ label: '禁用', icon: 'i-ri-shield-line' })

    expect(wrapper.get('.ComposerChip-Label').text()).toBe('禁用')
    expect(wrapper.get('.ComposerChip-Icon span').classes()).toContain('i-ri-shield-line')
    expect(wrapper.findAll('.ComposerChip-Icon span')).toHaveLength(1)
    expect(wrapper.classes()).not.toContain('is-morphing')
    expect(vi.getTimerCount()).toBe(0)
    expect(calls).toBe(0)
  })
})

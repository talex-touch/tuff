import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import TxTextTransformer from '../src/TxTextTransformer.vue'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('txTextTransformer', () => {
  it('renders the current text with default live region semantics', () => {
    const wrapper = mount(TxTextTransformer, {
      props: {
        text: 'Ready',
      },
    })

    expect(wrapper.element.tagName).toBe('SPAN')
    expect(wrapper.attributes('aria-live')).toBe('polite')
    expect(wrapper.classes()).toContain('tx-text-transformer')
    expect(wrapper.find('.tx-text-transformer__layer--current').text()).toBe('Ready')
    expect(wrapper.find('.tx-text-transformer__layer--prev').exists()).toBe(false)
  })

  it('uses the requested root tag and maps timing props to CSS variables', () => {
    const wrapper = mount(TxTextTransformer, {
      props: {
        text: 42,
        tag: 'strong',
        durationMs: 360,
        blurPx: 12,
        wrap: true,
      },
    })

    const style = wrapper.attributes('style')

    expect(wrapper.element.tagName).toBe('STRONG')
    expect(wrapper.classes()).toContain('is-wrap')
    expect(wrapper.find('.tx-text-transformer__layer--current').text()).toBe('42')
    expect(style).toContain('--tx-tt-duration: 360ms')
    expect(style).toContain('--tx-tt-blur: 12px')
  })

  it('renders previous and current layers during text transitions', async () => {
    vi.stubGlobal('getComputedStyle', () => ({ color: 'rgb(12, 34, 56)' }))

    const wrapper = mount(TxTextTransformer, {
      props: {
        text: 'Draft',
        durationMs: 120,
      },
    })

    await wrapper.setProps({ text: 'Published' })
    await nextTick()
    vi.advanceTimersByTime(16)
    await nextTick()

    const current = wrapper.find('.tx-text-transformer__layer--current')
    const prev = wrapper.find('.tx-text-transformer__layer--prev')

    expect(wrapper.classes()).toContain('has-prev')
    expect(wrapper.classes()).toContain('is-animating')
    expect(current.text()).toBe('Published')
    expect(prev.text()).toBe('Draft')
    expect(prev.attributes('aria-hidden')).toBe('true')
    expect(prev.attributes('style')).toContain('color: rgb(12, 34, 56)')

    vi.advanceTimersByTime(154)
    await nextTick()

    expect(wrapper.find('.tx-text-transformer__layer--prev').exists()).toBe(false)
    expect(wrapper.classes()).not.toContain('has-prev')
    expect(wrapper.classes()).not.toContain('is-animating')
  })

  it('passes layer text to the default slot for both current and previous layers', async () => {
    const wrapper = mount(TxTextTransformer, {
      props: {
        text: 'A',
      },
      slots: {
        default: '<template #default="{ text }"><em>{{ text }}</em></template>',
      },
    })

    await wrapper.setProps({ text: 'B' })
    await nextTick()

    const layers = wrapper.findAll('em')

    expect(layers.map(layer => layer.text())).toEqual(['B', 'A'])
  })
})

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxTypingIndicator from '../src/TxTypingIndicator.vue'

describe('txTypingIndicator', () => {
  it('renders default dots with status semantics and visible text', () => {
    const wrapper = mount(TxTypingIndicator)

    expect(wrapper.classes()).toContain('tx-typing-indicator')
    expect(wrapper.attributes('role')).toBe('status')
    expect(wrapper.attributes('aria-live')).toBe('polite')
    expect(wrapper.find('.tx-typing-indicator__dots').attributes('aria-hidden')).toBe('true')
    expect(wrapper.findAll('.tx-typing-indicator__dot')).toHaveLength(3)
    expect(wrapper.find('.tx-typing-indicator__text').text()).toBe('Typing…')
  })

  it('maps dot size and gap props to inline styles', () => {
    const wrapper = mount(TxTypingIndicator, {
      props: {
        size: 9,
        gap: 7,
      },
    })

    const dots = wrapper.find('.tx-typing-indicator__dots')
    const dot = wrapper.find('.tx-typing-indicator__dot')

    expect(dots.attributes('style')).toContain('gap: 7px')
    expect(dot.attributes('style')).toContain('width: 9px')
    expect(dot.attributes('style')).toContain('height: 9px')
  })

  it('hides the label while preserving status semantics', () => {
    const wrapper = mount(TxTypingIndicator, {
      props: {
        showText: false,
        text: 'Generating',
      },
    })

    expect(wrapper.attributes('role')).toBe('status')
    expect(wrapper.find('.tx-typing-indicator__text').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Generating')
  })

  it('renders the ai variant with scoped mask and loader size variables', () => {
    const wrapper = mount(TxTypingIndicator, {
      props: {
        variant: 'ai',
        loaderSize: 32,
        text: 'Thinking',
      },
    })

    const wrap = wrapper.find('.tx-typing-indicator__ai-wrap')
    const mask = wrapper.find('.tx-typing-indicator__ai-mask')
    const box = wrapper.find('.tx-typing-indicator__ai-box')
    const style = wrap.attributes('style')
    const maskId = mask.attributes('id')

    expect(wrap.attributes('aria-hidden')).toBe('true')
    expect(style).toContain('--tx-typing-ai-size: 32px')
    expect(style).toContain('--tx-typing-ai-scale: 0.32')
    expect(maskId).toMatch(/^tx-typing-indicator-mask-/)
    expect(box.attributes('style')).toContain(`url(#${maskId})`)
    expect(wrapper.find('.tx-typing-indicator__text').text()).toBe('Thinking')
  })

  it('renders spinner variants with their size variables', () => {
    const pure = mount(TxTypingIndicator, {
      props: {
        variant: 'pure',
        pureSize: 11,
        showText: false,
      },
    })
    const ring = mount(TxTypingIndicator, {
      props: {
        variant: 'ring',
        ringSize: 22,
        ringThickness: 4,
        showText: false,
      },
    })
    const circleDash = mount(TxTypingIndicator, {
      props: {
        variant: 'circle-dash',
        circleDashSize: 24,
        circleDashThickness: 3,
        circleDashDashDeg: 9,
        circleDashGapDeg: 6,
        showText: false,
      },
    })

    expect(pure.find('.tx-typing-indicator__pure').attributes('style')).toContain('--tx-typing-pure-size: 11px')
    expect(ring.find('.tx-typing-indicator__ring').attributes('style')).toContain('--tx-typing-ring-size: 22px')
    expect(ring.find('.tx-typing-indicator__ring').attributes('style')).toContain('--tx-typing-ring-thickness: 4px')
    expect(circleDash.find('.tx-typing-indicator__circle-dash').attributes('style')).toContain('--tx-typing-circle-dash-size: 24px')
    expect(circleDash.find('.tx-typing-indicator__circle-dash').attributes('style')).toContain('--tx-typing-circle-dash-thickness: 3px')
    expect(circleDash.find('.tx-typing-indicator__circle-dash').attributes('style')).toContain('--tx-typing-circle-dash-deg: 9deg')
    expect(circleDash.find('.tx-typing-indicator__circle-dash').attributes('style')).toContain('--tx-typing-circle-gap-deg: 6deg')
  })

  it('renders bars variant with three bars and size variable', () => {
    const wrapper = mount(TxTypingIndicator, {
      props: {
        variant: 'bars',
        barsSize: 18,
        showText: false,
      },
    })

    const bars = wrapper.find('.tx-typing-indicator__bars')

    expect(bars.attributes('aria-hidden')).toBe('true')
    expect(bars.attributes('style')).toContain('--tx-typing-bars-size: 18px')
    expect(wrapper.findAll('.tx-typing-indicator__bar')).toHaveLength(3)
  })
})

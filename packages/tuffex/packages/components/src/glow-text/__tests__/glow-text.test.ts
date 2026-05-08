import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import TxGlowText from '../src/TxGlowText.vue'

describe('txGlowText', () => {
  it('renders slot content with default adaptive shine overlay', () => {
    const wrapper = mount(TxGlowText, {
      slots: {
        default: 'Realtime Sync',
      },
    })

    expect(wrapper.element.tagName).toBe('SPAN')
    expect(wrapper.classes()).toContain('tx-glow-text')
    expect(wrapper.classes()).toContain('is-adaptive')
    expect(wrapper.find('.tx-glow-text__shine').exists()).toBe(true)
    expect(wrapper.find('.tx-glow-text__shine').attributes('aria-hidden')).toBe('true')
    expect(wrapper.text()).toContain('Realtime Sync')
  })

  it('uses the requested root tag and maps visual props to CSS variables', () => {
    const wrapper = mount(TxGlowText, {
      props: {
        tag: 'div',
        durationMs: 900,
        delayMs: 120,
        angle: -12,
        bandSize: 28,
        color: 'rgba(125, 211, 252, 0.95)',
        opacity: 0.5,
        radius: 16,
        blendMode: 'soft-light',
        backdrop: 'brightness(1.2)',
      },
      slots: {
        default: '<span>Card shine</span>',
      },
    })

    const style = wrapper.attributes('style')

    expect(wrapper.element.tagName).toBe('DIV')
    expect(wrapper.classes()).toContain('has-custom-blend')
    expect(wrapper.classes()).toContain('has-custom-backdrop')
    expect(style).toContain('--tx-glow-duration: 900ms')
    expect(style).toContain('--tx-glow-delay: 120ms')
    expect(style).toContain('--tx-glow-angle: -12deg')
    expect(style).toContain('--tx-glow-band: 28%')
    expect(style).toContain('--tx-glow-color: rgba(125, 211, 252, 0.95)')
    expect(style).toContain('--tx-glow-opacity: 0.5')
    expect(style).toContain('--tx-glow-radius: 16px')
    expect(style).toContain('--tx-glow-blend-mode: soft-light')
    expect(style).toContain('--tx-glow-backdrop: brightness(1.2)')
  })

  it('marks inactive and one-shot states through classes', () => {
    const wrapper = mount(TxGlowText, {
      props: {
        active: false,
        repeat: false,
      },
      slots: {
        default: 'Paused',
      },
    })

    expect(wrapper.classes()).toContain('is-inactive')
    expect(wrapper.classes()).toContain('is-once')
  })

  it('renders text-clip mirror text and suppresses container shine mode', async () => {
    const wrapper = mount(TxGlowText, {
      props: {
        mode: 'text-clip',
      },
      slots: {
        default: '<span class="content">Token Stream</span>',
      },
    })

    await nextTick()

    const clip = wrapper.find('.tx-glow-text__clip-shine')

    expect(wrapper.classes()).toContain('is-text-clip')
    expect(clip.exists()).toBe(true)
    expect(clip.attributes('aria-hidden')).toBe('true')
    expect(clip.text()).toBe('Token Stream')
    expect(wrapper.find('.tx-glow-text__shine').exists()).toBe(true)
  })

  it('clears text-clip mirror text when switching back to adaptive mode', async () => {
    const wrapper = mount(TxGlowText, {
      props: {
        mode: 'text-clip',
      },
      slots: {
        default: 'Changing mode',
      },
    })

    await nextTick()
    expect(wrapper.find('.tx-glow-text__clip-shine').exists()).toBe(true)

    await wrapper.setProps({ mode: 'adaptive' })

    expect(wrapper.classes()).toContain('is-adaptive')
    expect(wrapper.find('.tx-glow-text__clip-shine').exists()).toBe(false)
  })
})

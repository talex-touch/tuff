import fs from 'node:fs'
import path from 'node:path'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxAiLoadingHint from '../components/foundation/TxAiLoadingHint.vue'
import TxAiThinking from '../components/foundation/TxAiThinking.vue'

describe('txAiThinking and TxAiLoadingHint motion pacing', () => {
  it('tags inner indicator elements with data-live-anim hooks across variants', async () => {
    const wrapper = mount(TxAiThinking, {
      props: {
        variant: 'dots',
        text: 'Thinking',
      },
    })

    const dots = wrapper.findAll('.tx-typing-indicator__dot')
    expect(dots).toHaveLength(3)
    expect(dots[0].attributes('data-live-anim')).toBe('dot')
    expect(dots[0].attributes('data-live-anim-stagger')).toBeUndefined()
    expect(dots[1].attributes('data-live-anim')).toBe('dot')
    expect(dots[1].attributes('data-live-anim-stagger')).toBe('1')
    expect(dots[2].attributes('data-live-anim')).toBe('dot')
    expect(dots[2].attributes('data-live-anim-stagger')).toBe('2')

    await wrapper.setProps({ variant: 'bars' })
    const bars = wrapper.findAll('.tx-typing-indicator__bar')
    expect(bars).toHaveLength(3)
    expect(bars[0].attributes('data-live-anim')).toBe('bar')
    expect(bars[1].attributes('data-live-anim-stagger')).toBe('1')
    expect(bars[2].attributes('data-live-anim-stagger')).toBe('2')

    await wrapper.setProps({ variant: 'ring' })
    expect(wrapper.get('.tx-typing-indicator__ring').attributes('data-live-anim')).toBe('spin')

    await wrapper.setProps({ variant: 'pure' })
    expect(wrapper.get('.tx-typing-indicator__pure').attributes('data-live-anim')).toBe('spin')

    await wrapper.setProps({ variant: 'circle-dash' })
    expect(wrapper.get('.tx-typing-indicator__circle-dash').attributes('data-live-anim')).toBe('spin')

    await wrapper.setProps({ variant: 'ai' })
    expect(wrapper.get('.tx-typing-indicator__ai').attributes('data-live-anim')).toBe('breathe')
  })

  it('removes data-live-anim hooks and marks static class when motion="none"', async () => {
    const wrapper = mount(TxAiThinking, {
      props: {
        variant: 'dots',
        motion: 'none',
        text: 'Still',
      },
    })

    expect(wrapper.get('.tx-ai-thinking').classes()).toContain('tx-ai-thinking--static')
    expect(wrapper.get('.tx-ai-thinking').attributes('data-motion')).toBe('none')
    expect(wrapper.findAll('[data-live-anim]')).toHaveLength(0)

    await wrapper.setProps({ motion: 'fade' })
    expect(wrapper.get('.tx-ai-thinking').classes()).not.toContain('tx-ai-thinking--static')
    expect(wrapper.findAll('[data-live-anim="dot"]')).toHaveLength(3)

    await wrapper.setProps({ motion: 'none' })
    expect(wrapper.findAll('[data-live-anim]')).toHaveLength(0)
  })

  it('forwards motion="none" from TxAiLoadingHint and renders static dot on terminal statuses', async () => {
    const wrapper = mount(TxAiLoadingHint, {
      props: {
        label: 'Indexing files',
        status: 'running',
        motion: 'fade',
      },
    })

    expect(wrapper.findAll('[data-live-anim="dot"]')).toHaveLength(3)
    expect(wrapper.get('.tx-ai-loading-hint').classes()).not.toContain('tx-ai-loading-hint--static')

    await wrapper.setProps({ motion: 'none' })
    expect(wrapper.get('.tx-ai-loading-hint').classes()).toContain('tx-ai-loading-hint--static')
    expect(wrapper.findAll('[data-live-anim]')).toHaveLength(0)

    await wrapper.setProps({ status: 'success', motion: 'fade' })
    expect(wrapper.find('.tx-ai-loading-hint__status').exists()).toBe(true)
    expect(wrapper.findAll('[data-live-anim]')).toHaveLength(0)
  })

  it('enforces zero infinite keyframes, stepped fallback, host-clock suppression, and reduced-motion rules', () => {
    const thinkingSrc = fs.readFileSync(
      path.resolve(__dirname, '../components/foundation/TxAiThinking.vue'),
      'utf8',
    )
    const hintSrc = fs.readFileSync(
      path.resolve(__dirname, '../components/foundation/TxAiLoadingHint.vue'),
      'utf8',
    )

    expect(thinkingSrc).not.toMatch(/@keyframes/)
    expect(thinkingSrc).not.toMatch(/animation\s*:[^;]*\binfinite\b/)
    expect(hintSrc).not.toMatch(/@keyframes/)
    expect(hintSrc).not.toMatch(/animation\s*:[^;]*\binfinite\b/)

    expect(thinkingSrc).toContain('steps(16, end)')
    expect(thinkingSrc).toContain('steps(12, end)')
    expect(thinkingSrc).toContain("[data-live-anim-clock='active']")
    expect(thinkingSrc).toContain('prefers-reduced-motion: reduce')
    expect(thinkingSrc).toContain("html[data-low-battery-motion='1']")
  })
})

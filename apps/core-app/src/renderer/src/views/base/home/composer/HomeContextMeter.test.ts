// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import HomeContextMeter from './HomeContextMeter.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key
  })
}))

describe('HomeContextMeter', () => {
  it('renders clamped track width via UIKit percentage calculation and preserves meter semantics', () => {
    const wrapper = mount(HomeContextMeter, {
      props: {
        percent: 135,
        windowText: '128k'
      },
      global: {
        stubs: {
          TxTextMorph: {
            props: ['text'],
            template: '<span class="stub-morph">{{ text }}</span>'
          }
        }
      }
    })

    expect(wrapper.attributes('role')).toBe('meter')
    expect(wrapper.attributes('aria-valuenow')).toBe('135')
    expect(wrapper.get('.HomeContextMeter-Fill').attributes('style')).toContain('width: 100%')
    expect(wrapper.get('.HomeContextMeter-Percent').text()).toBe('135%')
    expect(wrapper.get('.HomeContextMeter-Window').text()).toBe('128k')
  })

  it('clamps negative percentages to 0% on the fill track', () => {
    const wrapper = mount(HomeContextMeter, {
      props: {
        percent: -10,
        windowText: '1M'
      },
      global: {
        stubs: {
          TxTextMorph: {
            props: ['text'],
            template: '<span class="stub-morph">{{ text }}</span>'
          }
        }
      }
    })

    expect(wrapper.get('.HomeContextMeter-Fill').attributes('style')).toContain('width: 0%')
  })
})

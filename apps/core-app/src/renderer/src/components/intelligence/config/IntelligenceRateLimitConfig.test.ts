// @vitest-environment jsdom
import {
  type IntelligenceProviderConfig,
  IntelligenceProviderType
} from '@talex-touch/tuff-intelligence'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import IntelligenceRateLimitConfig from './IntelligenceRateLimitConfig.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key
  })
}))

describe('IntelligenceRateLimitConfig', () => {
  const baseConfig: IntelligenceProviderConfig = {
    id: 'test-provider',
    name: 'Test Provider',
    type: IntelligenceProviderType.OPENAI,
    enabled: true,
    rateLimit: {
      requestsPerMinute: 60,
      tokensPerMinute: 10000
    }
  }

  it('renders TxInput components for rate limits', () => {
    const wrapper = mount(IntelligenceRateLimitConfig, {
      props: {
        modelValue: baseConfig
      }
    })

    const inputs = wrapper.findAllComponents({ name: 'TuffInput' })
    expect(inputs.length).toBe(2)
    expect(inputs[0].props('modelValue')).toBe(60)
    expect(inputs[1].props('modelValue')).toBe(10000)
  })

  it('updates rate limit values on input and emits update:modelValue on blur', async () => {
    const wrapper = mount(IntelligenceRateLimitConfig, {
      props: {
        modelValue: baseConfig
      }
    })

    const inputs = wrapper.findAllComponents({ name: 'TuffInput' })
    await inputs[0].vm.$emit('update:modelValue', 120)
    await inputs[0].vm.$emit('blur', new FocusEvent('blur'))

    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    const updated = wrapper.emitted('update:modelValue')![0][0] as IntelligenceProviderConfig
    expect(updated.rateLimit?.requestsPerMinute).toBe(120)
  })

  it('handles empty input as undefined (unlimited)', async () => {
    const wrapper = mount(IntelligenceRateLimitConfig, {
      props: {
        modelValue: baseConfig
      }
    })

    const inputs = wrapper.findAllComponents({ name: 'TuffInput' })
    await inputs[0].vm.$emit('update:modelValue', '')
    await inputs[0].vm.$emit('blur', new FocusEvent('blur'))

    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    const updated = wrapper.emitted('update:modelValue')![0][0] as IntelligenceProviderConfig
    expect(updated.rateLimit?.requestsPerMinute).toBeUndefined()
  })
})

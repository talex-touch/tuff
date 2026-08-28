// @vitest-environment jsdom
/* eslint-disable vue/one-component-per-file */
import type { IntelligenceProviderConfig } from '@talex-touch/tuff-intelligence'
import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import IntelligenceInfo from './IntelligenceInfo.vue'

const mocks = vi.hoisted(() => ({
  getSettings: vi.fn()
}))

vi.mock('@talex-touch/utils/renderer/storage', () => ({
  intelligenceSettings: {
    get: mocks.getSettings
  }
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key
  })
}))

vi.mock('~/modules/auth/useAuth', () => ({
  useAuth: () => ({
    isLoggedIn: { value: false },
    loginWithBrowser: vi.fn(),
    authLoadingState: { isLoggingIn: false }
  })
}))

vi.mock('~/modules/intelligence/nexus-provider', () => ({
  isNexusManagedProvider: () => false
}))

const AdvancedConfigStub = defineComponent({
  name: 'IntelligenceAdvancedConfig',
  props: {
    modelValue: {
      type: Object,
      required: true
    }
  },
  emits: ['update:modelValue', 'change'],
  setup(props, { emit }) {
    return () =>
      h(
        'button',
        {
          class: 'update-timeout',
          type: 'button',
          onClick: () => {
            emit('update:modelValue', { ...props.modelValue, timeout: 45_000 })
            emit('change')
          }
        },
        'update timeout'
      )
  }
})

const SlotStub = defineComponent({
  setup(_, { slots }) {
    return () => h('div', [slots.header?.(), slots.default?.()])
  }
})

function createProvider(): IntelligenceProviderConfig {
  return {
    id: 'openai-timeout-settings',
    type: IntelligenceProviderType.OPENAI,
    name: 'OpenAI Timeout Settings',
    enabled: true,
    hasCredential: true,
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o-mini'],
    timeout: 30_000,
    priority: 1,
    rateLimit: {}
  }
}

describe('IntelligenceInfo provider updates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('persists the advanced timeout emitted by v-model instead of the stale storage snapshot', async () => {
    const provider = createProvider()
    mocks.getSettings.mockReturnValue({ providers: [provider] })

    const wrapper = mount(IntelligenceInfo, {
      props: { provider },
      global: {
        stubs: {
          TxScroll: SlotStub,
          TuffGroupBlock: SlotStub,
          TuffBlockSlot: SlotStub,
          IntelligenceProviderHeader: true,
          IntelligenceApiConfig: true,
          IntelligenceModelConfig: true,
          IntelligenceAdvancedConfig: AdvancedConfigStub,
          IntelligenceRateLimitConfig: true,
          TxButton: true
        }
      }
    })

    await wrapper.get('button.update-timeout').trigger('click')

    expect(wrapper.emitted('update')).toEqual([
      [expect.objectContaining({ id: provider.id, timeout: 45_000 })]
    ])
    expect(mocks.getSettings).not.toHaveBeenCalled()
  })
})

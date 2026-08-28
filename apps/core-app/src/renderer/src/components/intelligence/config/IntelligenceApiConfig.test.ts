// @vitest-environment jsdom
import type { IntelligenceProviderConfig } from '@talex-touch/tuff-intelligence'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, reactive } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import IntelligenceApiConfig from './IntelligenceApiConfig.vue'

const mocks = vi.hoisted(() => ({
  saveProviderConfig: vi.fn(),
  testProvider: vi.fn(),
  fetchModels: vi.fn(),
  updateProvider: vi.fn()
}))

vi.mock('@talex-touch/utils/renderer', () => ({
  useIntelligenceSdk: () => ({
    saveProviderConfig: mocks.saveProviderConfig,
    testProvider: mocks.testProvider,
    fetchModels: mocks.fetchModels
  })
}))

vi.mock('@talex-touch/utils/renderer/storage', () => ({
  intelligenceSettings: {
    updateProvider: mocks.updateProvider
  }
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key
  })
}))

vi.mock('~/modules/intelligence/nexus-provider', () => ({
  isNexusManagedProvider: () => false
}))

vi.mock('~/modules/mention/dialog-mention', () => ({
  forDialogMention: vi.fn()
}))

const TuffBlockInputStub = defineComponent({
  name: 'TuffBlockInput',
  props: {
    modelValue: {
      type: [String, Number],
      required: true
    },
    description: {
      type: String,
      default: ''
    }
  },
  emits: ['update:modelValue'],
  setup(props, { emit, slots }) {
    return () =>
      h('section', [
        h('p', { class: 'description' }, props.description),
        slots.control?.({
          modelValue: props.modelValue,
          update: (value: string | number) => emit('update:modelValue', value),
          focus: () => undefined
        })
      ])
  }
})

function createReactiveProvider(): IntelligenceProviderConfig {
  return reactive({
    id: 'acceptance-ollama',
    type: 'custom',
    name: 'Acceptance Ollama',
    enabled: true,
    priority: 1,
    baseUrl: 'http://127.0.0.1:11434/v1',
    models: ['smollm2:135m'],
    capabilities: ['text.chat'],
    rateLimit: { requestsPerMinute: 10, tokensPerMinute: 1_000 },
    metadata: {
      origin: 'packaged-acceptance',
      nested: { enabled: true }
    }
  }) as IntelligenceProviderConfig
}

function mountConfig(provider: IntelligenceProviderConfig) {
  return mount(IntelligenceApiConfig, {
    props: { modelValue: provider },
    global: {
      stubs: {
        TuffBlockInput: TuffBlockInputStub,
        TuffBlockSlot: { template: '<section><slot /></section>' },
        TxButton: { template: '<button><slot /></button>' },
        TxPopover: { template: '<div><slot name="reference" /><slot /></div>' },
        TxTag: true,
        RemixIcon: true
      }
    }
  })
}

describe('IntelligenceApiConfig credential persistence', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('detaches a reactive provider and saves the exact credential on blur', async () => {
    const provider = createReactiveProvider()
    const savedProvider = {
      ...JSON.parse(JSON.stringify(provider)),
      authRef: 'provider-credential:acceptance-ollama',
      hasCredential: true
    } as IntelligenceProviderConfig
    const credential = '  synthetic-provider-credential  '
    mocks.saveProviderConfig.mockResolvedValue(savedProvider)

    const wrapper = mountConfig(provider)
    const input = wrapper.get<HTMLInputElement>('input[type="password"]')

    await input.setValue(credential)
    await input.trigger('blur')
    await flushPromises()

    expect(mocks.saveProviderConfig).toHaveBeenCalledTimes(1)
    const request = mocks.saveProviderConfig.mock.calls[0][0]
    expect(() => structuredClone(request.provider)).not.toThrow()
    expect(request.provider).not.toHaveProperty('apiKey')
    expect(request.provider).toMatchObject({
      id: 'acceptance-ollama',
      models: ['smollm2:135m'],
      capabilities: ['text.chat'],
      rateLimit: { requestsPerMinute: 10, tokensPerMinute: 1_000 },
      metadata: {
        origin: 'packaged-acceptance',
        nested: { enabled: true }
      }
    })
    expect(request.credential).toEqual({ action: 'set', value: credential })
    expect(mocks.updateProvider).toHaveBeenCalledTimes(1)
    expect(mocks.updateProvider).toHaveBeenCalledWith('acceptance-ollama', savedProvider)
    expect(input.element.value).toBe('')
    expect(wrapper.emitted('change')).toHaveLength(1)
  })

  it('retains the credential when persistence fails so blur can retry', async () => {
    const credential = 'synthetic-retry-credential'
    mocks.saveProviderConfig.mockRejectedValue(new Error('PROVIDER_CREDENTIAL_REQUEST_INVALID'))

    const wrapper = mountConfig(createReactiveProvider())
    const input = wrapper.get<HTMLInputElement>('input[type="password"]')

    await input.setValue(credential)
    await input.trigger('blur')
    await flushPromises()

    expect(mocks.saveProviderConfig).toHaveBeenCalledTimes(1)
    expect(mocks.updateProvider).not.toHaveBeenCalled()
    expect(input.element.value).toBe(credential)
    expect(wrapper.text()).toContain('intelligence.config.api.connectionFailed')

    mocks.saveProviderConfig.mockResolvedValue({
      ...JSON.parse(JSON.stringify(createReactiveProvider())),
      authRef: 'provider-credential:acceptance-ollama',
      hasCredential: true
    })
    await input.trigger('blur')
    await flushPromises()

    expect(mocks.saveProviderConfig).toHaveBeenCalledTimes(2)
  })
})

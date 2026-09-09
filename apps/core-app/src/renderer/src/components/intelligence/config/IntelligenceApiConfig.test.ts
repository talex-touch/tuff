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

const TuffBlockInputStub = defineComponent({
  name: 'TuffBlockInput',
  props: {
    modelValue: { type: [String, Number], required: true },
    title: { type: String, default: '' },
    description: { type: String, default: '' },
    inputType: { type: String, default: 'text' },
    disabled: { type: Boolean, default: false }
  },
  emits: ['update:modelValue', 'blur'],
  setup(props, { emit, slots }) {
    return () =>
      h('section', { 'data-input-title': props.title }, [
        h('p', { class: 'description' }, props.description),
        slots.control
          ? slots.control({
              modelValue: props.modelValue,
              update: (value: unknown) => emit('update:modelValue', value),
              focus: () => undefined,
              blur: () => emit('blur', new FocusEvent('blur')),
              disabled: props.disabled
            })
          : h('input', {
              type: props.inputType,
              value: props.modelValue,
              disabled: props.disabled,
              onInput: (event: Event) =>
                emit('update:modelValue', (event.target as HTMLInputElement).value),
              onBlur: (event: FocusEvent) => emit('blur', event)
            }),
        slots.default?.()
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
        TxInput: {
          props: ['modelValue', 'placeholder', 'disabled'],
          emits: ['update:modelValue', 'blur'],
          template:
            '<input :value="modelValue" :placeholder="placeholder" :disabled="disabled" @input="$emit(\'update:modelValue\', $event.target.value)" @blur="$emit(\'blur\', $event)" />'
        },
        TuffBlockInput: TuffBlockInputStub,
        TuffBlockSlot: { template: '<section><slot /></section>' },
        TxButton: { template: '<button><slot /></button>' },
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

    await wrapper.setProps({ modelValue: savedProvider })
    await input.trigger('blur')
    await flushPromises()

    expect(mocks.saveProviderConfig).toHaveBeenCalledTimes(1)
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

    mocks.saveProviderConfig.mockResolvedValue({
      ...JSON.parse(JSON.stringify(createReactiveProvider())),
      authRef: 'provider-credential:acceptance-ollama',
      hasCredential: true
    })
    await input.trigger('blur')
    await flushPromises()

    expect(mocks.saveProviderConfig).toHaveBeenCalledTimes(2)
  })

  it('applies a deferred credential save only to the channel that started it', async () => {
    const savingChannel = reactive({
      ...createReactiveProvider(),
      id: 'bailian-channel'
    }) as IntelligenceProviderConfig
    const switchedChannel = reactive({
      ...createReactiveProvider(),
      id: 'volcengine-channel'
    }) as IntelligenceProviderConfig
    const savedChannel = {
      ...JSON.parse(JSON.stringify(savingChannel)),
      authRef: 'provider-credential:bailian-channel',
      hasCredential: true
    } as IntelligenceProviderConfig
    let resolveSave!: (value: IntelligenceProviderConfig) => void
    mocks.saveProviderConfig.mockImplementation(
      () => new Promise<IntelligenceProviderConfig>((resolve) => (resolveSave = resolve))
    )
    const wrapper = mountConfig(savingChannel)
    const input = wrapper.get<HTMLInputElement>('input[type="password"]')

    await input.setValue('synthetic-channel-credential')
    await input.trigger('blur')
    await flushPromises()
    await wrapper.setProps({ modelValue: switchedChannel })

    resolveSave(savedChannel)
    await flushPromises()

    expect(mocks.updateProvider).toHaveBeenCalledOnce()
    expect(mocks.updateProvider).toHaveBeenCalledWith('bailian-channel', savedChannel)
    expect(wrapper.emitted('change')).toBeUndefined()
  })
})
describe('IntelligenceApiConfig Base URL persistence', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('saves a detached, trimmed Base URL projection and updates renderer storage only after success', async () => {
    const provider = createReactiveProvider()
    const savedProvider = {
      ...JSON.parse(JSON.stringify(provider)),
      baseUrl: 'https://api.example.test/v1'
    } as IntelligenceProviderConfig
    let resolveSave!: (provider: IntelligenceProviderConfig) => void
    mocks.saveProviderConfig.mockImplementation(
      () => new Promise<IntelligenceProviderConfig>((resolve) => (resolveSave = resolve))
    )

    const wrapper = mountConfig(provider)
    const input = wrapper.get<HTMLInputElement>('input[type="text"]')

    await input.setValue('  https://api.example.test/v1  ')
    await input.trigger('blur')
    await flushPromises()

    expect(mocks.saveProviderConfig).toHaveBeenCalledTimes(1)
    const request = mocks.saveProviderConfig.mock.calls[0][0]
    expect(request.credential).toEqual({ action: 'preserve' })
    expect(request.provider).not.toBe(provider)
    expect(structuredClone(request.provider)).toMatchObject({
      id: 'acceptance-ollama',
      baseUrl: 'https://api.example.test/v1',
      metadata: { origin: 'packaged-acceptance', nested: { enabled: true } }
    })
    expect(mocks.updateProvider).not.toHaveBeenCalled()

    resolveSave(savedProvider)
    await flushPromises()

    expect(mocks.updateProvider).toHaveBeenCalledTimes(1)
    expect(mocks.updateProvider).toHaveBeenCalledWith('acceptance-ollama', savedProvider)
    expect(input.element.value).toBe('https://api.example.test/v1')
    expect(wrapper.emitted('change')).toHaveLength(1)
  })

  it('keeps a failed Base URL edit for a retry without updating renderer storage', async () => {
    const savedProvider = {
      ...JSON.parse(JSON.stringify(createReactiveProvider())),
      baseUrl: 'https://retry.example.test/v1'
    } as IntelligenceProviderConfig
    mocks.saveProviderConfig.mockRejectedValueOnce(new Error('PROVIDER_CONFIG_REQUEST_INVALID'))
    mocks.saveProviderConfig.mockResolvedValueOnce(savedProvider)

    const wrapper = mountConfig(createReactiveProvider())
    const input = wrapper.get<HTMLInputElement>(
      '[data-input-title="intelligence.config.api.baseUrl"] input'
    )
    const editedUrl = 'https://retry.example.test/v1'

    await input.setValue(editedUrl)
    await input.trigger('blur')
    await flushPromises()

    expect(mocks.saveProviderConfig).toHaveBeenCalledTimes(1)
    expect(mocks.updateProvider).not.toHaveBeenCalled()
    expect(input.element.value).toBe(editedUrl)
    expect(wrapper.text()).toContain('intelligence.config.api.baseUrlInvalid')

    await input.trigger('blur')
    await flushPromises()

    expect(mocks.saveProviderConfig).toHaveBeenCalledTimes(2)
    expect(mocks.saveProviderConfig.mock.calls[1][0]).toMatchObject({
      provider: { baseUrl: 'https://retry.example.test/v1' },
      credential: { action: 'preserve' }
    })
    expect(mocks.updateProvider).toHaveBeenCalledTimes(1)
    expect(mocks.updateProvider).toHaveBeenCalledWith('acceptance-ollama', savedProvider)
  })
})

describe('IntelligenceApiConfig ASR channel metadata', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it.each([
    {
      name: 'Bailian Base URL',
      channelType: 'bailian',
      identifier: 'https://workspace-1.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
      baseUrl: 'https://workspace-1.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
      voiceAsr: { protocol: 'bailian-paraformer' }
    },
    {
      name: 'Volcengine resource ID',
      channelType: 'volcengine',
      identifier: 'volc.bigasr.auc_turbo',
      baseUrl: 'http://127.0.0.1:11434/v1',
      voiceAsr: { protocol: 'doubao', resourceId: 'volc.bigasr.auc_turbo' }
    }
  ])(
    'persists $name as safe custom-channel metadata',
    async ({ channelType, identifier, baseUrl, voiceAsr }) => {
      const provider = reactive({
        ...createReactiveProvider(),
        id: `${channelType}-asr`,
        baseUrl: channelType === 'bailian' ? '' : baseUrl,
        metadata: { channelType, origin: 'user-channel' }
      }) as IntelligenceProviderConfig
      mocks.saveProviderConfig.mockResolvedValue({
        ...JSON.parse(JSON.stringify(provider)),
        baseUrl,
        metadata: { ...provider.metadata, voiceAsr }
      })
      const wrapper = mountConfig(provider)
      const channelInput = wrapper.get<HTMLInputElement>(
        `[data-input-title="${channelType === 'bailian' ? 'intelligence.config.api.baseUrl' : 'intelligence.config.api.voiceAsrDoubaoResourceId'}"] input`
      )
      await channelInput.setValue(identifier)
      await channelInput.trigger('blur')
      await flushPromises()

      expect(mocks.saveProviderConfig).toHaveBeenCalledOnce()
      expect(mocks.saveProviderConfig).toHaveBeenCalledWith({
        provider: expect.objectContaining({
          id: `${channelType}-asr`,
          type: 'custom',
          baseUrl,
          metadata: { channelType, origin: 'user-channel', voiceAsr }
        }),
        credential: { action: 'preserve' }
      })
    }
  )

  it('applies a deferred ASR metadata save only to the channel that started it', async () => {
    const savingChannel = reactive({
      ...createReactiveProvider(),
      id: 'volcengine-asr',
      metadata: { channelType: 'volcengine', origin: 'user-channel' }
    }) as IntelligenceProviderConfig
    const switchedChannel = reactive({
      ...createReactiveProvider(),
      id: 'volcengine-other-asr',
      metadata: { channelType: 'volcengine', origin: 'user-channel' }
    }) as IntelligenceProviderConfig
    const savedChannel = {
      ...JSON.parse(JSON.stringify(savingChannel)),
      metadata: {
        ...savingChannel.metadata,
        voiceAsr: { protocol: 'doubao', resourceId: 'volc.bigasr.auc_turbo' }
      }
    } as IntelligenceProviderConfig
    let resolveSave!: (value: IntelligenceProviderConfig) => void
    mocks.saveProviderConfig.mockImplementation(
      () => new Promise<IntelligenceProviderConfig>((resolve) => (resolveSave = resolve))
    )
    const wrapper = mountConfig(savingChannel)
    const voiceAsrInput = wrapper.get<HTMLInputElement>(
      '[data-input-title="intelligence.config.api.voiceAsrDoubaoResourceId"] input'
    )

    await voiceAsrInput.setValue('volc.bigasr.auc_turbo')
    await voiceAsrInput.trigger('blur')
    await flushPromises()
    await wrapper.setProps({ modelValue: switchedChannel })

    resolveSave(savedChannel)
    await flushPromises()

    expect(mocks.updateProvider).toHaveBeenCalledOnce()
    expect(mocks.updateProvider).toHaveBeenCalledWith('volcengine-asr', savedChannel)
    expect(wrapper.emitted('change')).toBeUndefined()
    expect(wrapper.findAll<HTMLInputElement>('input')[1]?.element.value).toBe('')
  })
})

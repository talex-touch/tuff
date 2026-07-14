// @vitest-environment jsdom
import type {
  IntelligenceCapabilityConfig,
  IntelligenceProviderConfig
} from '@talex-touch/tuff-intelligence'
import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AISDKCapabilityDetails from './AISDKCapabilityDetails.vue'

const intelligenceSdk = vi.hoisted(() => ({
  getCapabilityTestMeta: vi.fn(),
  getProviderModelOptions: vi.fn()
}))

vi.mock('@talex-touch/utils/renderer', () => ({
  useIntelligenceSdk: () => intelligenceSdk
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key
  })
}))

vi.mock('@talex-touch/tuffex/button', () => ({
  TxButton: {
    name: 'TxButton',
    props: ['disabled', 'loading'],
    emits: ['click'],
    template:
      '<button :disabled="disabled || loading" @click="$emit(\'click\', $event)"><slot /></button>'
  }
}))

vi.mock('@talex-touch/tuffex/scroll', () => ({
  TxScroll: {
    name: 'TxScroll',
    template: '<section><slot name="header" /><slot /></section>'
  }
}))

vi.mock('@talex-touch/tuffex/drawer', () => ({
  TxDrawer: {
    name: 'TxDrawer',
    props: ['visible'],
    template: '<section v-if="visible"><slot /></section>'
  }
}))

vi.mock('~/utils/renderer-log', () => ({
  createRendererLogger: () => ({
    error: vi.fn()
  })
}))

const capability: IntelligenceCapabilityConfig = {
  id: 'text.chat',
  label: 'Chat',
  providers: [
    { providerId: 'formerly-default', enabled: true, priority: 1 },
    { providerId: 'eligible-bound', enabled: true, priority: 2 }
  ]
}

function createProvider(
  id: string,
  name: string,
  overrides: Partial<IntelligenceProviderConfig> = {}
): IntelligenceProviderConfig {
  return {
    id,
    name,
    type: IntelligenceProviderType.LOCAL,
    enabled: true,
    models: ['test-model'],
    capabilities: ['text.chat'],
    ...overrides
  }
}

function mountCapabilityDetails() {
  return mount(AISDKCapabilityDetails, {
    props: {
      capability,
      providers: [
        createProvider('formerly-default', 'Formerly Default'),
        createProvider('eligible-bound', 'Eligible Bound'),
        createProvider('unbound-eligible', 'Unbound Eligible')
      ],
      bindings: [],
      isTesting: false
    },
    global: {
      stubs: {
        CapabilityModelTransfer: true,
        CapabilityTestResultView: true,
        FlatMarkdown: true,
        FlipDialog: true,
        ProviderList: true,
        TuffBlockSlot: { template: '<section><slot /></section>' },
        TuffDrawer: { props: ['visible'], template: '<section v-if="visible"><slot /></section>' },
        TuffInput: true,
        TuffGroupBlock: { template: '<section><slot /></section>' }
      }
    }
  })
}

describe('AISDKCapabilityDetails capability test dialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    intelligenceSdk.getCapabilityTestMeta.mockResolvedValue({
      requiresUserInput: false,
      inputHint: ''
    })
    intelligenceSdk.getProviderModelOptions.mockResolvedValue([
      {
        providerId: 'formerly-default',
        providerName: 'Formerly Default',
        providerType: IntelligenceProviderType.LOCAL,
        models: ['test-model'],
        defaultModel: 'test-model',
        capabilities: ['text.chat'],
        available: false
      },
      {
        providerId: 'eligible-bound',
        providerName: 'Eligible Bound',
        providerType: IntelligenceProviderType.LOCAL,
        models: ['test-model'],
        defaultModel: 'test-model',
        capabilities: ['text.chat'],
        available: true
      },
      {
        providerId: 'unbound-eligible',
        providerName: 'Unbound Eligible',
        providerType: IntelligenceProviderType.LOCAL,
        models: ['test-model'],
        defaultModel: 'test-model',
        capabilities: ['text.chat'],
        available: true
      }
    ])
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('offers only bound providers eligible for the capability and selects the remaining choice', async () => {
    const wrapper = mountCapabilityDetails()

    await wrapper.get('button.test-button').trigger('click')
    await flushPromises()

    const providerChoices = wrapper.get('.provider-select-list').text()
    expect(providerChoices).toContain('Eligible Bound')
    expect(providerChoices).not.toContain('Formerly Default')
    expect(providerChoices).not.toContain('Unbound Eligible')

    const runTestButton = wrapper.findAll('.capability-test-dialog__actions button')[1]
    await runTestButton.trigger('click')

    expect(wrapper.emitted('test')).toEqual([
      [{ providerId: 'eligible-bound', userInput: undefined }]
    ])
  })
})

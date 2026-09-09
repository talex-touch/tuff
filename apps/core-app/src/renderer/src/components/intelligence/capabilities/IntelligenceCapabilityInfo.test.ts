// @vitest-environment jsdom
import type {
  IntelligenceCapabilityConfig,
  IntelligenceProviderConfig
} from '@talex-touch/tuff-intelligence'
import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import CapabilityModelTransfer from './CapabilityModelTransfer.vue'
import IntelligenceCapabilityInfo from './IntelligenceCapabilityInfo.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key
  })
}))

vi.mock('@talex-touch/tuffex/scroll', () => ({
  TxScroll: {
    name: 'TxScroll',
    template: '<section><slot name="header" /><slot /><slot name="footer" /></section>'
  }
}))

vi.mock('@talex-touch/tuffex/drawer', () => ({
  TxDrawer: {
    name: 'TxDrawer',
    props: ['visible'],
    template: '<section v-if="visible"><slot /></section>'
  }
}))

const capability: IntelligenceCapabilityConfig = {
  id: 'audio.asr',
  label: 'Realtime ASR',
  providers: [{ providerId: 'dashscope', enabled: true, priority: 1, models: [] }]
}

const provider: IntelligenceProviderConfig = {
  id: 'dashscope',
  name: 'DashScope',
  type: IntelligenceProviderType.LOCAL,
  enabled: true,
  models: ['qwen-audio-3.0-asr-flash', 'qwen3.8-max'],
  capabilities: ['audio.asr']
}

describe('intelligenceCapabilityInfo model binding', () => {
  it('forwards a transfer update as updateModels for the focused provider', async () => {
    const wrapper = mount(IntelligenceCapabilityInfo, {
      props: {
        capability,
        providers: [provider],
        bindings: [{ providerId: 'dashscope', enabled: true, priority: 1, models: [], provider }],
        isTesting: false,
        hasPendingChanges: false,
        isSaving: false,
        saveState: 'idle' as const
      },
      global: {
        stubs: {
          // Always render the dialog body so the transfer is mounted without
          // driving the open interaction.
          FlipDialog: { template: '<section><slot /></section>' },
          CapabilityHeader: true,
          CapabilityOverview: true,
          CapabilityTestDialog: true,
          FlatMarkdown: true,
          ProviderList: true,
          TestSection: true,
          TuffBlockSlot: { template: '<section><slot /></section>' },
          TuffGroupBlock: { template: '<section><slot /></section>' }
        }
      }
    })

    const transfer = wrapper.findComponent(CapabilityModelTransfer)
    expect(transfer.exists()).toBe(true)

    transfer.vm.$emit('update:modelValue', ['qwen-audio-3.0-asr-flash'])
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('updateModels')?.[0]).toEqual([
      'dashscope',
      ['qwen-audio-3.0-asr-flash']
    ])
  })
})

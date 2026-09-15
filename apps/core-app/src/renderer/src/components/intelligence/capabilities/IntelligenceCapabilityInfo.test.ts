// @vitest-environment jsdom
import type {
  IntelligenceCapabilityConfig,
  IntelligenceProviderConfig
} from '@talex-touch/tuff-intelligence'
import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'
import { mount, type VueWrapper } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import type { CapabilityBinding } from './types'
import CapabilityModelTransfer from './CapabilityModelTransfer.vue'
import IntelligenceCapabilityInfo from './IntelligenceCapabilityInfo.vue'

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

/** The prompt editor is Milkdown; only its v-model contract is needed here. */
const flatMarkdownStub = {
  name: 'FlatMarkdown',
  props: {
    modelValue: { type: String, default: '' },
    readonly: { type: Boolean, default: false }
  },
  emits: ['update:modelValue'],
  template:
    '<textarea class="flat-markdown-stub" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
}

const stubs = {
  CapabilityOverview: true,
  FlatMarkdown: flatMarkdownStub,
  ProviderList: true,
  TestSection: true,
  // Carries the row title out as an attribute so a test can address one row.
  TuffBlockSlot: {
    props: ['title'],
    template: '<section class="block" :data-title="title"><slot /></section>'
  },
  TuffGroupBlock: { template: '<section><slot /></section>' }
}

type InfoProps = {
  capability: IntelligenceCapabilityConfig
  providers: IntelligenceProviderConfig[]
  bindings: CapabilityBinding[]
  isTesting: boolean
  hasPendingChanges: boolean
  isSaving: boolean
  saveState: 'idle' | 'dirty' | 'saved' | 'error'
  saveErrorDetail: string
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
    models: ['qwen-audio-3.0-asr-flash'],
    capabilities: ['audio.asr'],
    ...overrides
  }
}

const dashscope = createProvider('dashscope', 'DashScope')
const volcengine = createProvider('volcengine-asr', 'Volcengine ASR')

const capability: IntelligenceCapabilityConfig = {
  id: 'audio.asr',
  label: 'Realtime ASR',
  providers: [{ providerId: 'dashscope', enabled: true, priority: 1, models: [] }]
}

function mountInfo(overrides: Partial<InfoProps> = {}): VueWrapper {
  return mount(IntelligenceCapabilityInfo, {
    props: {
      capability,
      providers: [dashscope],
      bindings: [
        { providerId: 'dashscope', enabled: true, priority: 1, models: [], provider: dashscope }
      ],
      isTesting: false,
      hasPendingChanges: false,
      isSaving: false,
      saveState: 'idle',
      ...overrides
    },
    global: { stubs }
  })
}

function buttonByLabel(wrapper: VueWrapper, label: string) {
  const button = wrapper.findAll('button').find((candidate) => candidate.text() === label)
  if (!button) throw new Error(`no button labelled "${label}"`)
  return button
}

function manageModelsButton(wrapper: VueWrapper, rowTitle: string) {
  return wrapper.get(`.block[data-title="${rowTitle}"] button`)
}

describe('intelligenceCapabilityInfo model transfer drawer', () => {
  it('opens the drawer from the clicked binding row and forwards the update for that provider', async () => {
    const wrapper = mountInfo({
      capability: {
        id: 'audio.asr',
        label: 'Realtime ASR',
        providers: [
          { providerId: 'dashscope', enabled: true, priority: 1, models: [] },
          { providerId: 'volcengine-asr', enabled: true, priority: 2, models: [] }
        ]
      },
      providers: [dashscope, volcengine]
    })

    // The transfer only exists while the drawer is open — no stub renders it for free.
    expect(wrapper.findComponent(CapabilityModelTransfer).exists()).toBe(false)

    await manageModelsButton(wrapper, 'Volcengine ASR').trigger('click')

    const transfer = wrapper.findComponent(CapabilityModelTransfer)
    expect(transfer.exists()).toBe(true)

    transfer.vm.$emit('update:modelValue', ['qwen-audio-3.0-asr-flash'])
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('updateModels')?.[0]).toEqual([
      'volcengine-asr',
      ['qwen-audio-3.0-asr-flash']
    ])

    wrapper.unmount()
  })

  it('refuses to open the drawer for a binding whose provider record is gone', async () => {
    const wrapper = mountInfo({
      capability: {
        id: 'audio.asr',
        label: 'Realtime ASR',
        providers: [{ providerId: 'orphan-channel', enabled: true, priority: 1, models: [] }]
      },
      providers: []
    })

    await manageModelsButton(wrapper, 'orphan-channel').trigger('click')

    expect(wrapper.findComponent(CapabilityModelTransfer).exists()).toBe(false)

    wrapper.unmount()
  })

  it('offers the model transfer only for bindings enabled on this capability', () => {
    const retired = createProvider('retired-channel', 'Retired Channel')
    const wrapper = mountInfo({
      capability: {
        id: 'audio.asr',
        label: 'Realtime ASR',
        providers: [
          { providerId: 'dashscope', enabled: true, priority: 1, models: [] },
          { providerId: 'retired-channel', enabled: false, priority: 2, models: [] }
        ]
      },
      providers: [dashscope, retired]
    })

    // `manageModelsButton` uses `get`, which throws when the enabled binding has no row.
    expect(manageModelsButton(wrapper, 'DashScope').text()).toContain(
      'settings.intelligence.manageModels'
    )
    expect(wrapper.find('.block[data-title="Retired Channel"]').exists()).toBe(false)

    wrapper.unmount()
  })
})

describe('intelligenceCapabilityInfo autosave status', () => {
  it('reports a write in flight as saving, over any earlier error state', async () => {
    const wrapper = mountInfo({ isSaving: true })

    const status = wrapper.get('.capability-info__save-status')
    expect(status.attributes('data-status')).toBe('saving')
    expect(status.text()).toBe('settings.intelligence.autoSaveSaving')

    await wrapper.setProps({ saveState: 'error', saveErrorDetail: 'disk full' })

    expect(status.attributes('data-status')).toBe('saving')
    expect(status.text()).toBe('settings.intelligence.autoSaveSaving')

    wrapper.unmount()
  })

  it('surfaces the failing write reason instead of a bare failure message', async () => {
    const wrapper = mountInfo({ saveState: 'error', saveErrorDetail: 'disk full' })

    const status = wrapper.get('.capability-info__save-status')
    expect(status.attributes('data-status')).toBe('error')
    expect(status.text()).toBe('settings.intelligence.capabilitySaveErrorWithDetail')

    await wrapper.setProps({ saveErrorDetail: '' })

    expect(status.text()).toBe('settings.intelligence.capabilitySaveError')

    wrapper.unmount()
  })

  it('leaves the header with the test action as its only button', () => {
    const wrapper = mountInfo({ hasPendingChanges: true, saveState: 'dirty' })

    const actions = wrapper.get('.capability-info__header-actions')
    expect(actions.findAll('button').map((button) => button.text())).toEqual([
      'settings.intelligence.capabilityTest'
    ])
    expect(wrapper.find('.capability-info__save-button').exists()).toBe(false)

    wrapper.unmount()
  })
})

describe('intelligenceCapabilityInfo prompt ownership', () => {
  it('flushes a pending prompt edit under its own capability id', async () => {
    const wrapper = mountInfo()

    await buttonByLabel(wrapper, 'settings.intelligence.editPrompt').trigger('click')
    await wrapper.get('textarea.flat-markdown-stub').setValue('改写后的提示词')

    wrapper.unmount()

    expect(wrapper.emitted('updatePrompt')?.at(-1)).toEqual(['audio.asr', '改写后的提示词'])
  })
})

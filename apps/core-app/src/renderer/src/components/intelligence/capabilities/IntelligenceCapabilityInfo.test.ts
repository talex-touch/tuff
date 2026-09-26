// @vitest-environment jsdom
import type {
  IntelligenceCapabilityConfig,
  IntelligenceProviderConfig
} from '@talex-touch/tuff-intelligence'
import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'
import { mount, type VueWrapper } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, reactive, ref } from 'vue'
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
  onUpdatePrompt: (capabilityId: string, prompt: string) => void
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

  it('writes nothing when the prompt was only viewed', () => {
    const { wrapper, writes } = mountPromptEditor({ promptTemplate: '已保存的提示词' })

    wrapper.unmount()

    expect(writes).toEqual([])
  })

  it('does not write back a prompt the store pushed in', async () => {
    vi.useFakeTimers()
    try {
      const { wrapper, writes } = mountPromptEditor()

      await wrapper.setProps({ capability: { ...capability, promptTemplate: '来自存储的提示词' } })
      // Past the editor's 800 ms debounce: a store value must not come back as a scheduled edit.
      vi.advanceTimersByTime(1000)
      wrapper.unmount()

      expect(writes).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })

  it('flushes the outgoing draft under its own id when the editor is reused for another capability', async () => {
    const { wrapper, writes } = mountPromptEditor()

    await buttonByLabel(wrapper, 'settings.intelligence.editPrompt').trigger('click')
    await wrapper.get('textarea.flat-markdown-stub').setValue('语音识别的草稿')
    await wrapper.setProps({
      capability: {
        id: 'text.translate',
        label: 'Translation',
        providers: [],
        promptTemplate: '译'
      }
    })
    wrapper.unmount()

    expect(writes).toEqual([['audio.asr', '语音识别的草稿']])
  })
})

/**
 * Records every prompt write through the listener prop. `wrapper.emitted()` is not enough here:
 * `unmount()` clears the component's emit history before tearing it down, so it only shows what was
 * emitted during the unmount itself.
 */
function mountPromptEditor(overrides: Partial<IntelligenceCapabilityConfig> = {}) {
  const writes: Array<[string, string]> = []
  const wrapper = mountInfo({
    capability: { ...capability, ...overrides },
    onUpdatePrompt: (capabilityId, prompt) => writes.push([capabilityId, prompt])
  })
  return { wrapper, writes }
}

/**
 * The 2026-09-15 incident, reproduced: `text.chat` ended up with the prompt "text.translate" and
 * `text.translate` with "text.chat".
 *
 * The settings page is KeepAlive-cached, and Vue's HMR does not replace a deactivated cached
 * instance. When da593d482 changed `updatePrompt` from `[prompt]` to `[capabilityId, prompt]`, this
 * editor was re-mounted with the new emit while the cached page kept its old handler, which took
 * the first argument as the prompt and wrote it to whatever capability was selected by then. The
 * editor flushed on every unmount, so a plain click from one capability to the next wrote the
 * outgoing capability's id into the incoming one.
 *
 * The harness renders the editor the way the page does — keyed by the selection — and binds the
 * handler that cached page still ran. Only an actual edit may reach a page handler, so switching
 * capabilities must leave every stored prompt alone whatever the handler does with its arguments.
 */
describe('intelligenceCapabilityInfo capability switch', () => {
  const translatePrompt =
    '你是专业翻译助手。请将以下文本翻译成 {{targetLang}}，只返回译文，不要解释。'

  it('leaves every stored prompt alone when switching capabilities without an edit', async () => {
    const store = reactive<Record<string, IntelligenceCapabilityConfig>>({
      'text.chat': { id: 'text.chat', label: 'Chat', providers: [] },
      'text.translate': {
        id: 'text.translate',
        label: 'Translation',
        providers: [],
        promptTemplate: translatePrompt
      }
    })
    const selectedId = ref('text.chat')
    const writes: unknown[][] = []
    /** The page handler from before da593d482, as the cached page instance still ran it. */
    function stalePageUpdatePrompt(...args: unknown[]): void {
      writes.push(args)
      store[selectedId.value]!.promptTemplate = args[0] as string
    }

    const Harness = defineComponent({
      setup: () => () =>
        h('div', { key: selectedId.value }, [
          h(IntelligenceCapabilityInfo, {
            capability: store[selectedId.value]!,
            providers: [],
            bindings: [],
            isTesting: false,
            hasPendingChanges: false,
            isSaving: false,
            saveState: 'idle',
            onUpdatePrompt: stalePageUpdatePrompt
          })
        ])
    })
    const wrapper = mount(Harness, { global: { stubs } })

    selectedId.value = 'text.translate'
    await nextTick()
    selectedId.value = 'text.chat'
    await nextTick()

    expect(writes).toEqual([])
    expect(store['text.chat']!.promptTemplate).toBeUndefined()
    expect(store['text.translate']!.promptTemplate).toBe(translatePrompt)

    wrapper.unmount()
  })
})

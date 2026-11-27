// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import type { AppSetting } from '@talex-touch/utils'
import type { VoiceInputSetting } from '@talex-touch/utils/common/storage/entity/app-settings'
import type * as VueModule from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SettingSpeechRecognition from './SettingSpeechRecognition.vue'

type SpeechSettingsFixture = Pick<AppSetting, 'voiceWake'> & {
  /** The floating entry's old master switch: gone from AppSetting, still read by the migration. */
  assistant?: { enabled: boolean }
  voiceInput?: VoiceInputSetting
}

const settings = vi.hoisted(() => {
  const { reactive } = require('vue') as typeof VueModule
  return reactive({} as SpeechSettingsFixture)
})

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('~/modules/storage/app-storage', () => ({
  appSetting: settings
}))

function mountSettings(): VueWrapper {
  return mount(SettingSpeechRecognition, {
    global: {
      stubs: {
        TuffGroupBlock: { template: '<section><slot /></section>' },
        TuffBlockSlot: {
          props: ['title', 'description'],
          template: '<section>{{ title }}{{ description }}<slot /></section>'
        },
        TuffBlockSwitch: {
          name: 'TuffBlockSwitch',
          props: ['modelValue', 'title'],
          emits: ['update:modelValue'],
          template: '<section>{{ title }}<slot name="tags" /></section>'
        },
        TxTag: {
          name: 'TxTag',
          props: ['size', 'type'],
          template: '<span><slot /></span>'
        },
        TuffBlockSelect: {
          name: 'TuffBlockSelect',
          props: ['modelValue', 'title', 'description'],
          emits: ['update:modelValue'],
          template: '<section><span>{{ title }}</span><slot /></section>'
        },
        TuffBlockFlatRadio: {
          name: 'TuffBlockFlatRadio',
          props: ['modelValue', 'title', 'description'],
          emits: ['update:modelValue'],
          template: '<section>{{ title }}</section>'
        },
        TuffSelectItem: {
          name: 'TuffSelectItem',
          props: ['value'],
          template: '<option :value="value"><slot /></option>'
        },
        TxButton: {
          name: 'TxButton',
          props: ['disabled'],
          emits: ['click'],
          template:
            '<button :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>'
        },
        VoiceProviderCatalogSettings: {
          name: 'VoiceProviderCatalogSettings',
          template: '<section />'
        },
        // The on-device model block is a separate component with its own suite; here the only
        // contract is which dictation source the page hands it, so the stub exposes just that.
        SpeechModelSettings: {
          name: 'SpeechModelSettings',
          props: ['source'],
          template: '<section data-testid="speech-model-settings" />'
        }
      }
    }
  })
}

function controlByTitle(wrapper: VueWrapper, title: string) {
  const control = wrapper
    .findAllComponents({ name: 'TuffBlockSwitch' })
    .find((candidate) => candidate.props('title') === title)
  if (!control) throw new Error(`Switch ${title} was not rendered`)
  return control
}

function resetSettings(): void {
  settings.voiceWake = {
    enabled: false,
    wakeWords: ['Alo'],
    language: 'en-US',
    continuous: true,
    cooldownMs: 2200,
    openPanelOnWake: true
  }
  settings.voiceInput = {
    enabled: false,
    language: 'fr-FR',
    historyEnabled: true,
    polishEnabled: true,
    polishStrength: 'structured'
  }
}

/** Writes the source as stored, including values this build does not recognise. */
function storeVoiceSource(source: unknown): void {
  const voiceInput = { ...settings.voiceInput, source }
  // Deliberately outside VoiceAsrSource: the page has to survive a settings file written by a
  // build whose source names differ from this one's.
  settings.voiceInput = voiceInput as VoiceInputSetting
}

describe('SettingSpeechRecognition', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetSettings()
  })

  it('normalizes a legacy enabled voice setting into the independent Voice Input control', async () => {
    settings.assistant = { enabled: true }
    settings.voiceWake.enabled = true
    settings.voiceWake.language = 'fr-FR'
    delete settings.voiceInput

    const wrapper = mountSettings()
    await flushPromises()

    expect(
      controlByTitle(wrapper, 'settingSpeechRecognition.input.title').props('modelValue')
    ).toBe(true)
    expect(settings.voiceInput).toMatchObject({ enabled: true, language: 'fr-FR' })

    wrapper.unmount()
  })

  it('toggles Voice Input without changing strength or history settings', async () => {
    const wrapper = mountSettings()
    await flushPromises()

    await controlByTitle(wrapper, 'settingSpeechRecognition.input.title').vm.$emit(
      'update:modelValue',
      true
    )

    expect(settings.voiceInput).toMatchObject({
      enabled: true,
      language: 'fr-FR',
      historyEnabled: true,
      polishEnabled: true,
      polishStrength: 'structured'
    })

    wrapper.unmount()
  })

  it('keeps the selected polish strength when polish is hidden and enabled again', async () => {
    const wrapper = mountSettings()
    await flushPromises()

    const select = wrapper.getComponent({ name: 'TuffBlockSelect' })
    expect(select.props('modelValue')).toBe('structured')
    expect(wrapper.findAll('option').map((option) => option.attributes('value'))).toEqual([
      'natural',
      'structured',
      'deep'
    ])

    await select.vm.$emit('update:modelValue', 'natural')
    await controlByTitle(wrapper, 'settingSpeechRecognition.polish.title').vm.$emit(
      'update:modelValue',
      false
    )
    await flushPromises()

    expect(wrapper.findComponent({ name: 'TuffBlockSelect' }).exists()).toBe(false)
    expect(settings.voiceInput?.polishStrength).toBe('natural')

    await controlByTitle(wrapper, 'settingSpeechRecognition.polish.title').vm.$emit(
      'update:modelValue',
      true
    )
    await flushPromises()

    expect(wrapper.getComponent({ name: 'TuffBlockSelect' }).props('modelValue')).toBe('natural')
    wrapper.unmount()
  })

  it('turns noise suppression on without disturbing the other voice preferences', async () => {
    const wrapper = mountSettings()
    await flushPromises()

    const control = controlByTitle(wrapper, 'settingSpeechRecognition.noiseSuppression.title')
    // Absent in storage has to read as off, not as "unset" that the switch renders however.
    expect(control.props('modelValue')).toBe(false)

    await control.vm.$emit('update:modelValue', true)

    expect(settings.voiceInput).toMatchObject({
      noiseSuppression: true,
      enabled: false,
      language: 'fr-FR',
      historyEnabled: true,
      polishEnabled: true,
      polishStrength: 'structured'
    })

    await control.vm.$emit('update:modelValue', false)
    expect(settings.voiceInput).toMatchObject({ noiseSuppression: false })

    wrapper.unmount()
  })

  it.each([
    { name: 'a profile with an unset source', stored: undefined },
    { name: 'a stored value outside the three sources', stored: 'edge' }
  ])('shows $name as the hybrid dictation source', async ({ stored }) => {
    storeVoiceSource(stored)

    const wrapper = mountSettings()
    await flushPromises()

    expect(wrapper.getComponent({ name: 'TuffBlockFlatRadio' }).props('modelValue')).toBe('hybrid')

    wrapper.unmount()
  })

  it.each(['local', 'cloud'])(
    'stores a %s dictation source without disturbing the sibling preferences',
    async (source) => {
      const wrapper = mountSettings()
      await flushPromises()

      const selector = wrapper.getComponent({ name: 'TuffBlockFlatRadio' })
      await selector.vm.$emit('update:modelValue', source)

      expect(settings.voiceInput).toMatchObject({
        source,
        enabled: false,
        language: 'fr-FR',
        historyEnabled: true,
        polishEnabled: true,
        polishStrength: 'structured'
      })

      wrapper.unmount()
    }
  )

  /**
   * The on-device model block phrases a catalog failure around the dictation source the reader
   * picked, so it has to receive that source — normalized the same way the radio is. A settings
   * file written by another build can hold a name this one does not know, and the block must never
   * be handed a value the radio would never have shown.
   */
  it.each([
    { name: 'an unset source', stored: undefined, expected: 'hybrid' },
    { name: 'a value outside the three sources', stored: 'edge', expected: 'hybrid' },
    { name: 'local', stored: 'local', expected: 'local' },
    { name: 'cloud', stored: 'cloud', expected: 'cloud' }
  ])('hands $name to the on-device model settings', async ({ stored, expected }) => {
    storeVoiceSource(stored)

    const wrapper = mountSettings()
    await flushPromises()

    expect(wrapper.getComponent({ name: 'SpeechModelSettings' }).props('source')).toBe(expected)

    wrapper.unmount()
  })

  /**
   * The two blocks read the same preference. Switching the radio re-points the failure copy in the
   * model block on the spot, rather than leaving it describing the source the user just left.
   */
  it('re-points the on-device model settings when the dictation source changes', async () => {
    storeVoiceSource('hybrid')

    const wrapper = mountSettings()
    await flushPromises()
    expect(wrapper.getComponent({ name: 'SpeechModelSettings' }).props('source')).toBe('hybrid')

    await wrapper
      .getComponent({ name: 'TuffBlockFlatRadio' })
      .vm.$emit('update:modelValue', 'local')
    await flushPromises()

    expect(wrapper.getComponent({ name: 'SpeechModelSettings' }).props('source')).toBe('local')
    expect(settings.voiceInput?.source).toBe('local')

    wrapper.unmount()
  })

  it('saves custom words when input changes', async () => {
    const wrapper = mountSettings()
    await flushPromises()

    const input = wrapper.find('[data-testid="voice-custom-words"] input')
    expect(input.exists()).toBe(true)

    await input.setValue('SGLang, vLLM, DeepSeek, SGLang')
    await input.trigger('change')
    await flushPromises()

    expect(settings.voiceInput?.customWords).toEqual(['SGLang', 'vLLM', 'DeepSeek'])
    wrapper.unmount()
  })

  it('switches history retention TTL between 7d, 30d, and off while syncing historyEnabled', async () => {
    const wrapper = mountSettings()
    await flushPromises()

    const chips = wrapper.find('[data-testid="voice-history-retention-chips"]')
    expect(chips.exists()).toBe(true)

    const buttons = chips.findAll('button')
    expect(buttons).toHaveLength(3)

    // Choose 7d
    await buttons[0]!.trigger('click')
    await flushPromises()
    expect(settings.voiceInput?.historyRetention).toBe('7d')
    expect(settings.voiceInput?.historyEnabled).toBe(true)

    // Choose off
    await buttons[2]!.trigger('click')
    await flushPromises()
    expect(settings.voiceInput?.historyRetention).toBe('off')
    expect(settings.voiceInput?.historyEnabled).toBe(false)

    // Re-enabling the boolean toggle restores the default 30d retention period
    await controlByTitle(wrapper, 'settingSpeechRecognition.history.title').vm.$emit(
      'update:modelValue',
      true
    )
    await flushPromises()
    expect(settings.voiceInput?.historyEnabled).toBe(true)
    expect(settings.voiceInput?.historyRetention).toBe('30d')

    wrapper.unmount()
  })

  it('supports manual dictionary CRUD with manual and auto source badges', async () => {
    settings.voiceInput = {
      ...settings.voiceInput!,
      dictionaryEntries: [
        { term: 'SGLang', source: 'manual', createdAt: 10 },
        { term: 'Qwen3', source: 'auto', createdAt: 20 }
      ],
      customWords: ['SGLang', 'Qwen3']
    }

    const wrapper = mountSettings()
    await flushPromises()

    const sources = wrapper
      .findAll('[data-testid="voice-dictionary-source"]')
      .map((node) => node.attributes('data-source'))
    expect(sources).toEqual(['manual', 'auto'])

    // Add a new term via Add button
    const input = wrapper.find('[data-testid="voice-custom-words"] input')
    await input.setValue('vLLM')
    await wrapper.find('[data-testid="voice-dictionary-add"]').trigger('click')
    await flushPromises()
    expect(settings.voiceInput?.customWords).toEqual(['SGLang', 'Qwen3', 'vLLM'])

    // Edit an auto-learned term inline (upgrades its source to manual)
    const editButtons = wrapper.findAll('[data-testid="voice-dictionary-edit"]')
    await editButtons[1]!.trigger('click')
    await flushPromises()
    const editInput = wrapper.find('[data-testid="voice-dictionary-edit-input"]')
    await editInput.setValue('Qwen3-ASR')
    await wrapper.find('[data-testid="voice-dictionary-save"]').trigger('click')
    await flushPromises()
    expect(settings.voiceInput?.customWords).toEqual(['SGLang', 'Qwen3-ASR', 'vLLM'])
    expect(
      settings.voiceInput?.dictionaryEntries?.find((e) => e.term === 'Qwen3-ASR')?.source
    ).toBe('manual')

    // Remove the first entry
    const removeButtons = wrapper.findAll('[data-testid="voice-dictionary-remove"]')
    await removeButtons[0]!.trigger('click')
    await flushPromises()
    expect(settings.voiceInput?.customWords).toEqual(['Qwen3-ASR', 'vLLM'])

    wrapper.unmount()
  })
})

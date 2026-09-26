// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import type { AppSetting } from '@talex-touch/utils'
import type { VoiceInputSetting } from '@talex-touch/utils/common/storage/entity/app-settings'
import type * as VueModule from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SettingSpeechRecognition from './SettingSpeechRecognition.vue'

type SpeechSettingsFixture = Pick<AppSetting, 'assistant' | 'floatingBall' | 'voiceWake'> & {
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
  settings.assistant = { enabled: false }
  settings.floatingBall = {
    enabled: false,
    size: 56,
    opacity: 1,
    edgePadding: 24,
    position: { x: -1, y: -1 }
  }
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
    settings.assistant.enabled = true
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

  it('toggles Voice Input without changing assistant, floating-ball, strength, or history settings', async () => {
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
    expect(settings.assistant.enabled).toBe(false)
    expect(settings.floatingBall.enabled).toBe(false)

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
})

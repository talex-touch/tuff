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

const router = vi.hoisted(() => ({ push: vi.fn() }))
const settings = vi.hoisted(() => {
  const { reactive } = require('vue') as typeof VueModule
  return reactive({} as SpeechSettingsFixture)
})

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('vue-router', () => ({
  useRouter: () => router
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
          template: '<section>{{ title }}</section>'
        },
        TuffBlockSelect: {
          name: 'TuffBlockSelect',
          props: ['modelValue', 'title', 'description'],
          emits: ['update:modelValue'],
          template: '<section><span>{{ title }}</span><slot /></section>'
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

  it('opens Intelligence capabilities from the speech settings surface', async () => {
    const wrapper = mountSettings()
    await flushPromises()

    await wrapper.get('[data-testid="voice-open-capabilities"]').trigger('click')

    expect(router.push).toHaveBeenCalledWith('/setting/intelligence/capabilities')
    wrapper.unmount()
  })
})

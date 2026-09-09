// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils'
import type { AppSetting } from '@talex-touch/utils'
import type * as VueModule from 'vue'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SettingSpeechRecognition from './SettingSpeechRecognition.vue'

type SpeechSettingsFixture = Pick<AppSetting, 'assistant' | 'floatingBall' | 'voiceWake'> & {
  voiceInput?: { enabled: boolean; language: string; historyEnabled?: boolean }
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
  settings.voiceInput = { enabled: false, language: 'en-US', historyEnabled: false }
}

function mountSettings(): VueWrapper {
  return mount(SettingSpeechRecognition, {
    global: {
      stubs: {
        TuffGroupBlock: { template: '<section><slot /></section>' },
        TuffBlockSlot: {
          props: ['title', 'description'],
          template: '<section><slot /></section>'
        },
        TuffBlockSwitch: {
          props: ['modelValue', 'title'],
          emits: ['update:modelValue'],
          template:
            '<label><span>{{ title }}</span><input type="checkbox" :aria-label="title" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)" /></label>'
        },
        TxButton: {
          props: ['disabled'],
          emits: ['click'],
          template:
            '<button v-bind="$attrs" :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>'
        }
      }
    }
  })
}

function switchControl(wrapper: VueWrapper, title: string) {
  return wrapper.get<HTMLInputElement>(`input[aria-label="${title}"]`)
}

describe('SettingSpeechRecognition', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetSettings()
  })

  it('migrates missing voice input from enabled legacy settings', async () => {
    settings.assistant.enabled = true
    settings.voiceWake.enabled = true
    settings.voiceWake.language = 'fr-FR'
    delete settings.voiceInput

    const wrapper = mountSettings()
    await nextTick()

    expect(settings.voiceInput).toEqual({ enabled: true, language: 'fr-FR' })
    expect(
      switchControl(wrapper, 'settingSpeechRecognition.voiceInput.title').element.checked
    ).toBe(true)

    wrapper.unmount()
  })

  it('keeps an explicitly disabled voice input disabled despite enabled legacy settings', async () => {
    settings.assistant.enabled = true
    settings.floatingBall.enabled = true
    settings.voiceWake.enabled = true
    settings.voiceWake.language = 'en-US'
    settings.voiceInput = { enabled: false, language: 'fr-FR', historyEnabled: true }

    const wrapper = mountSettings()
    await nextTick()

    expect(
      switchControl(wrapper, 'settingSpeechRecognition.voiceInput.title').element.checked
    ).toBe(false)
    expect(settings.voiceInput).toEqual({ enabled: false, language: 'fr-FR', historyEnabled: true })

    wrapper.unmount()
  })

  it('changes voice input without changing Assistant, floating ball, legacy wake, language, or history', async () => {
    settings.voiceWake.enabled = true
    settings.voiceInput = { enabled: false, language: 'fr-FR', historyEnabled: true }

    const wrapper = mountSettings()
    await switchControl(wrapper, 'settingSpeechRecognition.voiceInput.title').setValue(true)

    expect(settings.voiceInput).toEqual({ enabled: true, language: 'fr-FR', historyEnabled: true })
    expect(settings.assistant).toEqual({ enabled: false })
    expect(settings.floatingBall).toEqual({
      enabled: false,
      size: 56,
      opacity: 1,
      edgePadding: 24,
      position: { x: -1, y: -1 }
    })
    expect(settings.voiceWake).toEqual({
      enabled: true,
      wakeWords: ['Alo'],
      language: 'en-US',
      continuous: true,
      cooldownMs: 2200,
      openPanelOnWake: true
    })

    wrapper.unmount()
  })

  it('opens the existing capability configuration route', async () => {
    const wrapper = mountSettings()

    await wrapper.get('[data-testid="voice-open-capabilities"]').trigger('click')

    expect(router.push).toHaveBeenCalledWith('/setting/intelligence/capabilities')

    wrapper.unmount()
  })
})

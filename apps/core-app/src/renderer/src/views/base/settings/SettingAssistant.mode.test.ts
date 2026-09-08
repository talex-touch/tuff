// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils'
import type { AppSetting } from '@talex-touch/utils'
import type * as VueModule from 'vue'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SettingAssistant from './SettingAssistant.vue'

type AssistantSettingsFixture = Pick<AppSetting, 'assistant' | 'floatingBall' | 'voiceWake'> & {
  voiceInput?: AppSetting['voiceInput']
}

const appSetting = vi.hoisted(() => {
  const { reactive } = require('vue') as typeof VueModule
  return reactive({} as AssistantSettingsFixture)
})

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('~/modules/storage/app-storage', () => ({ appSetting }))

function resetAppSetting(): void {
  appSetting.assistant = { enabled: false }
  appSetting.floatingBall = {
    enabled: false,
    size: 56,
    opacity: 1,
    edgePadding: 24,
    position: { x: -1, y: -1 }
  }
  appSetting.voiceWake = {
    enabled: false,
    wakeWords: ['Alo'],
    language: 'en-US',
    continuous: true,
    cooldownMs: 2200,
    openPanelOnWake: true
  }
  delete appSetting.voiceInput
}

function mountSettingAssistant() {
  return mount(SettingAssistant, {
    props: { mode: 'advanced' },
    global: {
      stubs: {
        TuffGroupBlock: { template: '<section><slot /></section>' },
        TuffBlockSwitch: {
          template:
            '<label><span>{{ title }}</span><input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)" /></label>',
          props: ['modelValue', 'title'],
          emits: ['update:modelValue']
        },
        TuffBlockSlot: { template: '<section><span>{{ title }}</span></section>', props: ['title'] }
      }
    }
  })
}

function voiceInputControl(wrapper: VueWrapper) {
  const label = wrapper
    .findAll('label')
    .find((candidate) => candidate.text().includes('settingAssistant.voiceInput'))
  if (!label) throw new Error('Voice input switch was not rendered')
  return label.get<HTMLInputElement>('input')
}

describe('SettingAssistant independent voice input', () => {
  beforeEach(() => {
    resetAppSetting()
  })

  it('migrates enabled legacy voice settings even when the floating entry is off', async () => {
    appSetting.assistant.enabled = true
    appSetting.floatingBall.enabled = false
    appSetting.voiceWake.enabled = true
    appSetting.voiceWake.language = 'fr-FR'

    const wrapper = mountSettingAssistant()
    await nextTick()

    expect(appSetting.voiceInput).toEqual({ enabled: true, language: 'fr-FR' })
    wrapper.unmount()
  })

  it('keeps an explicitly disabled voice input disabled when all legacy controls are enabled', async () => {
    appSetting.assistant.enabled = true
    appSetting.floatingBall.enabled = true
    appSetting.voiceWake.enabled = true
    appSetting.voiceInput = { enabled: false, language: 'fr-FR' }

    const wrapper = mountSettingAssistant()
    await nextTick()

    expect(voiceInputControl(wrapper).element.checked).toBe(false)
    expect(appSetting.voiceInput).toEqual({ enabled: false, language: 'fr-FR' })
    wrapper.unmount()
  })

  it('changes voice input without enabling legacy assistant controls', async () => {
    appSetting.voiceInput = { enabled: false, language: 'fr-FR' }
    const wrapper = mountSettingAssistant()
    await voiceInputControl(wrapper).setValue(true)

    expect(appSetting.voiceInput.enabled).toBe(true)
    expect(appSetting.assistant.enabled).toBe(false)
    expect(appSetting.floatingBall.enabled).toBe(false)
    expect(appSetting.voiceWake.enabled).toBe(false)
    wrapper.unmount()
  })
})

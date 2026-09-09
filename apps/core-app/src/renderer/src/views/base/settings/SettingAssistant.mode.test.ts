// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils'
import type { AppSetting } from '@talex-touch/utils'
import type * as VueModule from 'vue'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SettingAssistant from './SettingAssistant.vue'

type AssistantSettingsFixture = Pick<AppSetting, 'assistant' | 'floatingBall' | 'voiceWake'> & {
  voiceInput?: { enabled: boolean; language: string; historyEnabled?: boolean }
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
  appSetting.voiceInput = { enabled: false, language: 'en-US', historyEnabled: false }
}

function mountSettingAssistant(): VueWrapper {
  return mount(SettingAssistant, {
    global: {
      stubs: {
        TuffGroupBlock: { template: '<section><slot /></section>' },
        TuffBlockSwitch: {
          template:
            '<label><span>{{ title }}</span><input type="checkbox" :aria-label="title" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)" /></label>',
          props: ['modelValue', 'title'],
          emits: ['update:modelValue']
        }
      }
    }
  })
}

function switchControl(wrapper: VueWrapper, title: string) {
  return wrapper.get<HTMLInputElement>(`input[aria-label="${title}"]`)
}

describe('SettingAssistant', () => {
  beforeEach(() => {
    resetAppSetting()
  })

  it('exposes Assistant and floating ball as its only controls', async () => {
    const wrapper = mountSettingAssistant()
    await nextTick()

    expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(2)
    expect(switchControl(wrapper, 'settingAssistant.enableAssistant').element.checked).toBe(false)
    expect(switchControl(wrapper, 'settingAssistant.floatingBall').element.checked).toBe(false)

    wrapper.unmount()
  })

  it('hides the floating ball when Assistant is disabled without changing voice input', async () => {
    appSetting.assistant.enabled = true
    appSetting.floatingBall.enabled = true
    appSetting.voiceInput = { enabled: true, language: 'fr-FR', historyEnabled: true }

    const wrapper = mountSettingAssistant()
    await switchControl(wrapper, 'settingAssistant.enableAssistant').setValue(false)

    expect(appSetting.assistant.enabled).toBe(false)
    expect(appSetting.floatingBall.enabled).toBe(false)
    expect(appSetting.voiceInput).toEqual({
      enabled: true,
      language: 'fr-FR',
      historyEnabled: true
    })

    wrapper.unmount()
  })

  it('enables Assistant with the floating ball without changing voice input', async () => {
    appSetting.voiceInput = { enabled: false, language: 'fr-FR', historyEnabled: true }

    const wrapper = mountSettingAssistant()
    await switchControl(wrapper, 'settingAssistant.floatingBall').setValue(true)

    expect(appSetting.assistant.enabled).toBe(true)
    expect(appSetting.floatingBall.enabled).toBe(true)
    expect(appSetting.voiceInput).toEqual({
      enabled: false,
      language: 'fr-FR',
      historyEnabled: true
    })

    wrapper.unmount()
  })
})

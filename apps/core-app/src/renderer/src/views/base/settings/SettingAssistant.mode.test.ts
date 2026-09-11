// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import type { AppSetting } from '@talex-touch/utils'
import type { VoiceInputSetting } from '@talex-touch/utils/common/storage/entity/app-settings'
import type * as VueModule from 'vue'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SettingAssistant from './SettingAssistant.vue'

type AssistantSettingsFixture = Pick<AppSetting, 'assistant' | 'floatingBall' | 'voiceWake'> & {
  voiceInput?: VoiceInputSetting
}

const appSetting = vi.hoisted(() => {
  const { reactive } = require('vue') as typeof VueModule
  return reactive({} as AssistantSettingsFixture)
})
const transport = vi.hoisted(() => ({ send: vi.fn() }))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => transport
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
  appSetting.voiceInput = {
    enabled: false,
    language: 'fr-FR',
    historyEnabled: true,
    polishEnabled: true,
    polishStrength: 'natural'
  }
}

function mountSettingAssistant() {
  return mount(SettingAssistant, {
    props: { mode: 'advanced' },
    global: {
      stubs: {
        TuffGroupBlock: { template: '<section><slot /></section>' },
        TuffBlockSwitch: {
          name: 'TuffBlockSwitch',
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

describe('SettingAssistant independent controls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetAppSetting()
  })

  it('keeps assistant and floating-ball controls separate from voice input and system keyboard status', async () => {
    const wrapper = mountSettingAssistant()
    await nextTick()

    const floatingBall = wrapper
      .findAllComponents({ name: 'TuffBlockSwitch' })
      .find((control) => control.props('title') === 'settingAssistant.floatingBall')
    if (!floatingBall) throw new Error('Floating-ball switch was not rendered')

    await floatingBall.vm.$emit('update:modelValue', true)

    expect(appSetting.assistant.enabled).toBe(true)
    expect(appSetting.floatingBall.enabled).toBe(true)
    expect(appSetting.voiceInput).toMatchObject({
      enabled: false,
      language: 'fr-FR',
      historyEnabled: true,
      polishEnabled: true,
      polishStrength: 'natural'
    })
    expect(
      wrapper
        .findAllComponents({ name: 'TuffBlockSwitch' })
        .some((control) => control.props('title') === 'settingSpeechRecognition.input.title')
    ).toBe(false)
    expect(transport.send).not.toHaveBeenCalled()

    wrapper.unmount()
  })
})

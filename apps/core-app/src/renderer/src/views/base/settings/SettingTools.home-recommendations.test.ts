// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import SettingTools from './SettingTools.vue'

const settingState = vi.hoisted(() => {
  const { reactive } = require('vue') as typeof import('vue')
  return {
    appSettingMock: reactive({
      coreBox: {
        customPlaceholder: ''
      },
      beginner: {
        init: false
      },
      dev: {
        advancedSettings: false
      },
      tools: {
        autoContext: true,
        homeRecommendations: false,
        homeAiOpening: false,
        agentTools: false,
        agentToolsMode: 'off',
        autoPaste: { enable: true, time: 5 },
        autoHide: true,
        autoClear: 300,
        clipboardPolling: {
          interval: 3,
          lowBatteryPolicy: { enable: true, interval: 10 }
        }
      }
    })
  }
})

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key
  })
}))

vi.mock('~/modules/platform/renderer-platform', () => ({
  useRendererPlatform: () => ({
    isMac: { value: true },
    isWindows: { value: false },
    isLinux: { value: false }
  })
}))

vi.mock('~/utils/renderer-log', () => ({
  createRendererLogger: () => ({
    warn: vi.fn()
  })
}))

vi.mock('~/modules/channel/main/shortcon', () => ({
  shortconApi: {
    getAll: vi.fn(async () => [])
  }
}))

vi.mock('~/modules/storage/app-storage', () => ({
  appSetting: settingState.appSettingMock
}))

const settingToolsStubs = {
  TuffGroupBlock: {
    template: '<section><h5 v-if="name">{{ name }}</h5><slot /></section>',
    props: ['name']
  },
  TuffBlockSwitch: {
    template: `
      <label class="mock-switch" :data-title="title">
        <span>{{ title }}</span>
        <input type="checkbox" :checked="modelValue" @change="$emit('update:modelValue', $event.target.checked)" />
        <slot name="tags" />
      </label>
    `,
    props: ['modelValue', 'title'],
    emits: ['update:modelValue']
  },
  TuffBetaTag: {
    template: '<span class="mock-beta-tag">Beta</span>'
  },
  TuffBlockInput: { template: '<div />' },
  TuffBlockSlot: { template: '<div />' },
  TuffBlockSelect: { template: '<div />' },
  TxInput: { template: '<input />' },
  TxButton: { template: '<button><slot /></button>' },
  ShortcutDialog: { template: '<div />' }
}

describe('settingTools home recommendations switch', () => {
  beforeEach(() => {
    settingState.appSettingMock.tools.homeRecommendations = false
    settingState.appSettingMock.tools.homeAiOpening = false
  })

  it('defaults to off and hides the AI opening line toggle', async () => {
    const wrapper = mount(SettingTools, {
      props: { advancedOnly: false },
      global: { stubs: settingToolsStubs }
    })
    await nextTick()

    const recSwitch = wrapper.find('[data-title="settingTools.homeRecommendations"]')
    expect(recSwitch.exists()).toBe(true)
    expect(recSwitch.find('input').element.checked).toBe(false)
    expect(recSwitch.find('.mock-beta-tag').exists()).toBe(true)

    // Sub-toggle for model-written AI opening line is hidden when home recommendations is off
    const aiOpeningSwitch = wrapper.find('[data-title="settingTools.homeAiOpening"]')
    expect(aiOpeningSwitch.exists()).toBe(false)
  })

  it('reveals the AI opening line toggle when home recommendations is turned on', async () => {
    const wrapper = mount(SettingTools, {
      props: { advancedOnly: false },
      global: { stubs: settingToolsStubs }
    })
    await nextTick()

    const recSwitch = wrapper.find('[data-title="settingTools.homeRecommendations"]')
    await recSwitch.find('input').setValue(true)
    await nextTick()

    expect(settingState.appSettingMock.tools.homeRecommendations).toBe(true)

    const aiOpeningSwitch = wrapper.find('[data-title="settingTools.homeAiOpening"]')
    expect(aiOpeningSwitch.exists()).toBe(true)
    expect(aiOpeningSwitch.find('input').element.checked).toBe(false)
  })
})

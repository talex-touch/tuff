// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import SettingAssistant from './SettingAssistant.vue'

const appSetting = vi.hoisted(() => {
  const { reactive } = require('vue') as typeof import('vue')
  return reactive({
    assistant: { enabled: false },
    floatingBall: {
      enabled: false,
      size: 56,
      opacity: 1,
      edgePadding: 24,
      position: { x: -1, y: -1 }
    },
    voiceWake: {
      enabled: false,
      wakeWords: ['Alo'],
      language: 'en-US',
      continuous: true,
      cooldownMs: 2200,
      openPanelOnWake: true
    }
  })
})

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('~/modules/storage/app-storage', () => ({ appSetting }))

function mountSettingAssistant(mode: 'standard' | 'advanced') {
  return mount(SettingAssistant, {
    props: { mode },
    global: {
      stubs: {
        TuffGroupBlock: { template: '<section><slot /></section>' },
        TuffBlockSwitch: {
          template: '<label><span>{{ title }}</span></label>',
          props: ['modelValue', 'title']
        },
        TuffBlockInput: {
          template: '<label><span>{{ title }}</span></label>',
          props: ['modelValue', 'title']
        }
      }
    }
  })
}

describe('SettingAssistant mode boundary', () => {
  it('renders the assistant master preference only in the standard settings page', () => {
    const wrapper = mountSettingAssistant('standard')

    expect(wrapper.text()).toContain('settingAssistant.enableAssistant')
    expect(wrapper.text()).not.toContain('settingAssistant.floatingBall')
    expect(wrapper.text()).not.toContain('settingAssistant.voiceWake')
  })

  it('renders only low-frequency assistant/input preferences in the advanced page', () => {
    const wrapper = mountSettingAssistant('advanced')

    expect(wrapper.text()).not.toContain('settingAssistant.enableAssistant')
    expect(wrapper.text()).toContain('settingAssistant.floatingBall')
    expect(wrapper.text()).toContain('settingAssistant.voiceWake')
    expect(wrapper.text()).toContain('settingAssistant.wakeWords')
  })
})

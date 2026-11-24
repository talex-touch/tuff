// @vitest-environment jsdom
/* eslint-disable vue/one-component-per-file -- The components declared here are test doubles for
   the settings sections the page composes, not components this file owns. */

import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() })
}))

vi.mock('~/modules/settings/categories', () => ({
  settingCategoryChildren: () => []
}))

vi.mock('~/modules/storage/app-storage', async () => {
  const { reactive } = await import('vue')
  return {
    appSetting: reactive({})
  }
})

vi.mock('~/components/settings/SettingsPage.vue', () => ({
  default: defineComponent({
    name: 'SettingsPage',
    setup(_props, { slots }) {
      return () => h('main', slots.default?.())
    }
  })
}))

vi.mock('~/components/settings/SettingRow.vue', () => ({
  default: defineComponent({
    name: 'SettingRow',
    props: {
      title: { type: String, default: '' },
      description: { type: String, default: '' }
    },
    setup(props, { slots }) {
      return () =>
        h('div', { class: 'setting-row-stub', 'data-title': props.title }, [
          h('span', { class: 'setting-row-title' }, props.title),
          props.description ? h('span', { class: 'setting-row-desc' }, props.description) : null,
          slots.trailing?.()
        ])
    }
  })
}))

vi.mock('~/components/tuff/TuffBlockSwitch.vue', () => ({
  default: defineComponent({
    name: 'TuffBlockSwitch',
    props: {
      modelValue: { type: Boolean, required: true },
      title: { type: String, default: '' }
    },
    emits: ['update:modelValue'],
    setup(props, { emit }) {
      return () =>
        h('input', {
          type: 'checkbox',
          class: 'tuff-block-switch-stub',
          'data-switch-title': props.title,
          checked: props.modelValue,
          onChange: (event: Event) => {
            emit('update:modelValue', (event.target as HTMLInputElement).checked)
          }
        })
    }
  })
}))

vi.mock('~/components/tuff/TuffGroupBlock.vue', () => ({
  default: defineComponent({
    name: 'TuffGroupBlock',
    setup(_props, { slots }) {
      return () => h('section', slots.default?.())
    }
  })
}))

vi.mock('../SettingLocalAiCli.vue', () => ({
  default: defineComponent({
    name: 'SettingLocalAiCli',
    setup() {
      return () => h('div', { class: 'setting-local-ai-cli-mounted' })
    }
  })
}))

import { appSetting } from '~/modules/storage/app-storage'
import SettingIntelligencePage from './SettingIntelligencePage.vue'

const mockAppSetting = appSetting as {
  dev?: { developerMode?: boolean }
  conversation?: {
    showTurnMetrics?: boolean
    autoResumeOnStartup?: boolean
    [key: string]: unknown
  }
}

describe('SettingIntelligencePage', () => {
  beforeEach(() => {
    delete mockAppSetting.dev
    delete mockAppSetting.conversation
  })

  it('mounts the Local AI CLI section as a resolved component', () => {
    const wrapper = mount(SettingIntelligencePage)

    // Without the import Vue renders the tag as a literal custom element, which is exactly what
    // the settings surface shipped to real Electron; this marker only exists once it resolves.
    expect(wrapper.find('.setting-local-ai-cli-mounted').exists()).toBe(true)
    expect(wrapper.find('settinglocalaicli').exists()).toBe(false)
  })

  it('no longer carries the skills and skill-directory groups, which live on the skills page', () => {
    const wrapper = mount(SettingIntelligencePage)

    // Only the sections the page composes remain: Local AI CLI and the hub list. The Assistant
    // floating-entry group went with the floating ball it configured.
    expect(wrapper.text()).not.toContain('settingAssistant')
    expect(wrapper.find('settingassistant').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('settings.skillsMcp')
    expect(wrapper.find('settingskillsmcp').exists()).toBe(false)
  })

  it('defaults autoResumeOnStartup to true and renders its toggle row', () => {
    const wrapper = mount(SettingIntelligencePage)

    const row = wrapper.find('[data-title="settingsConversation.autoResumeTitle"]')
    expect(row.exists()).toBe(true)
    expect(row.find('.setting-row-desc').text()).toBe('settingsConversation.autoResumeDesc')

    const toggle = wrapper.find<HTMLInputElement>(
      'input[data-switch-title="settingsConversation.autoResumeTitle"]'
    )
    expect(toggle.exists()).toBe(true)
    expect(toggle.element.checked).toBe(true)
  })

  it('toggles autoResumeOnStartup false and true without clobbering showTurnMetrics', async () => {
    mockAppSetting.conversation = {
      showTurnMetrics: false
    }

    const wrapper = mount(SettingIntelligencePage)
    const autoResumeToggle = wrapper.find<HTMLInputElement>(
      'input[data-switch-title="settingsConversation.autoResumeTitle"]'
    )
    const metricsToggle = wrapper.find<HTMLInputElement>(
      'input[data-switch-title="settingsConversation.showMetricsTitle"]'
    )

    expect(autoResumeToggle.element.checked).toBe(true)
    expect(metricsToggle.element.checked).toBe(false)

    await autoResumeToggle.setValue(false)
    expect(mockAppSetting.conversation?.autoResumeOnStartup).toBe(false)
    expect(mockAppSetting.conversation?.showTurnMetrics).toBe(false)
    expect(autoResumeToggle.element.checked).toBe(false)

    await autoResumeToggle.setValue(true)
    expect(mockAppSetting.conversation?.autoResumeOnStartup).toBe(true)
    expect(mockAppSetting.conversation?.showTurnMetrics).toBe(false)
    expect(autoResumeToggle.element.checked).toBe(true)
  })

  it('initializes conversation settings cleanly when absent without losing showTurnMetrics default', async () => {
    const wrapper = mount(SettingIntelligencePage)
    const autoResumeToggle = wrapper.find<HTMLInputElement>(
      'input[data-switch-title="settingsConversation.autoResumeTitle"]'
    )

    await autoResumeToggle.setValue(false)
    expect(mockAppSetting.conversation?.autoResumeOnStartup).toBe(false)
    expect(mockAppSetting.conversation?.showTurnMetrics).toBe(true)
  })
})

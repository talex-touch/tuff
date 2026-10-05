// @vitest-environment jsdom
/* eslint-disable vue/one-component-per-file -- The components declared here are test doubles for
   the settings sections the page composes, not components this file owns. */

import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() })
}))

vi.mock('~/modules/settings/categories', () => ({
  settingCategoryChildren: () => []
}))

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
    setup() {
      return () => null
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

vi.mock('../SettingAssistant.vue', () => ({
  default: defineComponent({
    name: 'SettingAssistant',
    setup() {
      return () => h('div', { class: 'setting-assistant-mounted' })
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

import SettingIntelligencePage from './SettingIntelligencePage.vue'

describe('SettingIntelligencePage', () => {
  it('mounts the Local AI CLI section as a resolved component', () => {
    const wrapper = mount(SettingIntelligencePage)

    // Without the import Vue renders the tag as a literal custom element, which is exactly what
    // the settings surface shipped to real Electron; this marker only exists once it resolves.
    expect(wrapper.find('.setting-local-ai-cli-mounted').exists()).toBe(true)
    expect(wrapper.find('settinglocalaicli').exists()).toBe(false)
  })

  it('no longer carries the skills and skill-directory groups, which live on the skills page', () => {
    const wrapper = mount(SettingIntelligencePage)

    // Only the sections the page composes remain: the assistant, Local AI CLI, and the hub list.
    expect(wrapper.find('.setting-assistant-mounted').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('settings.skillsMcp')
    expect(wrapper.find('settingskillsmcp').exists()).toBe(false)
  })
})

// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import SettingAppearancePage from './SettingAppearancePage.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('~/views/base/styles/ThemeStyle.vue', () => ({
  default: {
    name: 'ThemeStyle',
    props: { embedded: Boolean },
    template: '<div />'
  }
}))

describe('SettingAppearancePage', () => {
  it('embeds ThemeStyle within the settings shell instead of rendering a second page shell', () => {
    const wrapper = mount(SettingAppearancePage, {
      global: {
        stubs: {
          SettingsPage: {
            name: 'SettingsPage',
            props: ['title'],
            template: '<main><slot /></main>'
          },
          ThemeStyle: {
            name: 'ThemeStyle',
            props: { embedded: Boolean },
            template: '<div />'
          }
        }
      }
    })

    expect(wrapper.getComponent({ name: 'ThemeStyle' }).props('embedded')).toBe(true)
  })
})

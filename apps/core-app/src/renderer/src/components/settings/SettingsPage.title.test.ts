// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import SettingsPage from './SettingsPage.vue'

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@talex-touch/tuffex/gradual-blur', () => ({ TxGradualBlur: { template: '<div />' } }))

function mountPage(props: Record<string, unknown>, slots: Record<string, string> = {}) {
  return mount(SettingsPage, { props, slots: { default: '<p>body</p>', ...slots } })
}

describe('SettingsPage title row', () => {
  /**
   * The sidebar already names the section, so a page that repeats it and *then* says what it is
   * about introduces itself twice. The eyebrow keeps the sense of place at the size a sense of
   * place is worth and hands the heading to the line people came for.
   */
  it('puts the eyebrow above the heading, and keeps one heading', () => {
    const wrapper = mountPage({ eyebrow: '音频洞察', title: '嘴比手利索' })

    const copy = wrapper.find('.SettingsPage-TitleCopy')
    expect(copy.exists()).toBe(true)
    expect(copy.find('.SettingsPage-Eyebrow').text()).toBe('音频洞察')
    // One h1 per page: the eyebrow is a location marker, not a second heading.
    expect(wrapper.findAll('h1')).toHaveLength(1)
    expect(wrapper.find('h1').text()).toBe('嘴比手利索')

    wrapper.unmount()
  })

  /**
   * Every other settings page passes a title and nothing else. Those keep a bare `<h1>` — wrapping
   * all of them in a flex row for the sake of one would move their headings by whatever that row's
   * alignment decided.
   */
  it('leaves a plain title untouched', () => {
    const wrapper = mountPage({ title: '通用' })

    expect(wrapper.find('.SettingsPage-TitleRow').exists()).toBe(false)
    expect(wrapper.find('.SettingsPage-Eyebrow').exists()).toBe(false)
    expect(wrapper.find('h1').classes()).toContain('SettingsPage-Title')

    wrapper.unmount()
  })

  it('builds the row for a title-side slot even without an eyebrow', () => {
    const wrapper = mountPage({ title: '音频洞察' }, { titleAside: '<span id="aside">!</span>' })

    expect(wrapper.find('.SettingsPage-TitleRow').exists()).toBe(true)
    expect(wrapper.find('.SettingsPage-TitleAside #aside').exists()).toBe(true)
    expect(wrapper.find('.SettingsPage-Eyebrow').exists()).toBe(false)

    wrapper.unmount()
  })

  /** No title, no row — a full-canvas page owns its own header entirely. */
  it('renders no heading at all without a title', () => {
    const wrapper = mountPage({ eyebrow: '音频洞察' })

    expect(wrapper.findAll('h1')).toHaveLength(0)
    expect(wrapper.find('.SettingsPage-TitleRow').exists()).toBe(false)

    wrapper.unmount()
  })
})

import type { AiSourceItem } from '../../ai-elements/src/types'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxSources from '../src/TxSources.vue'

const sources: AiSourceItem[] = [
  { id: 's1', url: 'https://www.example.com/docs/guide', title: 'Guide' },
  { id: 's2', url: 'https://vuejs.org/api/', favicon: '/v.png' },
]

describe('txSources', () => {
  it('renders the count header and toggles open', async () => {
    const wrapper = mount(TxSources, { props: { sources } })

    const header = wrapper.find('.tx-sources__header')
    expect(header.text()).toContain('Used 2 sources')
    expect(header.attributes('aria-expanded')).toBe('false')

    await header.trigger('click')
    expect(header.attributes('aria-expanded')).toBe('true')
    expect(wrapper.find('.tx-sources__collapse').classes()).toContain('is-open')
  })

  it('formats singular counts and accepts a custom formatter', () => {
    const one = mount(TxSources, { props: { sources: sources.slice(0, 1) } })
    expect(one.find('.tx-sources__header').text()).toContain('Used 1 source')

    const custom = mount(TxSources, {
      props: { sources, labelFormatter: (n: number) => `参考了 ${n} 个来源` },
    })
    expect(custom.find('.tx-sources__header').text()).toContain('参考了 2 个来源')
  })

  it('falls back to the domain when a title is missing and strips www', () => {
    const wrapper = mount(TxSources, { props: { sources, defaultOpen: true } })
    const items = wrapper.findAll('.tx-sources__link')

    expect(items[0]!.find('.tx-sources__title').text()).toBe('Guide')
    expect(items[0]!.find('.tx-sources__domain').text()).toBe('example.com')
    expect(items[1]!.find('.tx-sources__title').text()).toBe('vuejs.org')
  })

  it('emits open instead of navigating', async () => {
    const wrapper = mount(TxSources, { props: { sources, defaultOpen: true } })
    await wrapper.findAll('.tx-sources__link')[1]!.trigger('click')

    expect(wrapper.emitted('open')).toHaveLength(1)
    expect((wrapper.emitted('open')![0]![0] as AiSourceItem).id).toBe('s2')
  })

  it('hides a favicon that fails to load', async () => {
    const wrapper = mount(TxSources, { props: { sources, defaultOpen: true } })
    const favicon = wrapper.find('.tx-sources__favicon')
    expect(favicon.exists()).toBe(true)

    await favicon.trigger('error')
    expect(wrapper.find('.tx-sources__favicon').exists()).toBe(false)
  })
})

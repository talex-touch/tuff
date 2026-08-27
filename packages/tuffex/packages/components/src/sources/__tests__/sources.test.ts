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
    // Closed, the 0fr grid still holds real links — inert keeps them out of
    // the tab order.
    expect(wrapper.find('.tx-sources__collapse').attributes('inert')).toBe('true')

    await header.trigger('click')
    expect(header.attributes('aria-expanded')).toBe('true')
    expect(wrapper.find('.tx-sources__collapse').classes()).toContain('is-open')
    expect(wrapper.find('.tx-sources__collapse').attributes('inert')).toBeUndefined()
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

  describe('stack variant', () => {
    const stackable: AiSourceItem[] = [
      { id: 'a', url: 'https://a.com', favicon: '/a.png' },
      { id: 'b', url: 'https://b.com', favicon: '/b.png' },
      { id: 'c', url: 'https://c.com', favicon: '/c.png' },
      { id: 'd', url: 'https://d.com', favicon: '/d.png' },
    ]

    it('keeps the globe header by default', () => {
      const wrapper = mount(TxSources, { props: { sources: stackable } })
      expect(wrapper.find('.tx-sources__icon').exists()).toBe(true)
      expect(wrapper.find('.tx-sources__stack').exists()).toBe(false)
    })

    it('swaps the globe for at most three overlapped heads', () => {
      const wrapper = mount(TxSources, { props: { sources: stackable, variant: 'stack' } })
      expect(wrapper.find('.tx-sources__icon').exists()).toBe(false)
      expect(wrapper.findAll('.tx-sources__stack-icon')).toHaveLength(3)
    })

    it('falls back to the globe when no source can draw a head', () => {
      const wrapper = mount(TxSources, {
        props: { sources: [{ id: 'x', url: 'https://x.com' }], variant: 'stack' },
      })
      expect(wrapper.find('.tx-sources__stack').exists()).toBe(false)
      expect(wrapper.find('.tx-sources__icon').exists()).toBe(true)
    })

    it('drops a head whose favicon fails to load', async () => {
      const wrapper = mount(TxSources, { props: { sources: stackable, variant: 'stack' } })
      await wrapper.findAll('.tx-sources__stack-icon')[0]!.trigger('error')

      // The fourth source takes the freed slot rather than leaving a gap.
      const heads = wrapper.findAll('.tx-sources__stack-icon')
      expect(heads).toHaveLength(3)
      expect(heads[0]!.attributes('src')).toBe('/b.png')
    })

    it('leaves the label and the list untouched', async () => {
      const wrapper = mount(TxSources, {
        props: { sources: stackable, variant: 'stack', defaultOpen: true },
      })
      expect(wrapper.find('.tx-sources__label').text()).toBe('Used 4 sources')
      expect(wrapper.findAll('.tx-sources__link')).toHaveLength(4)

      await wrapper.findAll('.tx-sources__link')[0]!.trigger('click')
      expect(wrapper.emitted('open')).toHaveLength(1)
    })
  })
})

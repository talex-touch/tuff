import type { AiSourceItem } from '../../ai-elements/src/types'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxInlineCitation from '../src/TxInlineCitation.vue'

const source: AiSourceItem = {
  id: 's1',
  url: 'https://www.scoopdata.io/reports/q3',
  favicon: '/scoop.png',
}

describe('txInlineCitation', () => {
  it('labels itself with the hostname, stripping www', () => {
    const wrapper = mount(TxInlineCitation, { props: { source } })
    expect(wrapper.find('.tx-bui-inline-citation__label').text()).toBe('scoopdata.io')
  })

  it('prefers an explicit label, then the source title', () => {
    const titled = mount(TxInlineCitation, {
      props: { source: { ...source, title: 'Scoop Data' } },
    })
    expect(titled.find('.tx-bui-inline-citation__label').text()).toBe('Scoop Data')

    const explicit = mount(TxInlineCitation, {
      props: { source: { ...source, title: 'Scoop Data' }, label: 'Q3' },
    })
    expect(explicit.find('.tx-bui-inline-citation__label').text()).toBe('Q3')
  })

  it('falls back to the raw string when the url will not parse', () => {
    const wrapper = mount(TxInlineCitation, {
      props: { source: { id: 's2', url: 'not-a-url' } },
    })
    expect(wrapper.find('.tx-bui-inline-citation__label').text()).toBe('not-a-url')
  })

  it('emits open instead of navigating', async () => {
    const wrapper = mount(TxInlineCitation, { props: { source } })
    const link = wrapper.find('a')
    expect(link.attributes('href')).toBe(source.url)

    await link.trigger('click')
    expect(wrapper.emitted('open')).toHaveLength(1)
    expect((wrapper.emitted('open')![0]![0] as AiSourceItem).id).toBe('s1')
  })

  it('drops a favicon that fails to load', async () => {
    const wrapper = mount(TxInlineCitation, { props: { source } })
    const avatar = wrapper.find('.tx-bui-inline-citation__avatar')
    expect(avatar.exists()).toBe(true)

    await avatar.trigger('error')
    expect(wrapper.find('.tx-bui-inline-citation__avatar').exists()).toBe(false)
  })

  it('renders no avatar slot content when the source has no favicon', () => {
    const wrapper = mount(TxInlineCitation, {
      props: { source: { id: 's3', url: 'https://vuejs.org/' } },
    })
    expect(wrapper.find('.tx-bui-inline-citation__avatar').exists()).toBe(false)
  })

  it('gates the entrance animation behind appear', () => {
    expect(mount(TxInlineCitation, { props: { source } }).classes()).toContain('is-appear')
    expect(
      mount(TxInlineCitation, { props: { source, appear: false } }).classes(),
    ).not.toContain('is-appear')
  })
})

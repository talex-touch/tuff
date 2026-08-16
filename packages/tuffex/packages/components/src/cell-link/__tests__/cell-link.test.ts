import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxCellLink from '../src/TxCellLink.vue'

describe('txCellLink', () => {
  it('renders a real anchor carrying the href', () => {
    const wrapper = mount(TxCellLink, {
      props: { href: 'https://aurora-scoops.example', label: 'aurora-scoops' },
    })

    expect(wrapper.element.tagName).toBe('A')
    expect(wrapper.attributes('href')).toBe('https://aurora-scoops.example')
    expect(wrapper.find('.tx-bui-cell-link__text').text()).toBe('aurora-scoops')
  })

  it('falls back to the href when no label is given', () => {
    const wrapper = mount(TxCellLink, { props: { href: 'maple-orbit.example' } })

    expect(wrapper.find('.tx-bui-cell-link__text').text()).toBe('maple-orbit.example')
  })

  it('never navigates on its own — it prevents default and emits open', async () => {
    const wrapper = mount(TxCellLink, {
      props: { href: 'https://kumo-creamery.example' },
    })

    await wrapper.trigger('click')

    const opened = wrapper.emitted('open')
    expect(opened).toHaveLength(1)
    expect((opened?.[0]?.[0] as { href: string }).href).toBe('https://kumo-creamery.example')
    expect((opened?.[0]?.[0] as { event: MouseEvent }).event.defaultPrevented).toBe(true)
  })

  it('appends the outbound arrow only when external', () => {
    const plain = mount(TxCellLink, { props: { href: '/records/1' } })
    expect(plain.find('.tx-bui-cell-link__arrow').exists()).toBe(false)
    expect(plain.classes()).not.toContain('is-external')

    const external = mount(TxCellLink, { props: { href: '/records/1', external: true } })
    expect(external.find('.tx-bui-cell-link__arrow').exists()).toBe(true)
    expect(external.find('.tx-bui-cell-link__arrow').attributes('aria-hidden')).toBe('true')
    expect(external.classes()).toContain('is-external')
  })

  it('maps the underline and muted props onto state classes', () => {
    const hover = mount(TxCellLink, { props: { href: '#' } })
    expect(hover.classes()).toContain('is-underline-hover')
    expect(hover.classes()).not.toContain('is-muted')

    const always = mount(TxCellLink, { props: { href: '#', underline: 'always', muted: true } })
    expect(always.classes()).toContain('is-underline-always')
    expect(always.classes()).toContain('is-muted')
  })

  it('exposes an accessible name override', () => {
    const wrapper = mount(TxCellLink, {
      props: { href: '#', label: '—', ariaLabel: 'Open Aurora Scoops website' },
    })

    expect(wrapper.attributes('aria-label')).toBe('Open Aurora Scoops website')
  })
})

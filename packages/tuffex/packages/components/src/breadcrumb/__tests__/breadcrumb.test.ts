import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxBreadcrumb from '../src/TxBreadcrumb.vue'

const items = [
  { label: 'Home', href: '/', icon: 'i-carbon-home' },
  { label: 'Library' },
  { label: 'Data', href: '/data' },
]

describe('txBreadcrumb', () => {
  it('renders breadcrumb navigation, icons, and separators', () => {
    const wrapper = mount(TxBreadcrumb, {
      props: {
        items,
        separatorIcon: 'chevron-right',
      },
    })

    expect(wrapper.find('nav').attributes('aria-label')).toBe('Breadcrumb')
    expect(wrapper.findAll('.tx-breadcrumb__item')).toHaveLength(3)
    expect(wrapper.findAll('.tx-breadcrumb__separator')).toHaveLength(2)
    expect(wrapper.find('.tx-breadcrumb__icon').exists()).toBe(true)
  })

  it('renders current page as non-link even when href is present', () => {
    const wrapper = mount(TxBreadcrumb, {
      props: { items },
    })

    const links = wrapper.findAll('.tx-breadcrumb__link')
    expect(links[2].element.tagName).toBe('SPAN')
    expect(links[2].attributes('href')).toBeUndefined()
    expect(links[2].attributes('aria-current')).toBe('page')
  })

  it('emits click only for non-current items without href', async () => {
    const wrapper = mount(TxBreadcrumb, {
      props: { items },
    })

    const links = wrapper.findAll('.tx-breadcrumb__link')
    await links[0].trigger('click')
    await links[1].trigger('click')
    await links[2].trigger('click')

    expect(wrapper.emitted('click')).toHaveLength(1)
    expect(wrapper.emitted('click')?.[0]).toEqual([items[1], 1])
  })

  it('blocks disabled item navigation and click events', async () => {
    const wrapper = mount(TxBreadcrumb, {
      props: {
        items: [
          { label: 'Home', href: '/' },
          { label: 'Disabled', disabled: true },
          { label: 'Current' },
        ],
      },
    })

    const disabled = wrapper.findAll('.tx-breadcrumb__link')[1]
    expect(disabled.element.tagName).toBe('SPAN')
    expect(disabled.attributes('aria-disabled')).toBe('true')

    await disabled.trigger('click')
    expect(wrapper.emitted('click')).toBeUndefined()
  })

  it('renders a no-href clickable crumb as a keyboard-reachable button', async () => {
    const wrapper = mount(TxBreadcrumb, {
      props: { items },
    })

    const links = wrapper.findAll('.tx-breadcrumb__link')
    // items[1] = { label: 'Library' }: no href, not current. Previously a bare
    // <span> with a click handler (mouse-only); now a native <button>, which the
    // browser makes Enter/Space-activatable for free.
    const middle = links[1]
    expect(middle.element.tagName).toBe('BUTTON')
    expect(middle.attributes('type')).toBe('button')

    await middle.trigger('click')
    expect(wrapper.emitted('click')?.[0]).toEqual([items[1], 1])

    // Link crumbs stay anchors; the current crumb stays an inert span.
    expect(links[0].element.tagName).toBe('A')
    expect(links[2].element.tagName).toBe('SPAN')
  })

  it('defaults to a resolvable separator icon', () => {
    const wrapper = mount(TxBreadcrumb, {
      props: { items },
    })

    const separatorIcon = wrapper.find('.tx-breadcrumb__separator .tuff-icon')
    expect(separatorIcon.exists()).toBe(true)
    // A bare name like `chevron-right` renders an empty <i>; the default must be a
    // UnoCSS-resolvable token so the separator is actually drawn.
    expect(separatorIcon.attributes('data-icon-value')).toBe('i-carbon-chevron-right')
    expect(separatorIcon.attributes('data-icon-value')?.startsWith('i-')).toBe(true)
  })
})

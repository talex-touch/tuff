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
})

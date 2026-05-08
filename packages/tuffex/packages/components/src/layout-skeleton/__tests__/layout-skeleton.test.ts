import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import LayoutSkeleton, { LayoutSkeleton as InstalledLayoutSkeleton } from '../index'

describe('txLayoutSkeleton', () => {
  it('renders the fixed layout scaffold', () => {
    const wrapper = mount(LayoutSkeleton)

    expect(wrapper.find('.tx-layout-skeleton').exists()).toBe(true)
    expect(wrapper.find('.tx-layout-skeleton__header-line').exists()).toBe(true)
    expect(wrapper.findAll('.tx-layout-skeleton__sidebar-item')).toHaveLength(6)
    expect(wrapper.findAll('.tx-layout-skeleton__content-line')).toHaveLength(8)
  })

  it('uses deterministic content widths', () => {
    const wrapper = mount(LayoutSkeleton)

    const widths = wrapper.findAll('.tx-layout-skeleton__content-line .tx-layout-skeleton__line')
      .map(line => line.attributes('style'))

    expect(widths).toEqual([
      'width: 72%;',
      'width: 58%;',
      'width: 84%;',
      'width: 46%;',
      'width: 67%;',
      'width: 76%;',
      'width: 52%;',
      'width: 63%;',
    ])
  })

  it('registers the component through install', () => {
    const app = { component: vi.fn() }

    InstalledLayoutSkeleton.install?.(app as any)

    expect(app.component).toHaveBeenCalledWith('TxLayoutSkeleton', InstalledLayoutSkeleton)
  })
})

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxVirtualList from '../src/TxVirtualList.vue'

describe('txVirtualList', () => {
  it('renders visible items based on height', () => {
    const wrapper = mount(TxVirtualList, {
      props: {
        items: ['a', 'b', 'c', 'd'],
        itemHeight: 20,
        height: 40,
        overscan: 0,
      },
    })

    const items = wrapper.findAll('.tx-virtual-list__item')
    expect(items.length).toBe(2)
    expect(items[0].text()).toBe('a')
  })

  it('exposes scrollToIndex', async () => {
    const wrapper = mount(TxVirtualList, {
      props: {
        items: Array.from({ length: 50 }, (_, i) => `Item ${i}`),
        itemHeight: 10,
        height: 50,
        overscan: 0,
      },
    })

    const vm = wrapper.vm as any
    vm.scrollToIndex(3)

    const container = wrapper.find('.tx-virtual-list').element as HTMLElement
    expect(container.scrollTop).toBe(30)
  })
})

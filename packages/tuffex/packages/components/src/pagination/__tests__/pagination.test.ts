import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxPagination from '../src/TxPagination.vue'

describe('txPagination', () => {
  it('calculates pages from total and pageSize', () => {
    const wrapper = mount(TxPagination, {
      props: {
        currentPage: 2,
        total: 95,
        pageSize: 10,
      },
    })

    const buttons = wrapper.findAll('.tx-pagination__button')
    expect(buttons.map(button => button.text())).toEqual(['', '1', '2', '3', '4', '5', '10', ''])
    expect(wrapper.find('.tx-pagination__ellipsis').text()).toBe('...')
    expect(wrapper.find('[aria-current="page"]').text()).toBe('2')
  })

  it('emits page changes and blocks out-of-range navigation', async () => {
    const wrapper = mount(TxPagination, {
      props: {
        currentPage: 1,
        totalPages: 3,
      },
    })

    const previous = wrapper.find('[aria-label="Previous page"]')
    expect(previous.attributes('disabled')).toBeDefined()
    await previous.trigger('click')
    expect(wrapper.emitted('pageChange')).toBeUndefined()

    await wrapper.find('[aria-label="Next page"]').trigger('click')
    expect(wrapper.emitted('update:currentPage')?.[0]).toEqual([2])
    expect(wrapper.emitted('pageChange')?.[0]).toEqual([2])
  })

  it('renders first and last page controls when enabled', async () => {
    const wrapper = mount(TxPagination, {
      props: {
        currentPage: 5,
        totalPages: 8,
        showFirstLast: true,
      },
    })

    await wrapper.find('[aria-label="First page"]').trigger('click')
    await wrapper.find('[aria-label="Last page"]').trigger('click')

    expect(wrapper.emitted('pageChange')?.[0]).toEqual([1])
    expect(wrapper.emitted('pageChange')?.[1]).toEqual([8])
  })

  it('disables boundary controls on first and last pages', () => {
    const first = mount(TxPagination, {
      props: {
        currentPage: 1,
        totalPages: 4,
        showFirstLast: true,
      },
    })

    expect(first.find('[aria-label="First page"]').attributes('disabled')).toBeDefined()
    expect(first.find('[aria-label="Previous page"]').attributes('disabled')).toBeDefined()

    const last = mount(TxPagination, {
      props: {
        currentPage: 4,
        totalPages: 4,
        showFirstLast: true,
      },
    })

    expect(last.find('[aria-label="Next page"]').attributes('disabled')).toBeDefined()
    expect(last.find('[aria-label="Last page"]').attributes('disabled')).toBeDefined()
  })

  it('renders custom info slot with current pagination state', () => {
    const wrapper = mount(TxPagination, {
      props: {
        currentPage: 3,
        total: 42,
        pageSize: 10,
        showInfo: true,
      },
      slots: {
        info: props => `Page ${props.currentPage}/${props.totalPages}, total ${props.total}`,
      },
    })

    expect(wrapper.find('.tx-pagination__info').text()).toBe('Page 3/5, total 42')
  })
})

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxPagination from '../src/TxPagination.vue'
import txPaginationSource from '../src/TxPagination.vue?raw'

describe('txPagination', () => {
  it('calculates pages from total and pageSize', () => {
    const wrapper = mount(TxPagination, {
      props: {
        currentPage: 2,
        total: 95,
        pageSize: 10,
      },
    })

    const pageButtons = wrapper.findAll('.tx-pagination__button').filter(button => button.text())
    expect(pageButtons.map(button => button.text())).toEqual(['1', '2', '3', '4', '5', '10'])
    expect(wrapper.find('.i-carbon-chevron-left').exists()).toBe(true)
    expect(wrapper.find('.i-carbon-chevron-right').exists()).toBe(true)
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

  it('clamps an out-of-range currentPage for display, controls, and corrective emit', async () => {
    const wrapper = mount(TxPagination, {
      props: {
        currentPage: 10, // beyond the 3 available pages, e.g. after a filter shrank the list
        totalPages: 3,
      },
    })

    // Self-corrects the parent's v-model once on mount instead of leaving it at 10.
    expect(wrapper.emitted('update:currentPage')?.[0]).toEqual([3])

    // The clamped page is the active one; Next is disabled, Previous stays usable.
    expect(wrapper.find('[aria-current="page"]').text()).toBe('3')
    expect(wrapper.find('[aria-label="Next page"]').attributes('disabled')).toBeDefined()

    const previous = wrapper.find('[aria-label="Previous page"]')
    expect(previous.attributes('disabled')).toBeUndefined()
    await previous.trigger('click')
    expect(wrapper.emitted('pageChange')?.at(-1)).toEqual([2])
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

  it('renders every control with an explicit button type', () => {
    const wrapper = mount(TxPagination, {
      props: {
        currentPage: 2,
        totalPages: 5,
        showFirstLast: true,
      },
    })

    const buttons = wrapper.findAll('.tx-pagination__button')
    expect(buttons.length).toBeGreaterThan(0)
    expect(buttons.every(button => button.attributes('type') === 'button')).toBe(true)
  })

  it('keeps pagination list styles isolated from prose list styles', () => {
    const wrapper = mount(TxPagination, {
      props: {
        currentPage: 1,
        totalPages: 3,
      },
    })

    expect(wrapper.find('.tx-pagination__list').element.tagName).toBe('UL')
    expect(wrapper.findAll('.tx-pagination__item').every(item => item.element.tagName === 'LI')).toBe(true)
    expect(txPaginationSource).toContain('.tx-pagination__item::marker')
    expect(txPaginationSource).toContain('list-style: none;')
    expect(txPaginationSource).toContain('margin: 0;')
    expect(txPaginationSource).toContain('padding: 0;')
  })

  it('localizes the nav landmark and control aria-labels', () => {
    const wrapper = mount(TxPagination, {
      props: {
        currentPage: 2,
        totalPages: 5,
        showFirstLast: true,
        ariaLabel: '分页',
        firstLabel: '首页',
        prevLabel: '上一页',
        nextLabel: '下一页',
        lastLabel: '末页',
      },
    })

    // Pre-fix each of these was a hardcoded English literal with no prop to override.
    expect(wrapper.find('.tx-pagination').attributes('aria-label')).toBe('分页')
    const labels = wrapper.findAll('.tx-pagination__button').map(button => button.attributes('aria-label'))
    expect(labels).toContain('首页')
    expect(labels).toContain('上一页')
    expect(labels).toContain('下一页')
    expect(labels).toContain('末页')
  })
})

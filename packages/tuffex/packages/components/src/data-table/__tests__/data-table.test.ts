import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxDataTable from '../src/TxDataTable.vue'

describe('txDataTable', () => {
  const columns = [
    { key: 'name', title: 'Name' },
    { key: 'age', title: 'Age', sortable: true },
  ]

  const data = [
    { id: 1, name: 'Alice', age: 30 },
    { id: 2, name: 'Bob', age: 20 },
  ]

  it('renders headers and rows', () => {
    const wrapper = mount(TxDataTable, {
      props: { columns, data },
    })

    const headers = wrapper.findAll('thead th')
    expect(headers.length).toBe(2)
    expect(wrapper.text()).toContain('Alice')
    expect(wrapper.text()).toContain('Bob')
  })

  it('sorts rows on header click', async () => {
    const wrapper = mount(TxDataTable, {
      props: { columns, data },
    })

    const header = wrapper.findAll('thead th')[1]
    await header.trigger('click')

    const rows = wrapper.findAll('tbody tr')
    const firstRowText = rows[0].findAll('td')[0].text()
    expect(firstRowText).toBe('Bob')
  })

  it('exposes sortable headers to keyboard users', async () => {
    const wrapper = mount(TxDataTable, {
      props: { columns, data },
    })

    const header = wrapper.findAll('thead th')[1]
    expect(header.attributes('tabindex')).toBe('0')
    expect(header.attributes('aria-sort')).toBe('none')

    await header.trigger('keydown', { key: 'Enter' })
    expect(header.attributes('aria-sort')).toBe('ascending')
    expect(wrapper.findAll('tbody tr')[0].findAll('td')[0].text()).toBe('Bob')

    await header.trigger('keydown', { key: ' ' })
    expect(header.attributes('aria-sort')).toBe('descending')
    expect(wrapper.findAll('tbody tr')[0].findAll('td')[0].text()).toBe('Alice')
  })

  it('emits selection changes', async () => {
    const wrapper = mount(TxDataTable, {
      props: {
        columns,
        data,
        selectable: true,
        rowKey: 'id',
        selectedKeys: [],
      },
    })

    const checkbox = wrapper.find('.tx-data-table__cell--select .tx-checkbox')
    await checkbox.trigger('click')

    const emitted = wrapper.emitted('update:selectedKeys')
    expect(emitted?.[0][0]).toEqual([1])
  })

  it('applies layout, nowrap, auto width, and fixed column styles', () => {
    const wrapper = mount(TxDataTable, {
      props: {
        tableLayout: 'fixed',
        nowrap: true,
        columns: [
          { key: 'name', title: 'Name', minWidth: 180, maxWidth: 260, fixed: 'left' },
          { key: 'age', title: 'Age', auto: true },
          { key: 'actions', title: 'Actions', width: 120, fixed: 'right' },
        ],
        data,
      },
    })

    expect(wrapper.classes()).toContain('is-layout-fixed')
    expect(wrapper.classes()).toContain('is-nowrap')
    expect(wrapper.classes()).toContain('has-fixed-columns')
    expect(wrapper.find('table').attributes('style')).toContain('table-layout: fixed')

    const headers = wrapper.findAll('thead th')
    expect(headers[0].classes()).toEqual(expect.arrayContaining(['is-fixed', 'is-fixed-left']))
    expect(headers[0].attributes('style')).toContain('min-width: 180px')
    expect(headers[0].attributes('style')).toContain('max-width: 260px')
    expect(headers[1].classes()).toContain('is-auto')
    expect(headers[1].attributes('style')).toContain('width: auto')
    expect(headers[2].classes()).toEqual(expect.arrayContaining(['is-fixed', 'is-fixed-right']))
    expect(headers[2].attributes('style')).toContain('right: 0px')
  })
})

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
    expect(headers[0].find('button').exists()).toBe(false)
    expect(headers[1].find('.tx-data-table__sort-button').element.tagName).toBe('BUTTON')
    expect(wrapper.text()).toContain('Alice')
    expect(wrapper.text()).toContain('Bob')
  })

  it('sorts rows on header button click', async () => {
    const wrapper = mount(TxDataTable, {
      props: { columns, data },
    })

    const sortButton = wrapper.findAll('thead th')[1].find('.tx-data-table__sort-button')
    await sortButton.trigger('click')

    const rows = wrapper.findAll('tbody tr')
    const firstRowText = rows[0].findAll('td')[0].text()
    expect(firstRowText).toBe('Bob')
  })

  it('exposes sortable headers through a native button', async () => {
    const wrapper = mount(TxDataTable, {
      props: { columns, data },
    })

    const header = wrapper.findAll('thead th')[1]
    const sortButton = header.find('.tx-data-table__sort-button')

    expect(header.attributes('tabindex')).toBeUndefined()
    expect(header.attributes('aria-sort')).toBe('none')
    expect(sortButton.element.tagName).toBe('BUTTON')
    expect(sortButton.attributes('type')).toBe('button')
    expect(sortButton.attributes('tabindex')).toBeUndefined()

    await sortButton.trigger('click')
    expect(header.attributes('aria-sort')).toBe('ascending')
    expect(wrapper.findAll('tbody tr')[0].findAll('td')[0].text()).toBe('Bob')

    await sortButton.trigger('click')
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

  it('keeps read-only rows out of the keyboard tab sequence', async () => {
    const wrapper = mount(TxDataTable, {
      props: { columns, data },
    })
    const row = wrapper.find('tbody .tx-data-table__row')

    expect(row.attributes('tabindex')).toBeUndefined()
    expect(row.classes()).not.toContain('is-interactive')

    await row.trigger('keydown', { key: 'Enter' })
    await row.trigger('keydown', { key: ' ' })
    expect(wrapper.emitted('rowClick')).toBeUndefined()
  })

  it('activates opted-in interactive rows with Enter and Space only from the row itself', async () => {
    const wrapper = mount(TxDataTable, {
      props: {
        columns: [{ key: 'name', title: 'Name' }],
        data,
        interactiveRows: true,
      },
      slots: {
        'cell-name': '<button class="inner-action">Open</button>',
      },
    })
    const row = wrapper.find('tbody .tx-data-table__row')

    expect(row.attributes('tabindex')).toBe('0')
    expect(row.classes()).toContain('is-interactive')

    await row.trigger('keydown', { key: 'Enter' })
    await row.trigger('keydown', { key: ' ' })
    expect(wrapper.emitted('rowClick')).toHaveLength(2)
    expect(wrapper.emitted('rowClick')?.[0]?.[0]).toEqual({ row: data[0], index: 0 })

    await wrapper.find('.inner-action').trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('rowClick')).toHaveLength(2)
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

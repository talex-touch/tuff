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
})

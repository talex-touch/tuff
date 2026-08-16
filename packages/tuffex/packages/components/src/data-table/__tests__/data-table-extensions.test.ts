import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxDataTable from '../src/TxDataTable.vue'

// Every prop covered here is off by default. The companion assertions in
// "leaves every new surface inert by default" are the guard that adding them
// did not change what an existing consumer renders.
describe('txDataTable additive surface', () => {
  const columns = [
    { key: 'name', title: 'Name', sortable: true },
    { key: 'age', title: 'Age', sortable: true },
  ]

  const data = [
    { id: 1, name: 'Alice', age: 30 },
    { id: 2, name: 'Bob', age: 20 },
  ]

  it('leaves every new surface inert by default', () => {
    const wrapper = mount(TxDataTable, { props: { columns, data } })

    expect(wrapper.find('tfoot').exists()).toBe(false)
    expect(wrapper.classes()).not.toContain('is-sticky-shell')
    expect(wrapper.classes()).not.toContain('has-sticky-header')
    expect(wrapper.classes()).not.toContain('has-sticky-footer')
    expect(wrapper.classes()).not.toContain('is-scroll-x')
    expect(wrapper.classes()).not.toContain('is-highlight-selected')
    expect(wrapper.attributes('style')).toBeUndefined()
  })

  describe('footer', () => {
    it('renders consumer cells from the whole-row footer slot', () => {
      const wrapper = mount(TxDataTable, {
        props: { columns, data },
        slots: {
          footer: `<template #footer="{ data }"><td colspan="2" class="summary">{{ data.length }} count</td></template>`,
        },
      })

      expect(wrapper.find('tfoot').exists()).toBe(true)
      expect(wrapper.find('tfoot .summary').text()).toBe('2 count')
      expect(wrapper.find('tfoot .summary').attributes('colspan')).toBe('2')
    })

    it('fills one cell per column from footer-<key> slots', () => {
      const wrapper = mount(TxDataTable, {
        props: { columns, data },
        slots: {
          'footer-name': `<template #footer-name="{ data }"><b>{{ data.length }} rows</b></template>`,
        },
      })

      const cells = wrapper.findAll('tfoot .tx-data-table__footer-cell')
      expect(cells).toHaveLength(2)
      expect(cells[0].text()).toBe('2 rows')
      // A column without a footer slot still gets its cell, so the grid lines up.
      expect(cells[1].text()).toBe('')
    })

    it('adds a spacer cell for the selection column', () => {
      const wrapper = mount(TxDataTable, {
        props: { columns, data, selectable: true, rowKey: 'id' },
        slots: { 'footer-name': '<span>total</span>' },
      })

      const cells = wrapper.findAll('tfoot td')
      expect(cells).toHaveLength(3)
      expect(cells[0].classes()).toContain('tx-data-table__footer-cell--select')
    })

    it('lets the whole-row slot win over per-column slots', () => {
      const wrapper = mount(TxDataTable, {
        props: { columns, data },
        slots: {
          'footer': '<td class="whole">whole</td>',
          'footer-name': '<span class="per-column">per column</span>',
        },
      })

      expect(wrapper.find('tfoot .whole').exists()).toBe(true)
      expect(wrapper.find('tfoot .per-column').exists()).toBe(false)
    })
  })

  describe('sort', () => {
    it('cycles asc → desc → unsorted by default', async () => {
      const wrapper = mount(TxDataTable, { props: { columns, data } })
      const header = wrapper.findAll('thead th')[1]
      const button = header.find('.tx-data-table__sort-button')

      await button.trigger('click')
      expect(header.attributes('aria-sort')).toBe('ascending')
      await button.trigger('click')
      expect(header.attributes('aria-sort')).toBe('descending')
      await button.trigger('click')
      expect(header.attributes('aria-sort')).toBe('none')
      expect(wrapper.emitted('sortChange')?.at(-1)).toEqual([null])
    })

    it('never returns to unsorted with sortCycle="bi"', async () => {
      const wrapper = mount(TxDataTable, { props: { columns, data, sortCycle: 'bi' } })
      const header = wrapper.findAll('thead th')[1]
      const button = header.find('.tx-data-table__sort-button')

      await button.trigger('click')
      await button.trigger('click')
      expect(header.attributes('aria-sort')).toBe('descending')

      await button.trigger('click')
      expect(header.attributes('aria-sort')).toBe('ascending')
      expect(wrapper.emitted('sortChange')?.at(-1)).toEqual([{ key: 'age', order: 'asc' }])
    })

    it('hands the sort to the parent when the sort prop is present', async () => {
      const wrapper = mount(TxDataTable, { props: { columns, data, sort: null } })
      const header = wrapper.findAll('thead th')[1]

      await header.find('.tx-data-table__sort-button').trigger('click')

      // Controlled: the request goes out, the rendering does not move until the
      // parent sends a new value back.
      expect(wrapper.emitted('update:sort')?.[0]).toEqual([{ key: 'age', order: 'asc' }])
      expect(wrapper.emitted('sortChange')?.[0]).toEqual([{ key: 'age', order: 'asc' }])
      expect(header.attributes('aria-sort')).toBe('none')
      expect(wrapper.findAll('tbody tr')[0].findAll('td')[0].text()).toBe('Alice')

      await wrapper.setProps({ sort: { key: 'age', order: 'asc' } })
      expect(header.attributes('aria-sort')).toBe('ascending')
      expect(wrapper.findAll('tbody tr')[0].findAll('td')[0].text()).toBe('Bob')
    })

    it('still emits update:sort in the uncontrolled mode', async () => {
      const wrapper = mount(TxDataTable, { props: { columns, data } })

      await wrapper.findAll('thead th')[1].find('.tx-data-table__sort-button').trigger('click')

      expect(wrapper.emitted('update:sort')?.[0]).toEqual([{ key: 'age', order: 'asc' }])
      expect(wrapper.findAll('tbody tr')[0].findAll('td')[0].text()).toBe('Bob')
    })

    it('widens the header slot scope with the live sort state', async () => {
      const wrapper = mount(TxDataTable, {
        props: { columns, data },
        slots: {
          'header-age': `<template #header-age="{ column, sorted, order }"><span class="head">{{ column.title }}|{{ sorted }}|{{ String(order) }}</span></template>`,
        },
      })

      expect(wrapper.find('.head').text()).toBe('Age|false|null')

      await wrapper.findAll('thead th')[1].find('.tx-data-table__sort-button').trigger('click')
      expect(wrapper.find('.head').text()).toBe('Age|true|asc')
    })

    it('exposes toggle to a non-sortable column header slot', async () => {
      const wrapper = mount(TxDataTable, {
        props: { columns: [{ key: 'name', title: 'Name' }], data },
        slots: {
          'header-name': `<template #header-name="{ toggle }"><button class="custom" type="button" @click="toggle">Name</button></template>`,
        },
      })

      // Non-sortable columns ignore the request rather than sorting silently.
      await wrapper.find('.custom').trigger('click')
      expect(wrapper.emitted('update:sort')).toBeUndefined()
    })
  })

  describe('rows', () => {
    it('applies rowClass alongside the built-in row state classes', () => {
      const wrapper = mount(TxDataTable, {
        props: {
          columns,
          data,
          rowClass: (row: any) => (row.age > 25 ? 'is-senior' : ['is-junior', 'is-new']),
        },
      })

      const rows = wrapper.findAll('.tx-data-table__row')
      expect(rows[0].classes()).toContain('is-senior')
      expect(rows[1].classes()).toEqual(expect.arrayContaining(['is-junior', 'is-new']))
    })

    it('marks selected rows with is-selected regardless of the highlight flag', () => {
      const plain = mount(TxDataTable, {
        props: { columns, data, selectable: true, rowKey: 'id', selectedKeys: [2] },
      })
      const rows = plain.findAll('.tx-data-table__row')
      expect(rows[0].classes()).not.toContain('is-selected')
      expect(rows[1].classes()).toContain('is-selected')
      // The class is free; only the tint is opt-in.
      expect(plain.classes()).not.toContain('is-highlight-selected')

      const highlighted = mount(TxDataTable, {
        props: { columns, data, selectable: true, rowKey: 'id', selectedKeys: [2], highlightSelected: true },
      })
      expect(highlighted.classes()).toContain('is-highlight-selected')
    })

    it('reports a partial selection as mixed on the select-all box', async () => {
      const wrapper = mount(TxDataTable, {
        props: { columns, data, selectable: true, rowKey: 'id', selectedKeys: [1] },
      })
      const selectAll = () => wrapper.find('.tx-data-table__th--select .tx-checkbox')

      expect(selectAll().attributes('aria-checked')).toBe('mixed')

      await wrapper.setProps({ selectedKeys: [1, 2] })
      expect(selectAll().attributes('aria-checked')).toBe('true')

      await wrapper.setProps({ selectedKeys: [] })
      expect(selectAll().attributes('aria-checked')).toBe('false')
    })
  })

  describe('sticky shell', () => {
    it('turns the component into a scroll container when maxHeight is set', () => {
      const wrapper = mount(TxDataTable, { props: { columns, data, maxHeight: 438 } })

      expect(wrapper.classes()).toContain('is-sticky-shell')
      expect(wrapper.attributes('style')).toContain('max-height: 438px')
    })

    it('accepts a css unit string for maxHeight', () => {
      const wrapper = mount(TxDataTable, { props: { columns, data, maxHeight: '60vh' } })
      expect(wrapper.attributes('style')).toContain('max-height: 60vh')
    })

    it('enters the shell for sticky header or footer without a height cap', () => {
      const header = mount(TxDataTable, { props: { columns, data, stickyHeader: true } })
      expect(header.classes()).toEqual(expect.arrayContaining(['is-sticky-shell', 'has-sticky-header']))
      expect(header.attributes('style')).toBeUndefined()

      const footer = mount(TxDataTable, { props: { columns, data, stickyFooter: true } })
      expect(footer.classes()).toEqual(expect.arrayContaining(['is-sticky-shell', 'has-sticky-footer']))
    })

    it('keeps scrollX out of the sticky shell', () => {
      const wrapper = mount(TxDataTable, { props: { columns, data, scrollX: true } })

      expect(wrapper.classes()).toContain('is-scroll-x')
      expect(wrapper.classes()).not.toContain('is-sticky-shell')
    })

    it('combines fixed columns with the shell for the records-table layout', () => {
      const wrapper = mount(TxDataTable, {
        props: {
          columns: [
            { key: 'name', title: 'Company', width: 270, fixed: 'left' as const },
            { key: 'age', title: 'Age', width: 190, sortable: true },
          ],
          data,
          rowKey: 'id',
          tableLayout: 'fixed' as const,
          maxHeight: 438,
          scrollX: true,
          stickyHeader: true,
          stickyFooter: true,
        },
        slots: { 'footer-name': '<span>2 count</span>' },
      })

      expect(wrapper.classes()).toEqual(expect.arrayContaining([
        'has-fixed-columns',
        'is-scroll-x',
        'is-sticky-shell',
        'has-sticky-header',
        'has-sticky-footer',
      ]))
      expect(wrapper.findAll('thead th')[0].classes()).toContain('is-fixed-left')
      // The footer cell inherits the same fixed offset, so the pinned column
      // stays a single vertical band from header through footer.
      expect(wrapper.findAll('tfoot td')[0].classes()).toContain('is-fixed-left')
      expect(wrapper.findAll('tfoot td')[0].attributes('style')).toContain('left: 0px')
    })
  })
})

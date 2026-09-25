import type { VueWrapper } from '@vue/test-utils'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxDataTable from '../src/TxDataTable.vue'

describe('txDataTable row expansion', () => {
  const columns = [
    { key: 'name', title: 'Name' },
    { key: 'age', title: 'Age' },
  ]

  const data = [
    { id: 1, name: 'Alice', age: 30 },
    { id: 2, name: 'Bob', age: 20 },
  ]

  const detailSlot = {
    expanded: `<template #expanded="{ row, index }"><span class="detail">{{ row.name }}#{{ index }}</span></template>`,
  }

  function toggles(wrapper: VueWrapper) {
    return wrapper.findAll('.tx-data-table__expand-toggle')
  }

  // A data row is a `tbody` row that is not the detail row it may open.
  function dataRows(wrapper: VueWrapper) {
    return wrapper.findAll('tbody tr').filter(tr => !tr.classes().includes('tx-data-table__row--detail'))
  }

  function openDetailTexts(wrapper: VueWrapper) {
    return wrapper.findAll('.tx-data-table__row--detail').map(tr => tr.find('.detail').text())
  }

  describe('opt-in', () => {
    it('renders no expansion surface and ignores expansion props unless expandable is on', () => {
      const wrapper = mount(TxDataTable, {
        props: {
          columns,
          data,
          rowKey: 'id',
          // Both the uncontrolled seed and a controlled value: neither may paint
          // anything while the feature is off.
          defaultExpandedKeys: [1],
          expandedKeys: [1],
        },
      })

      expect(wrapper.classes()).not.toContain('is-expandable')
      expect(wrapper.find('.tx-data-table__th--expand').exists()).toBe(false)
      expect(wrapper.find('.tx-data-table__cell--expand').exists()).toBe(false)
      expect(wrapper.find('.tx-data-table__expand-toggle').exists()).toBe(false)
      expect(wrapper.find('.tx-data-table__row--detail').exists()).toBe(false)
    })
  })

  describe('uncontrolled mode', () => {
    it('opens the row it owns on click and closes it on the next click', async () => {
      const wrapper = mount(TxDataTable, {
        props: { columns, data, rowKey: 'id', expandable: true },
        slots: detailSlot,
      })

      expect(openDetailTexts(wrapper)).toEqual([])

      await toggles(wrapper)[1].trigger('click')

      expect(wrapper.emitted('update:expandedKeys')?.at(0)).toEqual([[2]])
      expect(wrapper.emitted('expand')?.at(0)).toEqual([{ row: data[1], index: 1, expanded: true }])
      // The detail row renders the `expanded` slot under the row that owns it.
      expect(openDetailTexts(wrapper)).toEqual(['Bob#1'])
      expect(wrapper.findAll('tbody tr')[2].classes()).toContain('tx-data-table__row--detail')
      expect(dataRows(wrapper)[1].classes()).toContain('is-expanded')

      await toggles(wrapper)[1].trigger('click')

      expect(wrapper.emitted('update:expandedKeys')?.at(1)).toEqual([[]])
      expect(wrapper.emitted('expand')?.at(1)).toEqual([{ row: data[1], index: 1, expanded: false }])
      expect(openDetailTexts(wrapper)).toEqual([])
    })

    it('seeds the open rows from defaultExpandedKeys', () => {
      const wrapper = mount(TxDataTable, {
        props: { columns, data, rowKey: 'id', expandable: true, defaultExpandedKeys: [2] },
        slots: detailSlot,
      })

      expect(openDetailTexts(wrapper)).toEqual(['Bob#1'])
      expect(toggles(wrapper)[0].attributes('aria-expanded')).toBe('false')
      expect(toggles(wrapper)[1].attributes('aria-expanded')).toBe('true')
    })

    it('keeps reader-opened rows when defaultExpandedKeys is re-passed by value', async () => {
      const wrapper = mount(TxDataTable, {
        props: { columns, data, rowKey: 'id', expandable: true, defaultExpandedKeys: [1] },
        slots: detailSlot,
      })

      expect(openDetailTexts(wrapper)).toEqual(['Alice#0'])

      await toggles(wrapper)[1].trigger('click')
      expect(openDetailTexts(wrapper)).toEqual(['Alice#0', 'Bob#1'])

      // A parent re-render passes a fresh array with identical content; the
      // reader's own toggle must survive the spurious identity change.
      await wrapper.setProps({ defaultExpandedKeys: [1] })
      expect(openDetailTexts(wrapper)).toEqual(['Alice#0', 'Bob#1'])

      // A genuinely different seed replaces the set instead.
      await wrapper.setProps({ defaultExpandedKeys: [2] })
      expect(openDetailTexts(wrapper)).toEqual(['Bob#1'])
    })
  })

  describe('controlled mode', () => {
    it('reports a toggle without opening until the parent updates expandedKeys', async () => {
      const wrapper = mount(TxDataTable, {
        props: { columns, data, rowKey: 'id', expandable: true, expandedKeys: [] },
        slots: detailSlot,
      })

      await toggles(wrapper)[1].trigger('click')

      expect(wrapper.emitted('update:expandedKeys')?.at(-1)).toEqual([[2]])
      expect(wrapper.emitted('expand')?.at(-1)).toEqual([{ row: data[1], index: 1, expanded: true }])
      expect(openDetailTexts(wrapper)).toEqual([])

      await wrapper.setProps({ expandedKeys: [2] })
      expect(openDetailTexts(wrapper)).toEqual(['Bob#1'])
    })
  })

  describe('rowExpandable', () => {
    it('gates the toggle per row and keeps the leading cell for alignment', () => {
      const wrapper = mount(TxDataTable, {
        props: {
          columns,
          data,
          rowKey: 'id',
          expandable: true,
          rowExpandable: (row: { id: number }) => row.id !== 2,
          // A controlled key for a rejected row must not open it either.
          expandedKeys: [2],
        },
        slots: detailSlot,
      })

      const leadingCells = wrapper.findAll('.tx-data-table__cell--expand')
      expect(leadingCells).toHaveLength(2)
      expect(leadingCells[0].find('.tx-data-table__expand-toggle').exists()).toBe(true)
      expect(leadingCells[1].find('.tx-data-table__expand-toggle').exists()).toBe(false)
      expect(openDetailTexts(wrapper)).toEqual([])
    })
  })

  describe('accessibility wiring', () => {
    it('labels the toggle and points aria-controls at the detail row it renders', async () => {
      const wrapper = mount(TxDataTable, {
        props: {
          columns,
          data,
          rowKey: 'id',
          expandable: true,
          expandLabel: 'Show details',
          collapseLabel: 'Hide details',
        },
        slots: detailSlot,
      })

      expect(toggles(wrapper)[0].attributes('type')).toBe('button')
      expect(toggles(wrapper)[0].attributes('aria-expanded')).toBe('false')
      expect(toggles(wrapper)[0].attributes('aria-label')).toBe('Show details')

      await toggles(wrapper)[0].trigger('click')

      expect(toggles(wrapper)[0].attributes('aria-expanded')).toBe('true')
      expect(toggles(wrapper)[0].attributes('aria-label')).toBe('Hide details')

      const controls = toggles(wrapper)[0].attributes('aria-controls')
      expect(controls).toBeTruthy()
      const detail = wrapper.find(`[id="${controls}"]`)
      expect(detail.classes()).toContain('tx-data-table__row--detail')
      expect(wrapper.findAll('.tx-data-table__row--detail')).toHaveLength(1)
    })
  })

  describe('row click isolation', () => {
    it('fires expand instead of rowClick from the toggle, but rowClick from a data cell', async () => {
      const wrapper = mount(TxDataTable, {
        props: { columns, data, rowKey: 'id', expandable: true, onRowClick: () => {} },
        slots: detailSlot,
      })

      await toggles(wrapper)[0].trigger('click')

      expect(wrapper.emitted('expand')).toHaveLength(1)
      expect(wrapper.emitted('rowClick')).toBeUndefined()

      // Column 0 is the expand cell, so the name cell is index 1.
      await dataRows(wrapper)[1].findAll('td')[1].trigger('click')

      expect(wrapper.emitted('rowClick')?.at(-1)).toEqual([{ row: data[1], index: 1 }])
    })
  })

  describe('geometry', () => {
    it('spans the detail cell across the whole column set', () => {
      const plain = mount(TxDataTable, {
        props: { columns, data, rowKey: 'id', expandable: true, defaultExpandedKeys: [2] },
        slots: detailSlot,
      })
      expect(plain.find('.tx-data-table__cell--detail').attributes('colspan')).toBe('3')

      const withSelection = mount(TxDataTable, {
        props: { columns, data, rowKey: 'id', expandable: true, selectable: true, defaultExpandedKeys: [2] },
        slots: detailSlot,
      })
      expect(withSelection.find('.tx-data-table__cell--detail').attributes('colspan')).toBe('4')
    })

    it('adds a leading footer spacer so the columns stay under their headers', () => {
      const wrapper = mount(TxDataTable, {
        props: { columns, data, rowKey: 'id', expandable: true },
        slots: { 'footer-name': '<span>total</span>' },
      })

      const cells = wrapper.findAll('tfoot td')
      expect(cells).toHaveLength(3)
      expect(cells[0].classes()).toContain('tx-data-table__footer-cell--expand')
      expect(cells[1].text()).toBe('total')

      const withSelection = mount(TxDataTable, {
        props: { columns, data, rowKey: 'id', expandable: true, selectable: true },
        slots: { 'footer-name': '<span>total</span>' },
      })

      const selectedCells = withSelection.findAll('tfoot td')
      expect(selectedCells).toHaveLength(4)
      expect(selectedCells[0].classes()).toContain('tx-data-table__footer-cell--expand')
      expect(selectedCells[1].classes()).toContain('tx-data-table__footer-cell--select')
    })

    it('offsets a fixed-left column past the expand and select columns', () => {
      const fixedColumns = [{ key: 'a', title: 'A', fixed: 'left' as const, width: 100 }]

      const expandOnly = mount(TxDataTable, {
        props: { columns: fixedColumns, data, rowKey: 'id', expandable: true },
      })
      expect(expandOnly.find('thead .is-fixed-left').attributes('style')).toContain('left: 40px')

      const withSelection = mount(TxDataTable, {
        props: { columns: fixedColumns, data, rowKey: 'id', expandable: true, selectable: true },
      })
      expect(withSelection.find('thead .is-fixed-left').attributes('style')).toContain('left: 82px')
    })
  })

  describe('striping', () => {
    it('stripes by data-row index so an open detail row cannot shift the zebra', async () => {
      const wrapper = mount(TxDataTable, {
        props: { columns, data, rowKey: 'id', expandable: true, striped: true },
        slots: detailSlot,
      })

      const stripes = () => wrapper.findAll('tbody tr').map(tr => ({
        detail: tr.classes().includes('tx-data-table__row--detail'),
        striped: tr.classes().includes('is-stripe'),
      }))

      expect(stripes()).toEqual([
        { detail: false, striped: true },
        { detail: false, striped: false },
      ])

      // Inserting a row between the two data rows must not re-stripe them.
      await toggles(wrapper)[0].trigger('click')

      expect(stripes()).toEqual([
        { detail: false, striped: true },
        { detail: true, striped: false },
        { detail: false, striped: false },
      ])

      // A striped table that never opted into expansion keeps its nth-child zebra.
      const legacy = mount(TxDataTable, { props: { columns, data, striped: true } })
      expect(legacy.findAll('tbody tr').some(tr => tr.classes().includes('is-stripe'))).toBe(false)
    })
  })
})

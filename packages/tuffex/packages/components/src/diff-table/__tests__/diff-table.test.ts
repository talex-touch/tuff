import type { DiffTableColumn, DiffTableRow } from '../src/types'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TxDiffTable from '../src/TxDiffTable.vue'

interface Flavor {
  flavor: string
  category: string
  supplier: string
}

const columns: DiffTableColumn<Flavor>[] = [
  { key: 'flavor', title: 'Flavor', width: '34%' },
  { key: 'category', title: 'Category', width: '30%', tintText: false },
  { key: 'supplier', title: 'Supplier', width: '36%', strikeOnRemove: true },
]

const rows: DiffTableRow<Flavor>[] = [
  { key: 'rocky-road', change: 'removed', data: { flavor: 'Rocky Road', category: 'Classic', supplier: 'aurora-scoops' } },
  { key: 'bubblegum', change: 'removed', data: { flavor: 'Bubblegum', category: 'Retro', supplier: 'kumo-creamery' } },
  { key: 'mint-chip', data: { flavor: 'Mint Chip', category: 'Classic', supplier: 'maple-orbit' } },
  { key: 'pistachio', change: 'added', data: { flavor: 'Pistachio', category: 'Seasonal', supplier: 'maple-orbit' } },
]

function mountTable(props: Record<string, unknown> = {}) {
  return mount(TxDiffTable, {
    props: { columns, rows, title: 'Proposed menu cleanup', ...props },
  })
}

describe('txDiffTable', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the bar, headers, and one row per record', () => {
    const wrapper = mountTable({ play: 'manual' })

    expect(wrapper.find('.tx-bui-diff-table__title').text()).toBe('Proposed menu cleanup')
    expect(wrapper.findAll('thead th').map(th => th.text())).toEqual(['Flavor', 'Category', 'Supplier'])
    // Three ordinary rows plus the appended-row band.
    expect(wrapper.findAll('.tx-bui-diff-table__row')).toHaveLength(3)
    expect(wrapper.findAll('.tx-bui-diff-table__added')).toHaveLength(1)
    expect(wrapper.text()).toContain('Rocky Road')
    expect(wrapper.text()).toContain('Pistachio')
  })

  it('drops the bar when no title or slot is given', () => {
    const wrapper = mountTable({ play: 'manual', title: undefined })
    expect(wrapper.find('.tx-bui-diff-table__bar').exists()).toBe(false)
  })

  it('holds the plain table through the first two stages, then tints, then expands', async () => {
    const wrapper = mountTable()

    const removedRow = () => wrapper.findAll('.tx-bui-diff-table__row')[0]
    expect(removedRow().classes()).not.toContain('is-tinted')
    expect(wrapper.find('.tx-bui-diff-table__reveal').classes()).not.toContain('is-open')

    // The first delay is a deliberate reading pause: nothing changes yet.
    vi.advanceTimersByTime(800)
    await wrapper.vm.$nextTick()
    expect(removedRow().classes()).not.toContain('is-tinted')

    vi.advanceTimersByTime(1000)
    await wrapper.vm.$nextTick()
    expect(removedRow().classes()).toContain('is-tinted')
    expect(removedRow().classes()).toContain('is-removed')
    expect(wrapper.find('.tx-bui-diff-table__reveal').classes()).not.toContain('is-open')

    vi.advanceTimersByTime(1000)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.tx-bui-diff-table__reveal').classes()).toContain('is-open')
  })

  it('emits every stage transition and settles once', async () => {
    const wrapper = mountTable()

    vi.advanceTimersByTime(2800)
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('stageChange')?.map(args => args[0])).toEqual([1, 2, 3])
    expect(wrapper.emitted('settled')).toHaveLength(1)

    // The sequence plays once and rests: no further timers fire.
    vi.advanceTimersByTime(5000)
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('stageChange')).toHaveLength(3)
  })

  it('stays plain in manual mode until play() is called', async () => {
    const wrapper = mountTable({ play: 'manual' })

    vi.advanceTimersByTime(5000)
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('stageChange')).toBeUndefined()
    expect(wrapper.findAll('.tx-bui-diff-table__row')[0].classes()).not.toContain('is-tinted')

    ;(wrapper.vm as unknown as { play: () => void }).play()
    vi.advanceTimersByTime(2800)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.tx-bui-diff-table__reveal').classes()).toContain('is-open')
  })

  it('renders the finished diff immediately in settled mode without timers', async () => {
    const wrapper = mountTable({ play: 'settled' })
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('.tx-bui-diff-table__row')[0].classes()).toContain('is-tinted')
    expect(wrapper.find('.tx-bui-diff-table__reveal').classes()).toContain('is-open')
    expect(wrapper.emitted('settled')).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('exposes play / reset / settle and the current stage', async () => {
    const wrapper = mountTable({ play: 'manual' })
    const vm = wrapper.vm as unknown as { play: () => void, reset: () => void, settle: () => void, stage: number }

    expect(vm.stage).toBe(0)

    vm.settle()
    await wrapper.vm.$nextTick()
    expect(vm.stage).toBe(3)
    expect(wrapper.find('.tx-bui-diff-table__reveal').classes()).toContain('is-open')

    vm.reset()
    await wrapper.vm.$nextTick()
    expect(vm.stage).toBe(0)
    expect(wrapper.find('.tx-bui-diff-table__reveal').classes()).not.toContain('is-open')
    expect(wrapper.findAll('.tx-bui-diff-table__row')[0].classes()).not.toContain('is-tinted')
  })

  it('honours custom stage delays and duration', async () => {
    const wrapper = mountTable({ stageDelays: [10, 20, 30], duration: 120 })

    expect(wrapper.attributes('style')).toContain('--tx-bui-diff-table-duration: 120ms')

    vi.advanceTimersByTime(30)
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.tx-bui-diff-table__row')[0].classes()).toContain('is-tinted')

    vi.advanceTimersByTime(30)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.tx-bui-diff-table__reveal').classes()).toContain('is-open')
  })

  it('marks per-column tint and strike only on outgoing rows', async () => {
    const wrapper = mountTable({ play: 'settled' })
    await wrapper.vm.$nextTick()

    const [removed, , unchanged] = wrapper.findAll('.tx-bui-diff-table__row')
    const removedCells = removed.findAll('.tx-bui-diff-table__cell')
    expect(removedCells[0].classes()).toContain('is-tinted')
    // tintText: false keeps the chip column on its own palette.
    expect(removedCells[1].classes()).not.toContain('is-tinted')
    expect(removedCells[2].classes()).toContain('is-struck')
    expect(removedCells[0].classes()).not.toContain('is-struck')

    for (const cell of unchanged.findAll('.tx-bui-diff-table__cell')) {
      expect(cell.classes()).not.toContain('is-tinted')
      expect(cell.classes()).not.toContain('is-struck')
    }
  })

  it('derives the appended row grid and colgroup from the same columns', () => {
    const wrapper = mountTable({ play: 'manual' })

    const widths = wrapper.findAll('colgroup col').map(col => col.attributes('style'))
    expect(widths).toEqual(['width: 34%;', 'width: 30%;', 'width: 36%;'])
    expect(wrapper.find('.tx-bui-diff-table__added-grid').attributes('style'))
      .toContain('grid-template-columns: 34% 30% 36%')
    expect(wrapper.find('.tx-bui-diff-table__added-cell').attributes('colspan')).toBe('3')
  })

  it('keeps the collapsed appended row out of the accessibility tree', async () => {
    const wrapper = mountTable({ play: 'manual' })
    const grid = () => wrapper.find('.tx-bui-diff-table__added-grid')

    expect(grid().attributes('aria-hidden')).toBe('true')
    expect(grid().attributes('inert')).toBeDefined()

    ;(wrapper.vm as unknown as { settle: () => void }).settle()
    await wrapper.vm.$nextTick()
    expect(grid().attributes('aria-hidden')).toBeUndefined()
    expect(grid().attributes('inert')).toBeUndefined()
  })

  it('renders cell slots with the row change kind', () => {
    const wrapper = mount(TxDiffTable, {
      props: { columns, rows, play: 'settled' as const },
      slots: {
        'cell-category': `<template #cell-category="{ value, change }"><em class="chip">{{ value }}/{{ change }}</em></template>`,
      },
    })

    const chips = wrapper.findAll('.chip').map(chip => chip.text())
    expect(chips).toEqual(['Classic/removed', 'Retro/removed', 'Classic/unchanged', 'Seasonal/added'])
  })

  it('applies column format functions', () => {
    const wrapper = mount(TxDiffTable, {
      props: {
        play: 'manual' as const,
        rows: [{ key: 'a', data: { flavor: 'Mint', category: 'Classic', supplier: 'maple' } }],
        columns: [{ key: 'flavor', title: 'Flavor', format: (value: any) => String(value).toUpperCase() }],
      },
    })

    expect(wrapper.find('.tx-bui-diff-table__cell').text()).toBe('MINT')
  })

  it('clears its pending stage on unmount', () => {
    const wrapper = mountTable()
    expect(vi.getTimerCount()).toBe(1)

    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('restarts or settles when the play mode changes', async () => {
    const wrapper = mountTable({ play: 'manual' })

    await wrapper.setProps({ play: 'settled' })
    expect((wrapper.vm as unknown as { stage: number }).stage).toBe(3)

    await wrapper.setProps({ play: 'manual' })
    expect(vi.getTimerCount()).toBe(0)
  })
})

import type { DiffTableColumn, DiffTableCounts, DiffTableRow } from '../src/types'
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

// `play: 'settled'` skips the reveal timers: these assertions are about the
// accept layer, not the stage machine, and an un-expanded added row keeps its
// control behind `inert`.
function mountTable(props: Record<string, unknown> = {}) {
  return mount(TxDiffTable, {
    props: { columns, rows, title: 'Proposed menu cleanup', play: 'settled', ...props },
  })
}

describe('txDiffTable accept layer', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('renders no accept control until selectable is on', () => {
    expect(mountTable().findAll('.tx-bui-diff-table__accept')).toHaveLength(0)
  })

  it('gives every changed row a control and leaves unchanged rows alone', () => {
    const wrapper = mountTable({ selectable: true })

    // 2 removed + 1 added = 3; mint-chip is unchanged and gets none.
    expect(wrapper.findAll('.tx-bui-diff-table__accept')).toHaveLength(3)
    const unchangedRow = wrapper.findAll('.tx-bui-diff-table__row')[2]!
    expect(unchangedRow.find('.tx-bui-diff-table__accept').exists()).toBe(false)
    expect(unchangedRow.classes()).not.toContain('is-toggleable')
  })

  it('starts every changed row accepted when uncontrolled', () => {
    const wrapper = mountTable({ selectable: true })

    for (const button of wrapper.findAll('.tx-bui-diff-table__accept'))
      expect(button.attributes('aria-pressed')).toBe('true')
  })

  it('toggles a row off and back on, reporting both directions', async () => {
    const wrapper = mountTable({ selectable: true })
    const first = wrapper.findAll('.tx-bui-diff-table__accept')[0]!

    await first.trigger('click')
    expect(first.attributes('aria-pressed')).toBe('false')
    await first.trigger('click')
    expect(first.attributes('aria-pressed')).toBe('true')

    const toggles = wrapper.emitted('toggle') as { key: string, accepted: boolean }[][]
    expect(toggles.map(([payload]) => payload)).toEqual([
      { key: 'rocky-road', accepted: false },
      { key: 'rocky-road', accepted: true },
    ])
  })

  it('emits keys in row order, not toggle order', async () => {
    const wrapper = mountTable({ selectable: true })
    const buttons = wrapper.findAll('.tx-bui-diff-table__accept')

    await buttons[0]!.trigger('click') // drop rocky-road
    await buttons[0]!.trigger('click') // add it back last

    const emitted = wrapper.emitted('update:modelValue') as (string | number)[][][]
    expect(emitted.at(-1)![0]).toEqual(['rocky-road', 'bubblegum', 'pistachio'])
  })

  it('clicking the row toggles it, so the whole row is the control', async () => {
    const wrapper = mountTable({ selectable: true })

    await wrapper.findAll('.tx-bui-diff-table__row')[0]!.trigger('click')

    expect((wrapper.emitted('toggle')![0] as [{ key: string }])[0].key).toBe('rocky-road')
  })

  it('ignores clicks on an unchanged row', async () => {
    const wrapper = mountTable({ selectable: true })

    await wrapper.findAll('.tx-bui-diff-table__row')[2]!.trigger('click')

    expect(wrapper.emitted('toggle')).toBeUndefined()
  })

  it('stays controlled: with modelValue bound it never changes its own state', async () => {
    const wrapper = mountTable({ selectable: true, modelValue: ['bubblegum'] })
    const buttons = wrapper.findAll('.tx-bui-diff-table__accept')

    expect(buttons[0]!.attributes('aria-pressed')).toBe('false')
    expect(buttons[1]!.attributes('aria-pressed')).toBe('true')

    await buttons[0]!.trigger('click')

    // It asked for the change and left the write to the host.
    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual([['rocky-road', 'bubblegum']])
    expect(wrapper.findAll('.tx-bui-diff-table__accept')[0]!.attributes('aria-pressed')).toBe('false')
  })

  it('treats an empty modelValue as "nothing accepted", not as absent', () => {
    const wrapper = mountTable({ selectable: true, modelValue: [], footer: true })

    for (const button of wrapper.findAll('.tx-bui-diff-table__accept'))
      expect(button.attributes('aria-pressed')).toBe('false')
    expect(wrapper.find('.tx-bui-diff-table__apply').attributes('disabled')).toBeDefined()
  })

  it('summarises only accepted rows', async () => {
    const wrapper = mountTable({ selectable: true, footer: true })

    expect(wrapper.find('.tx-bui-diff-table__summary').text()).toBe('2 removals · 1 addition')
    expect(wrapper.find('.tx-bui-diff-table__apply').text()).toBe('Apply 3 changes')

    await wrapper.findAll('.tx-bui-diff-table__accept')[0]!.trigger('click')

    expect(wrapper.find('.tx-bui-diff-table__summary').text()).toBe('1 removal · 1 addition')
    expect(wrapper.find('.tx-bui-diff-table__apply').text()).toBe('Apply 2 changes')
  })

  it('lets the host own the wording', () => {
    const wrapper = mountTable({
      selectable: true,
      footer: true,
      summaryFormatter: (c: DiffTableCounts) => `删除 ${c.removed} · 新增 ${c.added}`,
      applyLabelFormatter: (n: number) => `应用 ${n} 项`,
    })

    expect(wrapper.find('.tx-bui-diff-table__summary').text()).toBe('删除 2 · 新增 1')
    expect(wrapper.find('.tx-bui-diff-table__apply').text()).toBe('应用 3 项')
  })

  it('applies with the keys accepted at that moment', async () => {
    const wrapper = mountTable({ selectable: true, footer: true })

    await wrapper.findAll('.tx-bui-diff-table__accept')[1]!.trigger('click')
    await wrapper.find('.tx-bui-diff-table__apply').trigger('click')

    expect(wrapper.emitted('apply')!.at(-1)).toEqual([['rocky-road', 'pistachio']])
  })

  it('renders no footer unless asked', () => {
    expect(mountTable({ selectable: true }).find('.tx-bui-diff-table__foot').exists()).toBe(false)
  })

  it('shows the title-bar hint, and keeps the bar for a hint with no title', () => {
    const withBoth = mountTable({ hint: 'Click changed rows to toggle' })
    expect(withBoth.find('.tx-bui-diff-table__hint').text()).toBe('Click changed rows to toggle')

    const hintOnly = mount(TxDiffTable, {
      props: { columns, rows, play: 'settled', hint: 'Toggle rows' },
    })
    expect(hintOnly.find('.tx-bui-diff-table__bar').exists()).toBe(true)
    expect(hintOnly.find('.tx-bui-diff-table__hint').text()).toBe('Toggle rows')
  })

  it('keeps the added row grid aligned with the header when the control column appears', () => {
    const wrapper = mountTable({ selectable: true })

    // colgroup gains a track and the colspan grows, or the appended row drifts
    // out of alignment with the columns above it.
    expect(wrapper.findAll('col')).toHaveLength(columns.length + 1)
    expect(wrapper.find('.tx-bui-diff-table__added-cell').attributes('colspan'))
      .toBe(String(columns.length + 1))

    // Percentage tracks must give back an equal share of the control strip.
    // Appending 44px to a set that already totals 100% pushes the control past
    // the grid's right edge, where `overflow: hidden` eats it — the appended row
    // then silently loses a control every <tr> above it still has.
    const style = wrapper.find('.tx-bui-diff-table__added-grid').attributes('style')!
    expect(style).toContain('calc(34% - 44px / 3)')
    expect(style).toContain('calc(30% - 44px / 3)')
    expect(style).toContain('calc(36% - 44px / 3)')
    expect(style.trimEnd().replace(/;$/, '')).toMatch(/44px$/)
  })

  it('leaves the grid untouched when the control column is off', () => {
    const style = mountTable().find('.tx-bui-diff-table__added-grid').attributes('style')!

    expect(style).not.toContain('calc')
    expect(style).not.toContain('44px')
  })

  it('labels each control by what pressing it would do', async () => {
    const wrapper = mountTable({ selectable: true })
    const first = wrapper.findAll('.tx-bui-diff-table__accept')[0]!

    expect(first.attributes('aria-label')).toBe('Reject this change')
    await first.trigger('click')
    expect(first.attributes('aria-label')).toBe('Accept this change')
  })
})

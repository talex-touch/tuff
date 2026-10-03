import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxDataTable from '../src/TxDataTable.vue'

// vitest runs from the tuffex package root; import.meta.url is rewritten by vite.
const SFC_PATH = join(process.cwd(), 'packages/components/src/data-table/src/TxDataTable.vue')

const columns = [
  { key: 'name', title: 'Name' },
  { key: 'role', title: 'Role', width: 120 },
  { key: 'score', title: 'Score', align: 'right' as const },
]

const data = [
  { id: 1, name: 'Alice', role: 'Designer', score: 92 },
  { id: 2, name: 'Bob', role: 'Engineer', score: 88 },
]

const skeletonRows = '.tx-data-table__row--skeleton'

describe('txDataTable loading variants', () => {
  it('keeps the overlay by default: spinner veil, no placeholder rows, no empty state', () => {
    const empty = mount(TxDataTable, { props: { columns, data: [], loading: true } })
    expect(empty.find('.tx-data-table__loading').exists()).toBe(true)
    expect(empty.findAll(skeletonRows)).toHaveLength(0)
    expect(empty.find('.tx-data-table__empty').exists()).toBe(false)
    expect(empty.find('table').attributes('aria-busy')).toBe('true')

    // With rows, the default still veils them, exactly as before the variant existed.
    const filled = mount(TxDataTable, { props: { columns, data, loading: true } })
    expect(filled.find('.tx-data-table__loading').exists()).toBe(true)
    expect(filled.findAll('tbody .tx-data-table__row')).toHaveLength(2)
    expect(filled.find('.tx-data-table__refresh').exists()).toBe(false)
  })

  it('draws placeholder rows shaped like the columns before the first rows land', () => {
    const wrapper = mount(TxDataTable, {
      props: { columns, data: [], loading: true, loadingVariant: 'skeleton' },
    })

    expect(wrapper.find('.tx-data-table__loading').exists()).toBe(false)
    expect(wrapper.find('.tx-data-table__empty').exists()).toBe(false)
    expect(wrapper.find('table').attributes('aria-busy')).toBe('true')

    const rows = wrapper.findAll(skeletonRows)
    expect(rows).toHaveLength(5)
    for (const row of rows) {
      expect(row.attributes('aria-hidden')).toBe('true')
      expect(row.attributes('tabindex')).toBeUndefined()
      const cells = row.findAll('td')
      expect(cells).toHaveLength(columns.length)
      // Same cell class as a loaded row, so the padding and the rule match.
      expect(cells.every(cell => cell.classes().includes('tx-data-table__cell'))).toBe(true)
      expect(cells.every(cell => cell.find('.tx-skeleton.tx-data-table__skeleton').exists())).toBe(true)
    }

    // Column widths and alignment carry over to the placeholders.
    const first = rows[0]!.findAll('td')
    expect(first[1]!.attributes('style')).toContain('width: 120px')
    expect(first[2]!.find('.tx-data-table__skeleton').attributes('style')).toContain('align-items: flex-end')
    expect(first[0]!.find('.tx-data-table__skeleton').attributes('style')).not.toContain('align-items')

    // The placeholder is TxSkeleton's root, which must carry the table's scope id:
    // without it the scoped one-line-box rule (`height: 1lh`) never matches.
    const scopeId = Object.keys(wrapper.find('table').attributes()).find(name => name.startsWith('data-v-'))
    expect(scopeId).toBeDefined()
    expect(first[0]!.find('.tx-data-table__skeleton').attributes()).toHaveProperty(scopeId!)
  })

  it('varies the bar widths deterministically and honours skeletonRows', () => {
    const render = () => mount(TxDataTable, {
      props: { columns, data: [], loading: true, loadingVariant: 'skeleton', skeletonRows: 3 },
    })
    const widths = (wrapper: ReturnType<typeof render>) => wrapper
      .findAll('.tx-data-table__skeleton .tx-skeleton__item')
      .map(bar => bar.attributes('style')?.match(/--tx-skeleton-width: ([^;]+)/)?.[1])

    const first = render()
    expect(first.findAll(skeletonRows)).toHaveLength(3)
    const bars = widths(first)
    expect(bars).toHaveLength(9)
    expect(new Set(bars).size).toBeGreaterThan(3)
    for (const bar of bars)
      expect(Number.parseInt(bar ?? '', 10)).toBeGreaterThanOrEqual(60)
    // Same input, same widths: the server render and hydration agree.
    expect(widths(render())).toEqual(bars)
  })

  it('reserves the selection and expand columns in placeholder rows', () => {
    const wrapper = mount(TxDataTable, {
      props: { columns, data: [], loading: true, loadingVariant: 'skeleton', selectable: true, expandable: true, skeletonRows: 2 },
    })

    const row = wrapper.find(skeletonRows)
    expect(row.findAll('td')).toHaveLength(columns.length + 2)
    expect(row.find('.tx-data-table__cell--expand').element.children).toHaveLength(0)
    expect(row.find('.tx-data-table__cell--select .tx-data-table__skeleton.is-check').exists()).toBe(true)
    // No checkbox or toggle: a placeholder offers nothing to operate.
    expect(row.find('button').exists()).toBe(false)
  })

  it('keeps the rows during a refresh and shows the bar instead of the veil', async () => {
    const wrapper = mount(TxDataTable, {
      props: { columns, data, rowKey: 'id', loadingVariant: 'skeleton', loading: false },
    })
    const before = wrapper.findAll('tbody .tx-data-table__row').map(row => row.element)

    await wrapper.setProps({ loading: true })

    const during = wrapper.findAll('tbody .tx-data-table__row')
    // The very same row elements: kept, not torn down and redrawn.
    expect(during).toHaveLength(before.length)
    expect(during.every((row, index) => row.element === before[index])).toBe(true)
    expect(wrapper.text()).toContain('Alice')
    expect(wrapper.findAll(skeletonRows)).toHaveLength(0)
    expect(wrapper.find('.tx-data-table__loading').exists()).toBe(false)
    expect(wrapper.find('table').attributes('aria-busy')).toBe('true')

    const refresh = wrapper.find('tbody.tx-data-table__refresh')
    expect(refresh.attributes('aria-hidden')).toBe('true')
    expect(refresh.find('td').attributes('colspan')).toBe(String(columns.length))
    expect(refresh.find('.tx-data-table__refresh-bar').exists()).toBe(true)
    // Its own row group, ahead of the body: the data rows keep their nth-child parity.
    const groups = wrapper.findAll('table > tbody')
    expect(groups).toHaveLength(2)
    expect(groups[0]!.classes()).toContain('tx-data-table__refresh')
    expect(groups[1]!.findAll('tr')[0]!.text()).toContain('Alice')

    await wrapper.setProps({ loading: false })
    expect(wrapper.find('.tx-data-table__refresh').exists()).toBe(false)
  })

  it('swaps placeholder rows for real rows, and for the empty state when nothing came back', async () => {
    const wrapper = mount(TxDataTable, {
      props: { columns, data: [], loading: true, loadingVariant: 'skeleton' },
    })
    expect(wrapper.findAll(skeletonRows)).toHaveLength(5)

    await wrapper.setProps({ loading: false })
    expect(wrapper.findAll(skeletonRows)).toHaveLength(0)
    expect(wrapper.find('.tx-data-table__empty').exists()).toBe(true)

    await wrapper.setProps({ loading: true })
    await wrapper.setProps({ data, loading: false })
    expect(wrapper.findAll(skeletonRows)).toHaveLength(0)
    expect(wrapper.findAll('tbody .tx-data-table__row')).toHaveLength(2)
  })

  it('treats an unknown variant as the overlay, so the table still reads as busy', () => {
    const wrapper = mount(TxDataTable, {
      props: { columns, data: [], loading: true, loadingVariant: 'shimmer' as never },
    })
    expect(wrapper.find('.tx-data-table__loading').exists()).toBe(true)
    expect(wrapper.findAll(skeletonRows)).toHaveLength(0)
  })

  // vitest never evaluates an SFC's <style>, so the layout contracts are read off
  // the source: the placeholder holds one line box, and the refresh bar only moves
  // when motion is allowed, on the compositor, without leaving the table.
  it('sizes placeholders by the line box and keeps the refresh bar still under reduced motion', () => {
    const sfc = readFileSync(SFC_PATH, 'utf8')
    const style = sfc.slice(sfc.indexOf('<style'))

    expect(style).toMatch(/\.tx-data-table__skeleton \{\s*height: 1lh;/)
    expect(style).toMatch(/\.tx-data-table__row--skeleton \{\s*pointer-events: none;/)

    const motion = style.match(/@media \(prefers-reduced-motion: no-preference\) \{([\s\S]*?)\n\}/)
    expect(motion, 'refresh animation must be declared under no-preference only').not.toBeNull()
    expect(motion![1]).toMatch(/animation: tx-data-table-refresh /)
    // Declared nowhere else: reduced motion keeps the still, full-width bar.
    expect(style.match(/animation: tx-data-table-refresh/g)).toHaveLength(1)

    const keyframes = style.match(/@keyframes tx-data-table-refresh \{([\s\S]*?)\n\}/)
    expect(keyframes).not.toBeNull()
    expect(keyframes![1]).toMatch(/translate: 150% 0;/)
    expect(keyframes![1]).not.toMatch(/var\(|left|width|transform:/)
  })
})

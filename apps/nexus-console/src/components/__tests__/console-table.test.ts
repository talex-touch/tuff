import { mount } from '@vue/test-utils'
import { effectScope } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import ConsoleTable from '@/components/ConsoleTable.vue'
import { shouldShowPager, sliceClientPage, useConsoleList } from '@/composables/useConsoleList'
import { i18n } from '@/i18n'

interface SampleRow {
  id: string
  name: string
}

const COLUMNS = [
  { key: 'name', title: 'Name' },
]

describe('ConsoleTable pagination, empty states, and useConsoleList', () => {
  it('slices client pages accurately and clamps out-of-bounds pages', () => {
    const items = Array.from({ length: 25 }, (_, i) => ({ id: String(i + 1), name: `Row ${i + 1}` }))
    expect(sliceClientPage(items, 1, 10).rows).toHaveLength(10)
    expect(sliceClientPage(items, 3, 10).rows).toHaveLength(5)
    expect(sliceClientPage(items, 99, 10).rows[0]?.id).toBe('21')
    expect(sliceClientPage([], 1, 10)).toEqual({ rows: [], total: 0 })
  })

  it('computes pager visibility correctly', () => {
    expect(shouldShowPager({ total: 0, limit: 20, page: 1, pageSizes: [10, 20] })).toBe(false)
    expect(shouldShowPager({ total: 8, limit: 20, page: 1, pageSizes: [10, 20] })).toBe(false)
    expect(shouldShowPager({ total: 15, limit: 20, page: 1, pageSizes: [10, 20] })).toBe(true)
    expect(shouldShowPager({ total: 25, limit: 20, page: 1, pageSizes: [20, 50] })).toBe(true)
  })

  it('renders empty state when rows are empty and filtered empty state with clear action', async () => {
    const wrapper = mount(ConsoleTable, {
      global: { plugins: [i18n] },
      props: {
        columns: COLUMNS,
        rows: [] as SampleRow[],
        rowKey: 'id',
        loading: false,
        filtered: false,
        total: 0,
      },
    })
    expect(wrapper.text()).toContain('Nothing here yet')

    await wrapper.setProps({ filtered: true })
    expect(wrapper.text()).toContain('Nothing matches these filters')
    expect(wrapper.text()).toContain('Clear filters')
  })

  it('renders error state when error prop is set', () => {
    const wrapper = mount(ConsoleTable, {
      global: { plugins: [i18n] },
      props: {
        columns: COLUMNS,
        rows: [] as SampleRow[],
        rowKey: 'id',
        loading: false,
        error: 'Database offline',
        total: 0,
      },
    })
    expect(wrapper.text()).toContain('Database offline')
    expect(wrapper.text()).toContain('Retry')
  })

  it('renders row count footer and pagination when total exceeds page size', () => {
    const rows: SampleRow[] = Array.from({ length: 10 }, (_, i) => ({ id: String(i), name: `Item ${i}` }))
    const wrapper = mount(ConsoleTable, {
      global: { plugins: [i18n] },
      props: {
        columns: COLUMNS,
        rows,
        rowKey: 'id',
        loading: false,
        page: 1,
        limit: 10,
        total: 42,
        pageSizes: [10, 20, 50],
      },
    })
    expect(wrapper.text()).toContain('42 total')
    expect(wrapper.find('nav').exists()).toBe(true)
  })

  it('fetches paginated rows and resets page on filter change via useConsoleList', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      rows: [{ id: '1', name: 'Alpha' }],
      total: 1,
    })

    const scope = effectScope()
    const state = scope.run(() => useConsoleList<SampleRow, { status: string }>({
      defaults: { status: '' },
      defaultLimit: 10,
      fetch: fetchSpy,
    }))!

    await vi.waitFor(() => expect(state.loading.value).toBe(false))
    expect(state.rows.value).toHaveLength(1)
    expect(fetchSpy).toHaveBeenCalledWith({ page: 1, limit: 10, filters: { status: '' } })

    state.setPage(2)
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledWith({ page: 2, limit: 10, filters: { status: '' } }))

    state.filters.status = 'active'
    await vi.waitFor(() => expect(state.page.value).toBe(1))
    expect(fetchSpy).toHaveBeenLastCalledWith({ page: 1, limit: 10, filters: { status: 'active' } })
    scope.stop()
  })
})

// @vitest-environment jsdom
import type { MemoryItem } from '@talex-touch/tuff-intelligence'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import MemoryList from './MemoryList.vue'

vi.mock('@talex-touch/tuffex/button', () => ({
  TxButton: {
    name: 'TxButton',
    props: ['disabled', 'loading'],
    template: '<button :disabled="disabled || loading"><slot /></button>'
  }
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key
  })
}))

function createMemory(overrides: Partial<MemoryItem> = {}): MemoryItem {
  return {
    id: 'mem_global',
    type: 'preference',
    scope: 'global',
    content: 'Reply in Chinese',
    summary: 'Reply in Chinese',
    tags: [],
    confidence: 1,
    privacyLevel: 'normal',
    enabled: true,
    createdAt: 1,
    updatedAt: 2,
    usageCount: 0,
    ...overrides
  }
}

const MEMORIES: MemoryItem[] = [
  createMemory(),
  createMemory({
    id: 'mem_source',
    scope: 'session',
    sourceSessionId: 'session-1',
    summary: 'Session with source'
  }),
  createMemory({ id: 'mem_orphan', scope: 'session', summary: 'Session without source' }),
  createMemory({ id: 'mem_workspace', scope: 'workspace', type: 'project', summary: 'Workspace' }),
  createMemory({ id: 'mem_project', scope: 'project', enabled: false, summary: 'Project' })
]

function mountList(props: Record<string, unknown> = {}) {
  return mount(MemoryList, {
    attachTo: document.body,
    props: {
      memories: MEMORIES,
      selectedId: null,
      emptyText: 'empty-text',
      ...props
    }
  })
}

function row(wrapper: ReturnType<typeof mountList>, id: string) {
  return wrapper.get(`[data-testid="memory-row-${id}"]`)
}

let mounted: ReturnType<typeof mountList> | null = null

afterEach(() => {
  mounted?.unmount()
  mounted = null
  vi.useRealTimers()
})

describe('memoryList rows', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows the summary and type · scope of each memory', () => {
    mounted = mountList()

    const first = row(mounted, 'mem_global')
    expect(first.text()).toContain('Reply in Chinese')
    expect(first.text()).toContain(
      'intelligence.memoryReview.types.preference · intelligence.memoryReview.scopes.global'
    )
    expect(row(mounted, 'mem_workspace').text()).toContain(
      'intelligence.memoryReview.types.project · intelligence.memoryReview.scopes.workspace'
    )
  })

  it('marks every memory whose scope keeps it out of replies, and none that is in effect', () => {
    mounted = mountList()

    const marker = (id: string) => row(mounted!, id).find('[data-testid="memory-row-effect"]')

    expect(marker('mem_global').exists()).toBe(false)
    expect(marker('mem_source').text()).toBe('intelligence.memoryReview.effect.sourceSessionOnly')
    expect(marker('mem_orphan').text()).toBe('intelligence.memoryReview.effect.inactive')
    expect(marker('mem_workspace').text()).toBe('intelligence.memoryReview.effect.inactive')
    expect(marker('mem_project').text()).toBe('intelligence.memoryReview.effect.inactive')
  })

  it('badges disabled memories only', () => {
    mounted = mountList()

    expect(row(mounted, 'mem_project').text()).toContain('intelligence.memoryReview.disabled')
    expect(row(mounted, 'mem_global').text()).not.toContain('intelligence.memoryReview.disabled')
  })

  it('does not show usage counts or last-used times, which nothing ever writes', () => {
    mounted = mountList()

    expect(mounted.text()).not.toContain('usageCount')
    expect(mounted.text()).not.toContain('lastUsedAt')
  })
})

describe('memoryList selection', () => {
  it('renders a listbox whose selected option is the selected memory', () => {
    mounted = mountList({ selectedId: 'mem_orphan' })

    const listbox = mounted.get('[role="listbox"]')
    expect(listbox.attributes('aria-label')).toBe('intelligence.memoryReview.listLabel')
    const selected = mounted
      .findAll('[role="option"]')
      .filter((option) => option.attributes('aria-selected') === 'true')
    expect(selected.map((option) => option.attributes('data-memory-id'))).toEqual(['mem_orphan'])
  })

  it('emits the clicked memory', async () => {
    mounted = mountList()

    await row(mounted, 'mem_workspace').trigger('click')

    expect(mounted.emitted('select')).toEqual([['mem_workspace']])
  })

  it('keeps one tab stop: the selection, or the first row when nothing here is selected', async () => {
    mounted = mountList({ selectedId: 'mem_source' })
    const tabStops = () =>
      mounted!
        .findAll('[role="option"]')
        .filter((option) => option.attributes('tabindex') === '0')
        .map((option) => option.attributes('data-memory-id'))

    expect(tabStops()).toEqual(['mem_source'])

    await mounted.setProps({ selectedId: 'mem_on_another_page' })
    expect(tabStops()).toEqual(['mem_global'])
  })

  it('moves the selection and the focus with the arrow keys, Home and End', async () => {
    mounted = mountList({ selectedId: 'mem_source' })
    const listbox = mounted.get('[role="listbox"]')

    ;(row(mounted, 'mem_source').element as HTMLElement).focus()
    await row(mounted, 'mem_source').trigger('keydown', { key: 'ArrowDown' })
    await nextTick()
    expect(mounted.emitted('select')?.at(-1)).toEqual(['mem_orphan'])
    expect(document.activeElement).toBe(row(mounted, 'mem_orphan').element)

    await row(mounted, 'mem_orphan').trigger('keydown', { key: 'ArrowUp' })
    expect(mounted.emitted('select')?.at(-1)).toEqual(['mem_source'])

    await row(mounted, 'mem_source').trigger('keydown', { key: 'End' })
    expect(mounted.emitted('select')?.at(-1)).toEqual(['mem_project'])

    await row(mounted, 'mem_project').trigger('keydown', { key: 'Home' })
    expect(mounted.emitted('select')?.at(-1)).toEqual(['mem_global'])

    const before = mounted.emitted('select')?.length
    await row(mounted, 'mem_project').trigger('keydown', { key: 'ArrowDown' })
    expect(mounted.emitted('select')?.length).toBe(before)

    await listbox.trigger('keydown', { key: 'a' })
    expect(mounted.emitted('select')?.length).toBe(before)
  })
})

describe('memoryList loading, empty and failed states', () => {
  it('holds the skeleton back, then shows it in the rows’ own boxes while the first page is pending', async () => {
    vi.useFakeTimers()
    mounted = mountList({ memories: [], pending: true })

    // Inside the delay: neither a skeleton nor the empty text, which would be a false "no memories".
    expect(mounted.find('[data-testid="memory-list-skeleton"]').exists()).toBe(false)
    expect(mounted.text()).not.toContain('empty-text')

    await vi.advanceTimersByTimeAsync(200)
    const skeleton = mounted.get('[data-testid="memory-list-skeleton"]')
    expect(skeleton.attributes('aria-hidden')).toBe('true')
    expect(skeleton.findAll('.memory-list__row.is-skeleton').length).toBeGreaterThan(0)
    expect(skeleton.find('button, [tabindex]').exists()).toBe(false)

    await mounted.setProps({ pending: false, memories: MEMORIES })
    // Once up, the skeleton stays for its minimum duration instead of vanishing half-drawn.
    expect(mounted.find('[data-testid="memory-list-skeleton"]').exists()).toBe(true)
    await vi.advanceTimersByTimeAsync(500)
    expect(mounted.find('[data-testid="memory-list-skeleton"]').exists()).toBe(false)
    expect(mounted.findAll('[role="option"]')).toHaveLength(MEMORIES.length)
  })

  it('shows no skeleton for a first page that arrives inside the delay', async () => {
    vi.useFakeTimers()
    mounted = mountList({ memories: [], pending: true })

    await vi.advanceTimersByTimeAsync(100)
    await mounted.setProps({ pending: false, memories: MEMORIES })
    await vi.advanceTimersByTimeAsync(1000)

    expect(mounted.find('[data-testid="memory-list-skeleton"]').exists()).toBe(false)
    expect(mounted.findAll('[role="option"]')).toHaveLength(MEMORIES.length)
  })

  it('shows the empty text when a settled page has no memories', () => {
    mounted = mountList({ memories: [] })

    expect(mounted.get('[role="status"]').text()).toBe('empty-text')
    expect(mounted.find('[role="listbox"]').exists()).toBe(false)
  })

  it('shows a failed first load as an error with a retry, not as an empty list', async () => {
    mounted = mountList({ memories: [], failed: true })

    expect(mounted.get('[role="alert"]').text()).toContain('intelligence.memoryReview.loadFailed')
    expect(mounted.text()).not.toContain('empty-text')

    await mounted.get('[data-testid="memory-list-retry"]').trigger('click')
    expect(mounted.emitted('retry')).toHaveLength(1)
  })

  it('keeps the rows it has when a later reload fails', () => {
    mounted = mountList({ failed: true })

    expect(mounted.findAll('[role="option"]')).toHaveLength(MEMORIES.length)
    expect(mounted.find('[role="alert"]').exists()).toBe(false)
  })
})

describe('memoryList pager', () => {
  it('hides the pager when everything fits on one page', () => {
    mounted = mountList()

    expect(mounted.find('[data-testid="memory-review-page-next"]').exists()).toBe(false)
    expect(mounted.find('[data-testid="memory-review-page-previous"]').exists()).toBe(false)
  })

  it('pages forward and back, and waits while a reload is in flight', async () => {
    mounted = mountList({ page: 2, hasPrevious: true, hasNext: true })

    expect(mounted.text()).toContain('intelligence.memoryReview.page:{"page":2}')
    await mounted.get('[data-testid="memory-review-page-next"]').trigger('click')
    await mounted.get('[data-testid="memory-review-page-previous"]').trigger('click')
    expect(mounted.emitted('next')).toHaveLength(1)
    expect(mounted.emitted('previous')).toHaveLength(1)

    await mounted.setProps({ busy: true })
    expect(mounted.get('[data-testid="memory-review-page-next"]').attributes()).toHaveProperty(
      'disabled'
    )
    expect(mounted.get('[data-testid="memory-review-page-previous"]').attributes()).toHaveProperty(
      'disabled'
    )
  })

  it('disables the direction that has no page', () => {
    mounted = mountList({ page: 1, hasPrevious: false, hasNext: true })

    expect(mounted.get('[data-testid="memory-review-page-previous"]').attributes()).toHaveProperty(
      'disabled'
    )
    expect(mounted.get('[data-testid="memory-review-page-next"]').attributes()).not.toHaveProperty(
      'disabled'
    )
  })
})

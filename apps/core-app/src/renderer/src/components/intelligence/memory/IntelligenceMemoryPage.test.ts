// @vitest-environment jsdom
import type { MemoryItem } from '@talex-touch/tuff-intelligence'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h, KeepAlive, nextTick, ref } from 'vue'
import IntelligenceMemoryPage from '~/views/base/intelligence/IntelligenceMemoryPage.vue'

/**
 * The page lives in `views/base/intelligence/`, where the settings smoke test allows page files
 * only; its test sits with the memory components it composes.
 */

const aiClient = vi.hoisted(() => ({
  contextEvaluateMemory: vi.fn(),
  contextSaveMemory: vi.fn(),
  contextReplaceMemory: vi.fn(),
  contextListMemories: vi.fn(),
  contextSetMemoryEnabled: vi.fn(),
  contextDeleteMemory: vi.fn()
}))

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))

/**
 * Like the real transport, every payload is structured-cloned on its way out: Electron IPC throws
 * "An object could not be cloned" for a reactive Proxy, which a plain mock would happily accept.
 */
vi.mock('@talex-touch/utils/renderer', () => ({
  useIntelligenceSdk: () =>
    Object.fromEntries(
      Object.entries(aiClient).map(([name, fn]) => [
        name,
        (payload: unknown) => {
          structuredClone(payload)
          return fn(payload)
        }
      ])
    )
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() })
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key
  })
}))

vi.mock('vue-sonner', () => ({ toast }))

vi.mock('@talex-touch/tuffex/button', () => ({
  TxButton: {
    name: 'TxButton',
    props: ['disabled', 'loading'],
    template: '<button :disabled="disabled || loading"><slot /></button>'
  }
}))

vi.mock('@talex-touch/tuffex/scroll', () => ({
  TxScroll: {
    name: 'TxScroll',
    template: '<section><slot name="header" /><slot /><slot name="footer" /></section>'
  }
}))

vi.mock('@talex-touch/tuffex/empty-state', () => ({
  TxEmptyState: {
    name: 'TxEmptyState',
    props: ['title', 'description', 'variant', 'primaryAction'],
    emits: ['primary'],
    template:
      '<div :data-variant="variant"><p>{{ title }}</p><p>{{ description }}</p><button type="button" data-testid="memory-empty-create" @click="$emit(\'primary\')">{{ primaryAction?.label }}</button></div>'
  }
}))

/** Runs a row the way the real sheet does: a handler answering `true` closes it. */
vi.mock('@talex-touch/tuffex/dialog', () => ({
  TxBottomDialog: {
    name: 'TxBottomDialog',
    props: ['title', 'message', 'btns', 'close'],
    methods: {
      async run(button: { onClick: () => boolean | Promise<boolean> }) {
        if (await button.onClick()) (this as unknown as { close: () => void }).close()
      }
    },
    template:
      '<section role="dialog" data-testid="memory-delete-dialog"><h2>{{ title }}</h2><p>{{ message }}</p><button v-for="(button, index) in btns" :key="index" type="button" :data-testid="`memory-delete-dialog-button-${index}`" @click="run(button)">{{ button.content }}</button></section>'
  }
}))

function createMemory(overrides: Partial<MemoryItem> = {}): MemoryItem {
  return {
    id: 'mem_existing',
    type: 'preference',
    scope: 'workspace',
    content: 'Use Chinese replies',
    summary: 'Use Chinese replies',
    tags: ['language'],
    confidence: 0.9,
    sourceSessionId: 'session-1',
    sourceTurnId: 'turn-1',
    privacyLevel: 'normal',
    enabled: true,
    createdAt: 1,
    updatedAt: 2,
    lastUsedAt: 3,
    usageCount: 4,
    ...overrides
  }
}

function listResult(memories: MemoryItem[], hasMore = false) {
  return { memories, offset: 0, limit: 20, hasMore }
}

const SUGGESTED = {
  status: 'suggested' as const,
  reason: 'explicit_memory_candidate',
  fingerprint: 'f'.repeat(64),
  candidate: {
    type: 'preference' as const,
    scope: 'workspace' as const,
    summary: 'Use Chinese replies',
    tags: ['language'],
    confidence: 0.9,
    sourceSessionId: 'session-1',
    sourceTurnId: 'turn-1',
    privacyLevel: 'normal' as const
  }
}

let wrapper: VueWrapper | null = null

function mountPage() {
  wrapper = mount(IntelligenceMemoryPage, { attachTo: document.body })
  return wrapper
}

function rowOf(page: VueWrapper, id: string) {
  return page.get(`[data-testid="memory-row-${id}"]`)
}

function selectedRowIds(page: VueWrapper) {
  return page
    .findAll('[role="option"]')
    .filter((option) => option.attributes('aria-selected') === 'true')
    .map((option) => option.attributes('data-memory-id'))
}

/** The real TxSelect carrying this test id on its root. */
function findSelect(page: VueWrapper, testId: string) {
  const select = page
    .findAllComponents({ name: 'TuffSelect' })
    .find((candidate) => candidate.attributes('data-testid') === testId)
  if (!select) throw new Error(`no TxSelect with data-testid="${testId}"`)
  return select
}

/** Picks an option the way a pointer does: a click on the TxSelectItem in the select's panel. */
async function choose(page: VueWrapper, testId: string, value: string) {
  const item = findSelect(page, testId)
    .findAllComponents({ name: 'TuffSelectItem' })
    .find((candidate) => candidate.props('value') === value)
  if (!item) throw new Error(`no option "${value}" in ${testId}`)
  await item.trigger('click')
}

/** Clicks a segment of the status TxFlatRadio. */
async function chooseStatus(page: VueWrapper, value: string) {
  const item = page
    .get('[data-testid="memory-review-filter-status"]')
    .findAll('[role="radio"]')
    .find(
      (candidate) =>
        candidate.text() === `intelligence.memoryReview.${value === 'all' ? 'allStatuses' : value}`
    )
  if (!item) throw new Error(`no status segment "${value}"`)
  await item.trigger('click')
}

function listCalls() {
  return aiClient.contextListMemories.mock.calls.map(([input]) => input)
}

beforeEach(() => {
  // `resetAllMocks`, not `clearAllMocks`: a once-value a failed test left queued must not leak
  // into the next one.
  vi.resetAllMocks()
  aiClient.contextListMemories.mockResolvedValue(listResult([]))
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.useRealTimers()
})

describe('intelligenceMemoryPage shell', () => {
  it('renders master/detail: the list in the aside, the empty selection in the detail', async () => {
    aiClient.contextListMemories.mockResolvedValueOnce(listResult([createMemory()]))
    const page = mountPage()
    await flushPromises()

    expect(page.find('.SettingsPage-Split').exists()).toBe(true)
    expect(page.find('.SettingsPage-Column').exists()).toBe(false)

    const aside = page.get('.TuffAsideTemplate-Aside')
    const detail = page.get('.TuffAsideTemplate-Main')
    expect(aside.findComponent({ name: 'MemoryList' }).exists()).toBe(true)
    expect(aside.find('[data-testid="memory-new"]').exists()).toBe(true)
    expect(aside.find('[data-testid="memory-review-filter-status"]').exists()).toBe(true)

    const empty = detail.findComponent({ name: 'TxEmptyState' })
    expect(empty.exists()).toBe(true)
    expect(empty.props('variant')).toBe('no-selection')
    expect(empty.text()).toContain('intelligence.memoryReview.selectTitle')
    expect(detail.findComponent({ name: 'MemoryList' }).exists()).toBe(false)
  })

  it('loads the first page with every status, and shows source audit fields for a selection', async () => {
    aiClient.contextListMemories.mockResolvedValueOnce(listResult([createMemory()]))
    const page = mountPage()
    await flushPromises()

    expect(aiClient.contextListMemories).toHaveBeenCalledTimes(1)
    expect(aiClient.contextListMemories).toHaveBeenCalledWith({
      query: undefined,
      type: undefined,
      scope: undefined,
      status: 'all',
      offset: 0,
      limit: 20
    })

    await rowOf(page, 'mem_existing').trigger('click')

    const detail = page.get('[data-testid="memory-detail"]')
    expect(detail.text()).toContain('Use Chinese replies')
    expect(detail.text()).toContain('session-1')
    expect(detail.text()).toContain('turn-1')
    expect(selectedRowIds(page)).toEqual(['mem_existing'])
  })
})

describe('intelligenceMemoryPage server-side search and filters', () => {
  it('filters with TuffEx controls: two labelled selects and a labelled status segment', async () => {
    const page = mountPage()
    await flushPromises()

    const aside = page.get('.TuffAsideTemplate-Aside')
    expect(aside.find('select').exists()).toBe(false)
    for (const [testId, caption] of [
      ['memory-review-filter-type', 'intelligence.memoryReview.typeLabel'],
      ['memory-review-filter-scope', 'intelligence.memoryReview.scopeLabel']
    ] as const) {
      const select = findSelect(page, testId)
      // The combobox takes its accessible name from the wrapping label's hidden caption.
      const label = select.element.closest('label')
      expect(label?.querySelector('.sr-only')?.textContent?.trim()).toBe(caption)
      expect(label?.querySelector('input[role="combobox"]')).not.toBeNull()
    }
    const status = page.get('[data-testid="memory-review-filter-status"]')
    expect(status.attributes('role')).toBe('radiogroup')
    expect(status.attributes('aria-label')).toBe('intelligence.memoryReview.memoryStatus')
    expect(status.findAll('[role="radio"]').map((radio) => radio.text())).toEqual([
      'intelligence.memoryReview.allStatuses',
      'intelligence.memoryReview.enabled',
      'intelligence.memoryReview.disabled'
    ])
  })

  it('does not reload when the current filter value is picked again', async () => {
    const page = mountPage()
    await flushPromises()

    await choose(page, 'memory-review-filter-type', '')
    await choose(page, 'memory-review-filter-scope', '')
    await chooseStatus(page, 'all')
    await flushPromises()

    expect(aiClient.contextListMemories).toHaveBeenCalledTimes(1)
  })

  it('sends the search once typing pauses for 300 ms, and filters at once, from the first page', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    aiClient.contextListMemories.mockResolvedValue(listResult([createMemory()], true))
    const page = mountPage()
    await flushPromises()

    // Leave the first page so the reset to offset 0 is visible.
    await page.get('[data-testid="memory-review-page-next"]').trigger('click')
    await flushPromises()
    expect(listCalls().at(-1)).toMatchObject({ offset: 20 })
    const callsBeforeTyping = aiClient.contextListMemories.mock.calls.length

    const shell = page.findComponent({ name: 'SettingsPage' })
    shell.vm.$emit('update:search', 'lang')
    await nextTick()
    shell.vm.$emit('update:search', 'language')
    await nextTick()
    vi.advanceTimersByTime(299)
    await flushPromises()
    expect(aiClient.contextListMemories).toHaveBeenCalledTimes(callsBeforeTyping)

    vi.advanceTimersByTime(1)
    await flushPromises()
    expect(aiClient.contextListMemories).toHaveBeenCalledTimes(callsBeforeTyping + 1)
    expect(listCalls().at(-1)).toEqual({
      query: 'language',
      type: undefined,
      scope: undefined,
      status: 'all',
      offset: 0,
      limit: 20
    })

    await choose(page, 'memory-review-filter-type', 'preference')
    await choose(page, 'memory-review-filter-scope', 'workspace')
    await chooseStatus(page, 'disabled')
    await flushPromises()

    expect(listCalls().at(-1)).toEqual({
      query: 'language',
      type: 'preference',
      scope: 'workspace',
      status: 'disabled',
      offset: 0,
      limit: 20
    })
  })

  it('says nothing matched when filters are on, and that there is nothing yet when they are off', async () => {
    const page = mountPage()
    await flushPromises()
    expect(page.get('.memory-list [role="status"]').text()).toBe(
      'intelligence.memoryReview.savedEmpty'
    )

    await choose(page, 'memory-review-filter-scope', 'session')
    await flushPromises()
    expect(page.get('.memory-list [role="status"]').text()).toBe(
      'intelligence.memoryReview.noMatches'
    )
  })

  it('pages through the server list', async () => {
    aiClient.contextListMemories.mockResolvedValue(listResult([createMemory()], true))
    const page = mountPage()
    await flushPromises()

    await page.get('[data-testid="memory-review-page-next"]').trigger('click')
    await flushPromises()
    expect(listCalls().at(-1)).toMatchObject({ offset: 20, limit: 20 })
    expect(page.text()).toContain('intelligence.memoryReview.page:{"page":2}')

    await page.get('[data-testid="memory-review-page-previous"]').trigger('click')
    await flushPromises()
    expect(listCalls().at(-1)).toMatchObject({ offset: 0, limit: 20 })
  })
})

describe('intelligenceMemoryPage editing', () => {
  it('creates a global memory after evaluation, reloads the list and selects the new memory', async () => {
    const created = createMemory({
      id: 'mem_1',
      scope: 'global',
      content: '老板喜欢中文回复',
      summary: 'Prefers Simplified Chinese replies',
      sourceSessionId: undefined,
      sourceTurnId: undefined
    })
    aiClient.contextEvaluateMemory.mockResolvedValueOnce({
      ...SUGGESTED,
      candidate: {
        ...SUGGESTED.candidate,
        scope: 'global',
        summary: 'Prefers Simplified Chinese replies',
        sourceSessionId: undefined,
        sourceTurnId: undefined
      }
    })
    aiClient.contextSaveMemory.mockResolvedValueOnce(created)
    const page = mountPage()
    await flushPromises()

    await page.get('[data-testid="memory-new"]').trigger('click')
    expect(findSelect(page, 'memory-review-scope').props('modelValue')).toBe('global')

    aiClient.contextListMemories.mockResolvedValueOnce(listResult([created]))
    await page.get('[data-testid="memory-review-content"]').setValue('老板喜欢中文回复')
    await page.get('[data-testid="memory-review-evaluate"]').trigger('click')
    await flushPromises()
    expect(aiClient.contextEvaluateMemory).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'preference', scope: 'global' })
    )
    await page.get('[data-testid="memory-review-save"]').trigger('click')
    await flushPromises()

    expect(aiClient.contextSaveMemory).toHaveBeenCalledTimes(1)
    expect(aiClient.contextListMemories).toHaveBeenCalledTimes(2)
    expect(listCalls().at(-1)).toMatchObject({ offset: 0 })
    expect(page.find('[data-testid="memory-editor"]').exists()).toBe(false)
    expect(selectedRowIds(page)).toEqual(['mem_1'])
    expect(page.get('[data-testid="memory-detail"]').text()).toContain('mem_1')
  })

  it('selects the replacement’s new id after an atomic replace', async () => {
    const original = createMemory()
    const replacement = createMemory({
      id: 'mem_replacement',
      content: 'Use concise Chinese replies',
      summary: 'Concise Chinese',
      replacesMemoryId: original.id,
      updatedAt: 5
    })
    aiClient.contextListMemories.mockResolvedValueOnce(listResult([original]))
    aiClient.contextEvaluateMemory.mockResolvedValueOnce({
      ...SUGGESTED,
      candidate: { ...SUGGESTED.candidate, summary: 'Concise Chinese' }
    })
    aiClient.contextReplaceMemory.mockResolvedValueOnce({
      memory: replacement,
      tombstone: { id: 'memdel_1', memoryId: original.id, reason: 'replaced', createdAt: 5 }
    })
    const page = mountPage()
    await flushPromises()

    await rowOf(page, 'mem_existing').trigger('click')
    await page.get('[data-testid="memory-review-edit-mem_existing"]').trigger('click')
    await page.get('[data-testid="memory-review-content"]').setValue('Use concise Chinese replies')
    await page.get('[data-testid="memory-review-evaluate"]').trigger('click')
    await flushPromises()

    aiClient.contextListMemories.mockResolvedValueOnce(listResult([replacement]))
    await page.get('[data-testid="memory-review-save"]').trigger('click')
    await flushPromises()

    expect(aiClient.contextReplaceMemory).toHaveBeenCalledWith(
      expect.objectContaining({ memoryId: 'mem_existing', expectedUpdatedAt: 2 })
    )
    expect(aiClient.contextListMemories).toHaveBeenCalledTimes(2)
    expect(selectedRowIds(page)).toEqual(['mem_replacement'])
    const detail = page.get('[data-testid="memory-detail"]')
    expect(detail.text()).toContain('mem_replacement')
    expect(detail.text()).toContain('intelligence.memoryReview.replacesMemory')
  })

  it('reloads after a replace conflict, keeps the memory selected and re-bases the open draft', async () => {
    aiClient.contextListMemories.mockResolvedValueOnce(listResult([createMemory()]))
    aiClient.contextEvaluateMemory.mockResolvedValue(SUGGESTED)
    aiClient.contextReplaceMemory.mockRejectedValueOnce(new Error('MEMORY_REPLACE_CONFLICT'))
    const page = mountPage()
    await flushPromises()

    await rowOf(page, 'mem_existing').trigger('click')
    await page.get('[data-testid="memory-review-edit-mem_existing"]').trigger('click')
    await page.get('[data-testid="memory-review-evaluate"]').trigger('click')
    await flushPromises()

    aiClient.contextListMemories.mockResolvedValueOnce(listResult([createMemory({ updatedAt: 9 })]))
    await page.get('[data-testid="memory-review-save"]').trigger('click')
    await flushPromises()

    expect(page.text()).toContain('intelligence.memoryReview.replaceConflict')
    expect(aiClient.contextListMemories).toHaveBeenCalledTimes(2)
    expect(selectedRowIds(page)).toEqual(['mem_existing'])
    expect(page.find('[data-testid="memory-review-editing"]').exists()).toBe(true)
    expect(page.find('[data-testid="memory-review-save"]').exists()).toBe(false)

    aiClient.contextReplaceMemory.mockResolvedValueOnce({
      memory: createMemory({ id: 'mem_after', updatedAt: 10, replacesMemoryId: 'mem_existing' }),
      tombstone: { id: 'memdel_2', memoryId: 'mem_existing', reason: 'replaced', createdAt: 10 }
    })
    await page.get('[data-testid="memory-review-evaluate"]').trigger('click')
    await flushPromises()
    await page.get('[data-testid="memory-review-save"]').trigger('click')
    await flushPromises()

    expect(aiClient.contextReplaceMemory).toHaveBeenLastCalledWith(
      expect.objectContaining({ memoryId: 'mem_existing', expectedUpdatedAt: 9 })
    )
  })

  it('closes the editor on whatever replaced the memory when the conflict reload no longer has it', async () => {
    aiClient.contextListMemories.mockResolvedValueOnce(listResult([createMemory()]))
    aiClient.contextEvaluateMemory.mockResolvedValue(SUGGESTED)
    aiClient.contextReplaceMemory.mockRejectedValueOnce(new Error('MEMORY_REPLACE_CONFLICT'))
    const page = mountPage()
    await flushPromises()

    await rowOf(page, 'mem_existing').trigger('click')
    await page.get('[data-testid="memory-review-edit-mem_existing"]').trigger('click')
    await page.get('[data-testid="memory-review-evaluate"]').trigger('click')
    await flushPromises()

    aiClient.contextListMemories.mockResolvedValueOnce(
      listResult([createMemory({ id: 'mem_newer', replacesMemoryId: 'mem_existing' })])
    )
    await page.get('[data-testid="memory-review-save"]').trigger('click')
    await flushPromises()

    expect(page.find('[data-testid="memory-editor"]').exists()).toBe(false)
    expect(selectedRowIds(page)).toEqual(['mem_newer'])
  })

  it('returns to the selection when creating is cancelled', async () => {
    aiClient.contextListMemories.mockResolvedValueOnce(listResult([createMemory()]))
    const page = mountPage()
    await flushPromises()

    await rowOf(page, 'mem_existing').trigger('click')
    await page.get('[data-testid="memory-new"]').trigger('click')
    // The editor is not editing the selected row, so the row is not shown as selected meanwhile.
    expect(selectedRowIds(page)).toEqual([])

    await page.get('[data-testid="memory-review-cancel-edit"]').trigger('click')
    expect(selectedRowIds(page)).toEqual(['mem_existing'])
    expect(page.find('[data-testid="memory-detail"]').exists()).toBe(true)
  })

  it('opens the editor from the empty selection', async () => {
    const page = mountPage()
    await flushPromises()

    await page.get('[data-testid="memory-empty-create"]').trigger('click')

    expect(page.find('[data-testid="memory-editor"]').exists()).toBe(true)
  })
})

describe('intelligenceMemoryPage enable and delete', () => {
  it('toggles the selected memory in place, without reloading or reordering the list', async () => {
    aiClient.contextListMemories.mockResolvedValueOnce(
      listResult([
        createMemory({ id: 'mem_toggle', content: 'Use concise replies' }),
        createMemory({ id: 'mem_other', updatedAt: 1 })
      ])
    )
    aiClient.contextSetMemoryEnabled.mockResolvedValueOnce({
      memoryId: 'mem_toggle',
      enabled: false,
      updatedAt: 30
    })
    const page = mountPage()
    await flushPromises()

    await rowOf(page, 'mem_toggle').trigger('click')
    await page.get('[data-testid="memory-review-toggle-mem_toggle"]').trigger('click')
    await flushPromises()

    expect(aiClient.contextSetMemoryEnabled).toHaveBeenCalledWith({
      memoryId: 'mem_toggle',
      enabled: false
    })
    expect(aiClient.contextListMemories).toHaveBeenCalledTimes(1)
    expect(page.findAll('[role="option"]').map((row) => row.attributes('data-memory-id'))).toEqual([
      'mem_toggle',
      'mem_other'
    ])
    expect(rowOf(page, 'mem_toggle').text()).toContain('intelligence.memoryReview.disabled')
    expect(page.find('[data-testid="memory-detail-disabled"]').exists()).toBe(true)
    expect(toast.success).toHaveBeenCalledWith('intelligence.memoryReview.disableSuccess')
  })

  it('asks before deleting, tombstones on confirm, says what deleting means and selects the next memory', async () => {
    aiClient.contextListMemories.mockResolvedValueOnce(
      listResult([
        createMemory({ id: 'mem_a', summary: 'A' }),
        createMemory({ id: 'mem_b', summary: 'B' }),
        createMemory({ id: 'mem_c', summary: 'C' })
      ])
    )
    aiClient.contextDeleteMemory.mockResolvedValueOnce({
      id: 'memdel_1',
      memoryId: 'mem_b',
      reason: 'user-memory-review-delete',
      createdAt: 3
    })
    const page = mountPage()
    await flushPromises()

    await rowOf(page, 'mem_b').trigger('click')
    await page.get('[data-testid="memory-review-delete-mem_b"]').trigger('click')

    const dialog = page.get('[data-testid="memory-delete-dialog"]')
    expect(dialog.text()).toContain('intelligence.memoryReview.deleteConfirmTitle')
    expect(dialog.text()).toContain('intelligence.memoryReview.deleteConfirmMessage')
    expect(aiClient.contextDeleteMemory).not.toHaveBeenCalled()

    await page.get('[data-testid="memory-delete-dialog-button-1"]').trigger('click')
    await flushPromises()

    expect(aiClient.contextDeleteMemory).toHaveBeenCalledWith({
      memoryId: 'mem_b',
      reason: 'user-memory-review-delete'
    })
    expect(toast.success).toHaveBeenCalledWith('intelligence.memoryReview.deleteSuccess')
    expect(page.find('[data-testid="memory-delete-dialog"]').exists()).toBe(false)
    expect(page.find('[data-testid="memory-row-mem_b"]').exists()).toBe(false)
    expect(selectedRowIds(page)).toEqual(['mem_c'])
    expect(page.get('[data-testid="memory-detail"]').text()).toContain('mem_c')
  })

  it('selects the new last memory after deleting the last one', async () => {
    aiClient.contextListMemories.mockResolvedValueOnce(
      listResult([createMemory({ id: 'mem_a' }), createMemory({ id: 'mem_b' })])
    )
    aiClient.contextDeleteMemory.mockResolvedValueOnce({})
    const page = mountPage()
    await flushPromises()

    await rowOf(page, 'mem_b').trigger('click')
    await page.get('[data-testid="memory-review-delete-mem_b"]').trigger('click')
    await page.get('[data-testid="memory-delete-dialog-button-1"]').trigger('click')
    await flushPromises()

    expect(selectedRowIds(page)).toEqual(['mem_a'])
  })

  it('deletes nothing when the confirmation is cancelled', async () => {
    aiClient.contextListMemories.mockResolvedValueOnce(listResult([createMemory()]))
    const page = mountPage()
    await flushPromises()

    await rowOf(page, 'mem_existing').trigger('click')
    await page.get('[data-testid="memory-review-delete-mem_existing"]').trigger('click')
    await page.get('[data-testid="memory-delete-dialog-button-0"]').trigger('click')
    await flushPromises()

    expect(aiClient.contextDeleteMemory).not.toHaveBeenCalled()
    expect(page.find('[data-testid="memory-delete-dialog"]').exists()).toBe(false)
    expect(selectedRowIds(page)).toEqual(['mem_existing'])
  })

  it('keeps the memory and reports the failure when the tombstone cannot be written', async () => {
    aiClient.contextListMemories.mockResolvedValueOnce(listResult([createMemory()]))
    aiClient.contextDeleteMemory.mockRejectedValueOnce(new Error('boom'))
    const page = mountPage()
    await flushPromises()

    await rowOf(page, 'mem_existing').trigger('click')
    await page.get('[data-testid="memory-review-delete-mem_existing"]').trigger('click')
    await page.get('[data-testid="memory-delete-dialog-button-1"]').trigger('click')
    await flushPromises()

    expect(toast.error).toHaveBeenCalledWith('intelligence.memoryReview.deleteFailed')
    expect(selectedRowIds(page)).toEqual(['mem_existing'])
  })
})

describe('intelligenceMemoryPage lifecycle', () => {
  /** The settings router view caches pages in KeepAlive; leaving and coming back re-activates. */
  function mountCached() {
    const showPage = ref(true)
    /** Whatever the user went to instead; functional, so only the memory page is cached. */
    const elsewhere = () => h('p', 'elsewhere')
    wrapper = mount(
      {
        setup: () => () =>
          h(KeepAlive, null, [showPage.value ? h(IntelligenceMemoryPage) : h(elsewhere)])
      },
      { attachTo: document.body }
    )
    return { host: wrapper, showPage }
  }

  it('refreshes the list when the cached page is shown again, keeping rows and selection', async () => {
    aiClient.contextListMemories.mockResolvedValueOnce(
      listResult([createMemory({ id: 'mem_kept' })])
    )
    const { host, showPage } = mountCached()
    await flushPromises()
    // The activation that comes with the mount does not load a second time.
    expect(aiClient.contextListMemories).toHaveBeenCalledTimes(1)
    await rowOf(host, 'mem_kept').trigger('click')

    showPage.value = false
    await flushPromises()
    aiClient.contextListMemories.mockResolvedValueOnce(
      listResult([createMemory({ id: 'mem_new', updatedAt: 9 }), createMemory({ id: 'mem_kept' })])
    )
    showPage.value = true
    await nextTick()

    // Back on screen: the old rows stay up while the reload runs — no skeleton.
    expect(host.find('[data-testid="memory-list-skeleton"]').exists()).toBe(false)
    expect(host.find('[data-testid="memory-row-mem_kept"]').exists()).toBe(true)

    await flushPromises()
    expect(aiClient.contextListMemories).toHaveBeenCalledTimes(2)
    expect(host.find('[data-testid="memory-row-mem_new"]').exists()).toBe(true)
    expect(selectedRowIds(host)).toEqual(['mem_kept'])
  })

  it('shows a failed first load with a retry instead of an empty list', async () => {
    aiClient.contextListMemories.mockRejectedValueOnce(new Error('offline'))
    const page = mountPage()
    await flushPromises()

    expect(page.get('.memory-list [role="alert"]').text()).toContain(
      'intelligence.memoryReview.loadFailed'
    )
    expect(toast.error).toHaveBeenCalledWith('intelligence.memoryReview.loadFailed')

    aiClient.contextListMemories.mockResolvedValueOnce(listResult([createMemory()]))
    await page.get('[data-testid="memory-list-retry"]').trigger('click')
    await flushPromises()

    expect(page.find('.memory-list [role="alert"]').exists()).toBe(false)
    expect(page.find('[data-testid="memory-row-mem_existing"]').exists()).toBe(true)
  })
})

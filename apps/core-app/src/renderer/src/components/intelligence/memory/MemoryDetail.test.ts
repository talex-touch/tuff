// @vitest-environment jsdom
import type { MemoryItem } from '@talex-touch/tuff-intelligence'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import MemoryDetail from './MemoryDetail.vue'

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

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key
  })
}))

function createMemory(overrides: Partial<MemoryItem> = {}): MemoryItem {
  return {
    id: 'mem_existing',
    type: 'preference',
    scope: 'global',
    content: 'Always reply in Simplified Chinese,\nexcept for code.',
    summary: 'Reply in Simplified Chinese',
    tags: ['language', 'style'],
    confidence: 0.9,
    sourceSessionId: 'session-1',
    sourceTurnId: 'turn-1',
    privacyLevel: 'normal',
    enabled: true,
    createdAt: Date.UTC(2026, 9, 1, 8, 0),
    updatedAt: Date.UTC(2026, 9, 2, 8, 0),
    lastUsedAt: Date.UTC(2026, 9, 2, 9, 0),
    usageCount: 7,
    ...overrides
  }
}

function mountDetail(memory: MemoryItem, props: Record<string, unknown> = {}) {
  return mount(MemoryDetail, { props: { memory, ...props } })
}

describe('memoryDetail content', () => {
  it('shows the full content, and the summary a reply actually receives', () => {
    const wrapper = mountDetail(createMemory())

    expect(wrapper.text()).toContain('Always reply in Simplified Chinese,\nexcept for code.')
    const injection = wrapper.get('[data-testid="memory-detail-injection"]')
    expect(injection.text()).toContain('intelligence.memoryReview.injection.summary')
    expect(injection.get('blockquote').text()).toBe('Reply in Simplified Chinese')
  })

  it('lists the source and audit fields, including what this memory replaced', () => {
    const wrapper = mountDetail(createMemory({ replacesMemoryId: 'mem_previous' }))
    const text = wrapper.text()

    expect(text).toContain('mem_existing')
    expect(text).toContain('language, style')
    expect(text).toContain('90%')
    expect(text).toContain('session-1')
    expect(text).toContain('turn-1')
    expect(text).toContain('normal')
    expect(text).toContain('intelligence.memoryReview.replacesMemory')
    expect(text).toContain('mem_previous')
  })

  it('leaves out usage count and last-used time, which nothing ever writes', () => {
    const wrapper = mountDetail(createMemory({ usageCount: 4242 }))

    expect(wrapper.text()).not.toContain('intelligence.memoryReview.usageCount')
    expect(wrapper.text()).not.toContain('intelligence.memoryReview.lastUsedAt')
    expect(wrapper.text()).not.toContain('4242')
  })

  it('falls back to "not available" for a hand-made memory without source or tags', () => {
    const wrapper = mountDetail(
      createMemory({ sourceSessionId: undefined, sourceTurnId: undefined, tags: [] })
    )

    expect(
      wrapper.text().split('intelligence.memoryReview.notAvailable').length - 1
    ).toBeGreaterThanOrEqual(3)
  })
})

describe('memoryDetail scope effect', () => {
  const note = (wrapper: ReturnType<typeof mountDetail>) =>
    wrapper.get('[data-testid="memory-detail-scope-note"]').text()
  const marker = (wrapper: ReturnType<typeof mountDetail>) =>
    wrapper.find('[data-testid="memory-detail-effect"]')

  it('explains a global memory as used by any conversation, with no marker', () => {
    const wrapper = mountDetail(createMemory({ scope: 'global' }))

    expect(note(wrapper)).toBe('intelligence.memoryReview.injection.global')
    expect(marker(wrapper).exists()).toBe(false)
  })

  it('names the source session of a session memory that has one', () => {
    const wrapper = mountDetail(createMemory({ scope: 'session', sourceSessionId: 'session-9' }))

    expect(note(wrapper)).toBe(
      'intelligence.memoryReview.injection.sourceSession:{"session":"session-9"}'
    )
    expect(marker(wrapper).text()).toBe('intelligence.memoryReview.effect.sourceSessionOnly')
  })

  it('marks a session memory without a source session as not in effect', () => {
    const wrapper = mountDetail(createMemory({ scope: 'session', sourceSessionId: undefined }))

    expect(note(wrapper)).toBe('intelligence.memoryReview.injection.sessionWithoutSource')
    expect(marker(wrapper).text()).toBe('intelligence.memoryReview.effect.inactive')
  })

  it.each(['workspace', 'project'] as const)(
    'marks a %s memory as not in effect, naming its scope',
    (scope) => {
      const wrapper = mountDetail(createMemory({ scope }))

      expect(note(wrapper)).toBe(
        `intelligence.memoryReview.injection.pendingScope:{"scope":"intelligence.memoryReview.scopes.${scope}"}`
      )
      expect(marker(wrapper).text()).toBe('intelligence.memoryReview.effect.inactive')
    }
  )

  it('says a disabled memory is not used until it is enabled again', () => {
    const wrapper = mountDetail(createMemory({ enabled: false }))

    expect(wrapper.get('[data-testid="memory-detail-disabled"]').text()).toBe(
      'intelligence.memoryReview.disabled'
    )
    expect(wrapper.get('[data-testid="memory-detail-disabled-note"]').text()).toBe(
      'intelligence.memoryReview.injection.disabled'
    )
    expect(wrapper.get('[data-testid="memory-review-toggle-mem_existing"]').text()).toContain(
      'intelligence.memoryReview.enable'
    )
  })
})

describe('memoryDetail actions', () => {
  it('asks the page to edit, toggle or delete this memory', async () => {
    const wrapper = mountDetail(createMemory())

    expect(wrapper.get('[data-testid="memory-review-toggle-mem_existing"]').text()).toContain(
      'intelligence.memoryReview.disable'
    )
    await wrapper.get('[data-testid="memory-review-edit-mem_existing"]').trigger('click')
    await wrapper.get('[data-testid="memory-review-toggle-mem_existing"]').trigger('click')
    await wrapper.get('[data-testid="memory-review-delete-mem_existing"]').trigger('click')

    expect(wrapper.emitted('edit')).toHaveLength(1)
    expect(wrapper.emitted('toggle')).toHaveLength(1)
    expect(wrapper.emitted('delete')).toHaveLength(1)
  })

  it.each([{ toggling: true }, { deleting: true }])(
    'holds every action while a request for it is in flight (%o)',
    async (state) => {
      const wrapper = mountDetail(createMemory(), state)

      for (const action of ['edit', 'toggle', 'delete']) {
        const button = wrapper.get(`[data-testid="memory-review-${action}-mem_existing"]`)
        expect(button.attributes()).toHaveProperty('disabled')
        await button.trigger('click')
      }
      expect(wrapper.emitted('edit')).toBeUndefined()
      expect(wrapper.emitted('toggle')).toBeUndefined()
      expect(wrapper.emitted('delete')).toBeUndefined()
    }
  )
})

// @vitest-environment jsdom
import type { MemoryItem } from '@talex-touch/tuff-intelligence'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import IntelligenceMemoryReview from './IntelligenceMemoryReview.vue'

const aiClient = vi.hoisted(() => ({
  contextEvaluateMemory: vi.fn(),
  contextSaveMemory: vi.fn(),
  contextReplaceMemory: vi.fn(),
  contextListMemories: vi.fn(),
  contextSetMemoryEnabled: vi.fn(),
  contextDeleteMemory: vi.fn()
}))

vi.mock('@talex-touch/utils/renderer', () => ({
  useIntelligenceSdk: () => aiClient
}))

vi.mock('@talex-touch/tuffex/button', () => ({
  TxButton: {
    name: 'TxButton',
    props: ['disabled', 'loading'],
    template: '<button :disabled="disabled || loading"><slot /></button>'
  }
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key
  })
}))

vi.mock('vue-sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn()
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

function emptyListResult() {
  return { memories: [], offset: 0, limit: 20, hasMore: false }
}

function mountMemoryReview() {
  return mount(IntelligenceMemoryReview)
}

describe('intelligenceMemoryReview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    aiClient.contextListMemories.mockResolvedValue(emptyListResult())
  })

  it('evaluates a candidate before explicit save', async () => {
    aiClient.contextEvaluateMemory.mockResolvedValueOnce({
      status: 'suggested',
      reason: 'explicit_memory_candidate',
      fingerprint: 'a'.repeat(64),
      candidate: {
        type: 'preference',
        scope: 'global',
        summary: 'Prefers Simplified Chinese replies',
        tags: ['language'],
        confidence: 0.9,
        privacyLevel: 'normal'
      }
    })
    aiClient.contextSaveMemory.mockResolvedValueOnce(
      createMemory({
        id: 'mem_1',
        scope: 'global',
        content: '老板喜欢中文回复',
        summary: 'Prefers Simplified Chinese replies',
        updatedAt: 1
      })
    )

    const wrapper = mountMemoryReview()
    await wrapper.get('[data-testid="memory-review-content"]').setValue('  老板喜欢中文回复  ')
    await wrapper.get('[data-testid="memory-review-evaluate"]').trigger('click')
    await flushPromises()

    expect(aiClient.contextEvaluateMemory).toHaveBeenCalledWith({
      content: '老板喜欢中文回复',
      type: 'temporary',
      scope: 'session',
      summary: undefined,
      tags: undefined,
      confidence: undefined,
      sourceSessionId: undefined,
      sourceTurnId: undefined,
      privacyLevel: undefined,
      ttl: undefined
    })
    expect(aiClient.contextSaveMemory).not.toHaveBeenCalled()

    await wrapper.get('[data-testid="memory-review-save"]').trigger('click')
    await flushPromises()

    expect(aiClient.contextSaveMemory).toHaveBeenCalledWith({
      type: 'preference',
      scope: 'global',
      content: '老板喜欢中文回复',
      summary: 'Prefers Simplified Chinese replies',
      tags: ['language'],
      confidence: 0.9,
      sourceSessionId: undefined,
      sourceTurnId: undefined,
      privacyLevel: 'normal',
      ttl: undefined,
      enabled: true
    })
    expect(aiClient.contextListMemories).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('mem_1')
  })

  it.each(['rejected', 'needs_review'] as const)(
    'does not expose save for %s results',
    async (status) => {
      aiClient.contextEvaluateMemory.mockResolvedValueOnce({
        status,
        reason: status === 'rejected' ? 'secret_detected' : 'sensitive_content'
      })

      const wrapper = mountMemoryReview()
      await wrapper.get('[data-testid="memory-review-content"]').setValue('candidate')
      await wrapper.get('[data-testid="memory-review-evaluate"]').trigger('click')
      await flushPromises()

      expect(wrapper.find('[data-testid="memory-review-save"]').exists()).toBe(false)
      expect(aiClient.contextSaveMemory).not.toHaveBeenCalled()
      expect(aiClient.contextReplaceMemory).not.toHaveBeenCalled()
    }
  )

  it.each([
    ['memory-review-content', 'changed candidate'],
    ['memory-review-summary', 'changed summary'],
    ['memory-review-tags', 'changed, tags'],
    ['memory-review-type', 'project'],
    ['memory-review-scope', 'workspace']
  ])('invalidates evaluation when %s changes', async (testId, value) => {
    aiClient.contextEvaluateMemory.mockResolvedValueOnce({
      status: 'suggested',
      reason: 'explicit_memory_candidate',
      fingerprint: 'b'.repeat(64),
      candidate: {
        type: 'temporary',
        scope: 'session',
        summary: 'Original candidate',
        tags: [],
        confidence: 1,
        privacyLevel: 'normal'
      }
    })

    const wrapper = mountMemoryReview()
    await wrapper.get('[data-testid="memory-review-content"]').setValue('original candidate')
    await wrapper.get('[data-testid="memory-review-evaluate"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="memory-review-save"]').exists()).toBe(true)

    await wrapper.get(`[data-testid="${testId}"]`).setValue(value)

    expect(wrapper.find('[data-testid="memory-review-save"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('intelligence.memoryReview.evaluationInvalidated')
    expect(aiClient.contextSaveMemory).not.toHaveBeenCalled()
  })

  it('loads source audit fields and tombstones a memory from the review panel', async () => {
    aiClient.contextListMemories.mockResolvedValueOnce({
      memories: [createMemory()],
      offset: 0,
      limit: 20,
      hasMore: false
    })
    aiClient.contextDeleteMemory.mockResolvedValueOnce({
      id: 'memdel_1',
      memoryId: 'mem_existing',
      reason: 'user-memory-review-delete',
      createdAt: 3
    })

    const wrapper = mountMemoryReview()
    await flushPromises()

    expect(aiClient.contextListMemories).toHaveBeenCalledWith({
      query: undefined,
      type: undefined,
      scope: undefined,
      status: 'all',
      offset: 0,
      limit: 20
    })
    expect(wrapper.text()).toContain('Use Chinese replies')
    expect(wrapper.text()).toContain('session-1')
    expect(wrapper.text()).toContain('turn-1')

    await wrapper.get('[data-testid="memory-review-delete-mem_existing"]').trigger('click')
    await flushPromises()

    expect(aiClient.contextDeleteMemory).toHaveBeenCalledWith({
      memoryId: 'mem_existing',
      reason: 'user-memory-review-delete'
    })
    expect(wrapper.text()).not.toContain('Use Chinese replies')
  })

  it('applies server-owned search and status filters', async () => {
    const wrapper = mountMemoryReview()
    await flushPromises()
    aiClient.contextListMemories.mockResolvedValueOnce(emptyListResult())

    await wrapper.get('[data-testid="memory-review-search"]').setValue('language')
    await wrapper.get('[data-testid="memory-review-filter-type"]').setValue('preference')
    await wrapper.get('[data-testid="memory-review-filter-scope"]').setValue('workspace')
    await wrapper.get('[data-testid="memory-review-filter-status"]').setValue('disabled')
    await wrapper.get('[data-testid="memory-review-apply-filters"]').trigger('click')
    await flushPromises()

    expect(aiClient.contextListMemories).toHaveBeenLastCalledWith({
      query: 'language',
      type: 'preference',
      scope: 'workspace',
      status: 'disabled',
      offset: 0,
      limit: 20
    })
  })

  it('atomically replaces an edited memory and blocks duplicate confirmation', async () => {
    const original = createMemory()
    const replacement = createMemory({
      id: 'mem_replacement',
      content: 'Use concise Chinese replies',
      summary: 'Concise Chinese',
      tags: ['language', 'concise'],
      replacesMemoryId: original.id,
      updatedAt: 5
    })
    aiClient.contextListMemories.mockResolvedValueOnce({
      memories: [original],
      offset: 0,
      limit: 20,
      hasMore: false
    })
    aiClient.contextEvaluateMemory.mockResolvedValueOnce({
      status: 'suggested',
      reason: 'explicit_memory_candidate',
      fingerprint: 'c'.repeat(64),
      candidate: {
        type: 'preference',
        scope: 'workspace',
        summary: 'Concise Chinese',
        tags: ['language', 'concise'],
        confidence: 0.9,
        sourceSessionId: 'session-1',
        sourceTurnId: 'turn-1',
        privacyLevel: 'normal'
      }
    })
    let resolveReplacement!: (value: { memory: MemoryItem; tombstone: object }) => void
    const replacementPromise = new Promise<{ memory: MemoryItem; tombstone: object }>((resolve) => {
      resolveReplacement = resolve
    })
    aiClient.contextReplaceMemory.mockReturnValueOnce(replacementPromise)

    const wrapper = mountMemoryReview()
    await flushPromises()
    await wrapper.get('[data-testid="memory-review-edit-mem_existing"]').trigger('click')
    await wrapper
      .get('[data-testid="memory-review-content"]')
      .setValue('Use concise Chinese replies')
    await wrapper.get('[data-testid="memory-review-summary"]').setValue('Concise Chinese')
    await wrapper.get('[data-testid="memory-review-tags"]').setValue('language, concise')
    await wrapper.get('[data-testid="memory-review-evaluate"]').trigger('click')
    await flushPromises()

    const saveButton = wrapper.get('[data-testid="memory-review-save"]')
    await saveButton.trigger('click')
    await saveButton.trigger('click')
    expect(aiClient.contextReplaceMemory).toHaveBeenCalledTimes(1)
    expect(aiClient.contextReplaceMemory).toHaveBeenCalledWith({
      memoryId: 'mem_existing',
      expectedUpdatedAt: 2,
      evaluationFingerprint: 'c'.repeat(64),
      replacement: {
        type: 'preference',
        scope: 'workspace',
        content: 'Use concise Chinese replies',
        summary: 'Concise Chinese',
        tags: ['language', 'concise'],
        confidence: 0.9,
        sourceSessionId: 'session-1',
        sourceTurnId: 'turn-1',
        privacyLevel: 'normal',
        ttl: undefined,
        enabled: true
      }
    })

    resolveReplacement({
      memory: replacement,
      tombstone: { id: 'memdel_1', memoryId: original.id }
    })
    await flushPromises()
    expect(wrapper.text()).toContain('mem_replacement')
  })

  it('refreshes the list when replacement detects a concurrent edit', async () => {
    aiClient.contextListMemories.mockResolvedValueOnce({
      memories: [createMemory()],
      offset: 0,
      limit: 20,
      hasMore: false
    })
    aiClient.contextEvaluateMemory.mockResolvedValueOnce({
      status: 'suggested',
      reason: 'explicit_memory_candidate',
      fingerprint: 'd'.repeat(64),
      candidate: {
        type: 'preference',
        scope: 'workspace',
        summary: 'Use Chinese replies',
        tags: ['language'],
        confidence: 0.9,
        sourceSessionId: 'session-1',
        sourceTurnId: 'turn-1',
        privacyLevel: 'normal'
      }
    })
    aiClient.contextReplaceMemory.mockRejectedValueOnce(new Error('MEMORY_REPLACE_CONFLICT'))

    const wrapper = mountMemoryReview()
    await flushPromises()
    await wrapper.get('[data-testid="memory-review-edit-mem_existing"]').trigger('click')
    await wrapper.get('[data-testid="memory-review-evaluate"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="memory-review-save"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('intelligence.memoryReview.replaceConflict')
    expect(aiClient.contextListMemories).toHaveBeenCalledTimes(2)
  })

  it('toggles saved memory enabled state through typed sdk', async () => {
    aiClient.contextListMemories.mockResolvedValueOnce({
      memories: [createMemory({ id: 'mem_toggle', content: 'Use concise replies' })],
      offset: 0,
      limit: 20,
      hasMore: false
    })
    aiClient.contextSetMemoryEnabled.mockResolvedValueOnce({
      memoryId: 'mem_toggle',
      enabled: false,
      updatedAt: 3
    })

    const wrapper = mountMemoryReview()
    await flushPromises()
    await wrapper.get('[data-testid="memory-review-toggle-mem_toggle"]').trigger('click')
    await flushPromises()

    expect(aiClient.contextSetMemoryEnabled).toHaveBeenCalledWith({
      memoryId: 'mem_toggle',
      enabled: false
    })
    expect(wrapper.text()).toContain('intelligence.memoryReview.disabled')
  })
})

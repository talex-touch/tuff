// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import IntelligenceMemoryReview from './IntelligenceMemoryReview.vue'

const aiClient = vi.hoisted(() => ({
  contextEvaluateMemory: vi.fn(),
  contextSaveMemory: vi.fn(),
  contextListMemories: vi.fn(),
  contextSetMemoryEnabled: vi.fn(),
  contextDeleteMemory: vi.fn()
}))

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({})
}))

vi.mock('@talex-touch/tuff-intelligence', () => ({
  createIntelligenceClient: () => aiClient
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

function mountMemoryReview() {
  return mount(IntelligenceMemoryReview)
}

describe('IntelligenceMemoryReview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    aiClient.contextListMemories.mockResolvedValue({ memories: [] })
  })

  it('evaluates a candidate before explicit save', async () => {
    aiClient.contextEvaluateMemory.mockResolvedValueOnce({
      status: 'suggested',
      reason: 'explicit_memory_candidate',
      candidate: {
        type: 'preference',
        scope: 'global',
        summary: 'Prefers Simplified Chinese replies',
        tags: ['language'],
        confidence: 0.9,
        privacyLevel: 'normal'
      }
    })
    aiClient.contextSaveMemory.mockResolvedValueOnce({
      id: 'mem_1',
      type: 'preference',
      scope: 'global',
      content: '老板喜欢中文回复',
      summary: 'Prefers Simplified Chinese replies',
      tags: ['language'],
      confidence: 0.9,
      privacyLevel: 'normal',
      enabled: true,
      createdAt: 1,
      updatedAt: 1,
      usageCount: 0
    })

    const wrapper = mountMemoryReview()
    await wrapper.get('[data-testid="memory-review-content"]').setValue('  老板喜欢中文回复  ')
    await wrapper.get('[data-testid="memory-review-evaluate"]').trigger('click')
    await flushPromises()

    expect(aiClient.contextEvaluateMemory).toHaveBeenCalledWith({
      content: '老板喜欢中文回复',
      type: 'temporary',
      scope: 'session'
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
    }
  )

  it('requires re-evaluation when content changes after a suggested result', async () => {
    aiClient.contextEvaluateMemory.mockResolvedValueOnce({
      status: 'suggested',
      reason: 'explicit_memory_candidate',
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
    const content = wrapper.get('[data-testid="memory-review-content"]')
    await content.setValue('original candidate')
    await wrapper.get('[data-testid="memory-review-evaluate"]').trigger('click')
    await flushPromises()

    await content.setValue('changed candidate')

    const saveButton = wrapper.get('[data-testid="memory-review-save"]')
    expect(saveButton.attributes('disabled')).toBeDefined()
    await saveButton.trigger('click')

    expect(aiClient.contextSaveMemory).not.toHaveBeenCalled()
  })

  it('loads saved memories and tombstones a memory from the review panel', async () => {
    aiClient.contextListMemories.mockResolvedValueOnce({
      memories: [
        {
          id: 'mem_existing',
          type: 'preference',
          scope: 'workspace',
          content: 'Use Chinese replies',
          summary: 'Use Chinese replies',
          tags: ['language'],
          confidence: 0.9,
          privacyLevel: 'normal',
          enabled: true,
          createdAt: 1,
          updatedAt: 2,
          usageCount: 3
        }
      ]
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
      includeDisabled: true,
      limit: 20
    })
    expect(wrapper.text()).toContain('Use Chinese replies')

    await wrapper.get('[data-testid="memory-review-delete-mem_existing"]').trigger('click')
    await flushPromises()

    expect(aiClient.contextDeleteMemory).toHaveBeenCalledWith({
      memoryId: 'mem_existing',
      reason: 'user-memory-review-delete'
    })
    expect(wrapper.text()).not.toContain('Use Chinese replies')
  })

  it('toggles saved memory enabled state through typed sdk', async () => {
    aiClient.contextListMemories.mockResolvedValueOnce({
      memories: [
        {
          id: 'mem_toggle',
          type: 'preference',
          scope: 'workspace',
          content: 'Use concise replies',
          summary: 'Use concise replies',
          tags: [],
          confidence: 0.7,
          privacyLevel: 'normal',
          enabled: true,
          createdAt: 1,
          updatedAt: 2,
          usageCount: 0
        }
      ]
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

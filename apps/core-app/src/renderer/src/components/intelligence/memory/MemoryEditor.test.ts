// @vitest-environment jsdom
import type { MemoryItem } from '@talex-touch/tuff-intelligence'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MemoryEditor from './MemoryEditor.vue'

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

/** Echoes interpolation parameters, so a composed label shows which parts went into it. */
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key
  })
}))

vi.mock('vue-sonner', () => ({ toast }))

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

const mounted: Array<{ unmount: () => void }> = []

/** Attached, because TxSelect teleports its panel to <body>; `afterEach` takes it down again. */
function mountEditor(memory: MemoryItem | null = null) {
  const wrapper = mount(MemoryEditor, { props: { memory }, attachTo: document.body })
  mounted.push(wrapper)
  return wrapper
}

type EditorWrapper = ReturnType<typeof mountEditor>

/** The real TxSelect carrying this test id on its root. */
function findSelect(wrapper: EditorWrapper, testId: string) {
  const select = wrapper
    .findAllComponents({ name: 'TuffSelect' })
    .find((candidate) => candidate.attributes('data-testid') === testId)
  if (!select) throw new Error(`no TxSelect with data-testid="${testId}"`)
  return select
}

/** The select's options as TuffEx renders them in its (teleported, eagerly rendered) panel. */
function selectOptions(wrapper: EditorWrapper, testId: string) {
  return findSelect(wrapper, testId)
    .findAllComponents({ name: 'TuffSelectItem' })
    .map((item) => ({
      value: item.props('value') as string,
      label: item.props('label') as string,
      text: item.text()
    }))
}

/** Picks an option the way a pointer does: a click on the TxSelectItem. */
async function choose(wrapper: EditorWrapper, testId: string, value: string) {
  const item = findSelect(wrapper, testId)
    .findAllComponents({ name: 'TuffSelectItem' })
    .find((candidate) => candidate.props('value') === value)
  if (!item) throw new Error(`no option "${value}" in ${testId}`)
  await item.trigger('click')
}

/** Text fields are TxInput / TxTextarea, which forward the test id to their native field. */
async function edit(wrapper: EditorWrapper, testId: string, value: string) {
  if (testId === 'memory-review-type' || testId === 'memory-review-scope') {
    await choose(wrapper, testId, value)
    return
  }
  await wrapper.get(`[data-testid="${testId}"]`).setValue(value)
}

describe('memoryEditor', () => {
  beforeEach(() => {
    // Resets implementations too, so one test's evaluation result never answers the next.
    vi.resetAllMocks()
  })

  afterEach(() => {
    for (const wrapper of mounted.splice(0)) wrapper.unmount()
  })

  it('evaluates a candidate before explicit save, as a global preference by default', async () => {
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
    const created = createMemory({
      id: 'mem_1',
      scope: 'global',
      content: '老板喜欢中文回复',
      summary: 'Prefers Simplified Chinese replies',
      sourceSessionId: undefined,
      sourceTurnId: undefined,
      updatedAt: 1
    })
    aiClient.contextSaveMemory.mockResolvedValueOnce(created)

    const wrapper = mountEditor()
    await wrapper.get('[data-testid="memory-review-content"]').setValue('  老板喜欢中文回复  ')
    await wrapper.get('[data-testid="memory-review-evaluate"]').trigger('click')
    await flushPromises()

    expect(aiClient.contextEvaluateMemory).toHaveBeenCalledWith({
      content: '老板喜欢中文回复',
      type: 'preference',
      scope: 'global',
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
    expect(wrapper.emitted('saved')).toEqual([[created, 'created']])
    expect(toast.success).toHaveBeenCalledWith('intelligence.memoryReview.saveSuccess')
    // The page owns the list now; the editor never reloads it.
    expect(aiClient.contextListMemories).not.toHaveBeenCalled()
  })

  it.each(['rejected', 'needs_review'] as const)(
    'does not expose save for %s results',
    async (status) => {
      aiClient.contextEvaluateMemory.mockResolvedValueOnce({
        status,
        reason: status === 'rejected' ? 'secret_detected' : 'sensitive_content'
      })

      const wrapper = mountEditor()
      await wrapper.get('[data-testid="memory-review-content"]').setValue('candidate')
      await wrapper.get('[data-testid="memory-review-evaluate"]').trigger('click')
      await flushPromises()

      expect(wrapper.find('[data-testid="memory-review-save"]').exists()).toBe(false)
      expect(wrapper.text()).toContain('intelligence.memoryReview.failClosed')
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
        type: 'preference',
        scope: 'global',
        summary: 'Original candidate',
        tags: [],
        confidence: 1,
        privacyLevel: 'normal'
      }
    })

    const wrapper = mountEditor()
    await wrapper.get('[data-testid="memory-review-content"]').setValue('original candidate')
    await wrapper.get('[data-testid="memory-review-evaluate"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="memory-review-save"]').exists()).toBe(true)

    await edit(wrapper, testId, value)

    expect(wrapper.find('[data-testid="memory-review-save"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('intelligence.memoryReview.evaluationInvalidated')
    expect(aiClient.contextSaveMemory).not.toHaveBeenCalled()
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

    const wrapper = mountEditor(original)
    expect(wrapper.get('[data-testid="memory-review-editing"]').text()).toContain('mem_existing')
    expect(
      (wrapper.get('[data-testid="memory-review-content"]').element as HTMLTextAreaElement).value
    ).toBe('Use Chinese replies')

    await wrapper
      .get('[data-testid="memory-review-content"]')
      .setValue('Use concise Chinese replies')
    await wrapper.get('[data-testid="memory-review-summary"]').setValue('Concise Chinese')
    await wrapper.get('[data-testid="memory-review-tags"]').setValue('language, concise')
    await wrapper.get('[data-testid="memory-review-evaluate"]').trigger('click')
    await flushPromises()

    expect(aiClient.contextEvaluateMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'Use concise Chinese replies',
        type: 'preference',
        scope: 'workspace',
        summary: 'Concise Chinese',
        tags: ['language', 'concise'],
        confidence: 0.9,
        sourceSessionId: 'session-1',
        sourceTurnId: 'turn-1',
        privacyLevel: 'normal'
      })
    )

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
    expect(aiClient.contextSaveMemory).not.toHaveBeenCalled()

    resolveReplacement({
      memory: replacement,
      tombstone: { id: 'memdel_1', memoryId: original.id }
    })
    await flushPromises()

    expect(wrapper.emitted('saved')).toEqual([[replacement, 'replaced']])
    expect(toast.success).toHaveBeenCalledWith('intelligence.memoryReview.replaceSuccess')
  })

  it('reports a replace conflict, then keeps the draft and re-evaluates against the reloaded memory', async () => {
    const original = createMemory()
    const suggested = {
      status: 'suggested',
      reason: 'explicit_memory_candidate',
      fingerprint: 'd'.repeat(64),
      candidate: {
        type: 'preference',
        scope: 'workspace',
        summary: 'Use Chinese replies everywhere',
        tags: ['language'],
        confidence: 0.9,
        sourceSessionId: 'session-1',
        sourceTurnId: 'turn-1',
        privacyLevel: 'normal'
      }
    }
    aiClient.contextEvaluateMemory.mockResolvedValue(suggested)
    aiClient.contextReplaceMemory.mockRejectedValueOnce(new Error('MEMORY_REPLACE_CONFLICT'))

    const wrapper = mountEditor(original)
    await wrapper
      .get('[data-testid="memory-review-content"]')
      .setValue('Use Chinese replies everywhere')
    await wrapper.get('[data-testid="memory-review-evaluate"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="memory-review-save"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('intelligence.memoryReview.replaceConflict')
    expect(wrapper.emitted('conflict')).toHaveLength(1)
    expect(wrapper.emitted('saved')).toBeUndefined()
    expect(toast.error).toHaveBeenCalledWith('intelligence.memoryReview.replaceConflict')

    // The page reloads and hands back the same memory under its new `updatedAt`.
    await wrapper.setProps({ memory: createMemory({ updatedAt: 9 }) })

    expect(wrapper.find('[data-testid="memory-review-save"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('intelligence.memoryReview.replaceConflict')
    expect(
      (wrapper.get('[data-testid="memory-review-content"]').element as HTMLTextAreaElement).value
    ).toBe('Use Chinese replies everywhere')

    aiClient.contextReplaceMemory.mockResolvedValueOnce({
      memory: createMemory({ id: 'mem_after_conflict', updatedAt: 10 }),
      tombstone: { id: 'memdel_2', memoryId: original.id }
    })
    await wrapper.get('[data-testid="memory-review-evaluate"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="memory-review-save"]').trigger('click')
    await flushPromises()

    expect(aiClient.contextReplaceMemory).toHaveBeenLastCalledWith(
      expect.objectContaining({ memoryId: 'mem_existing', expectedUpdatedAt: 9 })
    )
    expect(wrapper.emitted('saved')?.[0]?.[1]).toBe('replaced')
  })

  it('reports a failed save without emitting saved or conflict', async () => {
    aiClient.contextEvaluateMemory.mockResolvedValueOnce({
      status: 'suggested',
      reason: 'explicit_memory_candidate',
      fingerprint: 'e'.repeat(64),
      candidate: {
        type: 'preference',
        scope: 'global',
        summary: 'Candidate',
        tags: [],
        confidence: 1,
        privacyLevel: 'normal'
      }
    })
    aiClient.contextSaveMemory.mockRejectedValueOnce(new Error('boom'))

    const wrapper = mountEditor()
    await wrapper.get('[data-testid="memory-review-content"]').setValue('candidate')
    await wrapper.get('[data-testid="memory-review-evaluate"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="memory-review-save"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('intelligence.memoryReview.saveFailed')
    expect(wrapper.emitted('saved')).toBeUndefined()
    expect(wrapper.emitted('conflict')).toBeUndefined()
  })

  it('starts a new memory as a global preference and marks every scope that is not in effect', () => {
    const wrapper = mountEditor()

    expect(findSelect(wrapper, 'memory-review-type').props('modelValue')).toBe('preference')
    expect(findSelect(wrapper, 'memory-review-scope').props('modelValue')).toBe('global')

    const options = selectOptions(wrapper, 'memory-review-scope')
    expect(options.map((option) => option.value)).toEqual([
      'global',
      'session',
      'project',
      'workspace'
    ])
    // In effect: the plain scope name, in the open list and on the closed trigger.
    expect(options[0]!.label).toBe('intelligence.memoryReview.scopes.global')
    expect(options[0]!.text).toBe('intelligence.memoryReview.scopes.global')
    for (const option of options.slice(1)) {
      // The open list draws the scope name plus a marker chip…
      expect(option.text).toContain(`intelligence.memoryReview.scopes.${option.value}`)
      expect(option.text).toContain('intelligence.memoryReview.effect.inactive')
      // …and the closed trigger shows the composed label once it is picked.
      expect(option.label).toContain('intelligence.memoryReview.scopeOption')
      expect(option.label).toContain('intelligence.memoryReview.effect.inactive')
    }
  })

  it('keeps the marker on the closed select after a scope that is not in effect is picked', async () => {
    const wrapper = mountEditor()

    await choose(wrapper, 'memory-review-scope', 'workspace')

    const trigger = findSelect(wrapper, 'memory-review-scope').get('input')
    expect((trigger.element as HTMLInputElement).value).toContain(
      'intelligence.memoryReview.effect.inactive'
    )
  })

  it('does not count re-picking the current type or scope as an edit', async () => {
    aiClient.contextEvaluateMemory.mockResolvedValueOnce({
      status: 'suggested',
      reason: 'explicit_memory_candidate',
      fingerprint: 'g'.repeat(64),
      candidate: {
        type: 'preference',
        scope: 'global',
        summary: 'Candidate',
        tags: [],
        confidence: 1,
        privacyLevel: 'normal'
      }
    })
    const wrapper = mountEditor()
    await wrapper.get('[data-testid="memory-review-content"]').setValue('candidate')
    await wrapper.get('[data-testid="memory-review-evaluate"]').trigger('click')
    await flushPromises()

    await choose(wrapper, 'memory-review-type', 'preference')
    await choose(wrapper, 'memory-review-scope', 'global')

    expect(wrapper.find('[data-testid="memory-review-save"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('intelligence.memoryReview.evaluationInvalidated')
  })

  it('labels the session scope by the edited memory’s own source session', () => {
    const wrapper = mountEditor(createMemory({ scope: 'session', sourceSessionId: 'session-1' }))

    const byValue = Object.fromEntries(
      selectOptions(wrapper, 'memory-review-scope').map((option) => [option.value, option.text])
    )

    expect(byValue.global).toBe('intelligence.memoryReview.scopes.global')
    expect(byValue.session).toContain('intelligence.memoryReview.effect.sourceSessionOnly')
    expect(byValue.workspace).toContain('intelligence.memoryReview.effect.inactive')
    expect(byValue.project).toContain('intelligence.memoryReview.effect.inactive')
  })

  it('uses TuffEx fields, not native form controls', () => {
    const wrapper = mountEditor()

    expect(wrapper.findAllComponents({ name: 'TuffSelect' })).toHaveLength(2)
    expect(wrapper.findAllComponents({ name: 'TuffInput' }).length).toBeGreaterThanOrEqual(2)
    expect(wrapper.findComponent({ name: 'TxTextarea' }).exists()).toBe(true)
    expect(wrapper.find('select').exists()).toBe(false)
  })

  /**
   * The production shape: optional fields cross the transport as `null`, and the host rejects a
   * `null` TTL outright ("ttl must be a positive duration"). Found in a dev instance on 2026-10-03,
   * where both save and replace failed for every memory; the mocked SDK in these tests had always
   * answered `undefined`, so they passed on the broken payload.
   */
  it('saves a new memory with absent fields absent, even when the host answers them as null', async () => {
    aiClient.contextEvaluateMemory.mockResolvedValueOnce({
      status: 'suggested',
      reason: 'explicit_memory_candidate',
      fingerprint: 'h'.repeat(64),
      candidate: {
        type: 'preference',
        scope: 'global',
        summary: 'Candidate',
        tags: [],
        confidence: 0.6,
        sourceSessionId: null,
        sourceTurnId: null,
        privacyLevel: 'normal',
        ttl: null
      }
    })
    aiClient.contextSaveMemory.mockResolvedValueOnce(createMemory({ id: 'mem_new' }))

    const wrapper = mountEditor()
    await wrapper.get('[data-testid="memory-review-content"]').setValue('candidate')
    await wrapper.get('[data-testid="memory-review-evaluate"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="memory-review-save"]').trigger('click')
    await flushPromises()

    const [payload] = aiClient.contextSaveMemory.mock.calls[0]!
    expect(payload.ttl).toBeUndefined()
    expect(payload.sourceSessionId).toBeUndefined()
    expect(payload.sourceTurnId).toBeUndefined()
    expect(wrapper.emitted('saved')?.[0]?.[1]).toBe('created')
  })

  it('replaces a memory whose absent fields arrived from the host as null', async () => {
    const fromHost = createMemory({
      ttl: null as unknown as undefined,
      sourceSessionId: null as unknown as undefined,
      sourceTurnId: null as unknown as undefined
    })
    aiClient.contextEvaluateMemory.mockResolvedValueOnce({
      status: 'suggested',
      reason: 'explicit_memory_candidate',
      fingerprint: 'i'.repeat(64),
      candidate: {
        type: 'preference',
        scope: 'workspace',
        summary: 'Use Chinese replies',
        tags: ['language'],
        confidence: 0.9,
        sourceSessionId: null,
        sourceTurnId: null,
        privacyLevel: 'normal',
        ttl: null
      }
    })
    aiClient.contextReplaceMemory.mockResolvedValueOnce({
      memory: createMemory({ id: 'mem_replaced' }),
      tombstone: { id: 'memdel_3', memoryId: fromHost.id }
    })

    const wrapper = mountEditor(fromHost)
    await wrapper
      .get('[data-testid="memory-review-content"]')
      .setValue('Use Chinese replies, always')
    await wrapper.get('[data-testid="memory-review-evaluate"]').trigger('click')
    await flushPromises()

    const [evaluated] = aiClient.contextEvaluateMemory.mock.calls[0]!
    expect(evaluated.ttl).toBeUndefined()
    expect(evaluated.sourceSessionId).toBeUndefined()
    expect(evaluated.sourceTurnId).toBeUndefined()

    await wrapper.get('[data-testid="memory-review-save"]').trigger('click')
    await flushPromises()

    const [{ replacement }] = aiClient.contextReplaceMemory.mock.calls[0]!
    expect(replacement.ttl).toBeUndefined()
    expect(replacement.sourceSessionId).toBeUndefined()
    expect(replacement.sourceTurnId).toBeUndefined()
    expect(wrapper.emitted('saved')?.[0]?.[1]).toBe('replaced')
  })

  it('asks the page to close it on cancel', async () => {
    const wrapper = mountEditor(createMemory())

    await wrapper.get('[data-testid="memory-review-cancel-edit"]').trigger('click')

    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })
})

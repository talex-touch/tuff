// @vitest-environment jsdom
/* eslint-disable vue/one-component-per-file */
import type { WorkspaceQueuedInput } from '@talex-touch/utils/transport/sdk/domains/agent-workspace'
import type { VueWrapper } from '@vue/test-utils'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import HomeWorkspaceQueue from './HomeWorkspaceQueue.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      `${key}${params ? JSON.stringify(params) : ''}`
  })
}))
vi.mock('vue-sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

vi.mock('@talex-touch/tuffex/modal', () => ({
  TxModal: defineComponent({
    name: 'TxModal',
    props: {
      modelValue: { type: Boolean, default: false },
      title: { type: String, default: '' }
    },
    emits: ['update:modelValue'],
    setup(props, { slots }) {
      return () =>
        props.modelValue
          ? h('div', { class: 'modal-stub' }, [
              h('div', { class: 'modal-title' }, props.title),
              slots.default?.(),
              slots.footer?.()
            ])
          : null
    }
  })
}))

vi.mock('@talex-touch/tuffex/button', () => ({
  TxButton: defineComponent({
    name: 'TxButton',
    props: {
      disabled: { type: Boolean, default: false },
      loading: { type: Boolean, default: false },
      type: { type: String },
      variant: { type: String }
    },
    setup(props, { slots, attrs }) {
      return () => h('button', { ...attrs, disabled: props.disabled }, slots.default?.())
    }
  })
}))

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.restoreAllMocks()
})

function queued(
  id: string,
  text: string,
  overrides: Partial<WorkspaceQueuedInput> = {}
): WorkspaceQueuedInput {
  return {
    id,
    conversationId: 'c1',
    text,
    settings: { mode: 'agent', profileId: 'default-pi' },
    projectId: null,
    createdAt: Date.now(),
    ...overrides
  }
}

function mountQueue(props: Record<string, unknown> = {}): VueWrapper {
  wrapper = mount(HomeWorkspaceQueue, {
    props: {
      items: [queued('q1', 'first task'), queued('q2', 'second task')],
      status: 'running',
      held: false,
      limit: 8,
      pending: null,
      resuming: false,
      ...props
    }
  })
  return wrapper
}

describe('HomeWorkspaceQueue', () => {
  it('does not display the redundant "Agent" tag for agent mode items', () => {
    const queue = mountQueue()
    const text = queue.text()
    expect(text).not.toContain('home.workspace.mode.agent')
    expect(text).toContain('first task')
    expect(text).toContain('second task')
  })

  it('renders attachment image thumbnails when present', () => {
    const itemWithThumb = queued('q3', 'with picture', {
      attachments: [
        {
          id: 'att1',
          kind: 'image',
          name: 'photo.png',
          mimeType: 'image/png',
          size: 1024,
          previewUrl: 'data:image/png;base64,abc'
        }
      ]
    })
    const queue = mountQueue({ items: [itemWithThumb] })
    const img = queue.find('.HomeWorkspaceQueue-ThumbImg')
    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toBe('data:image/png;base64,abc')
  })

  it('emits action remove when clicking delete button', async () => {
    const queue = mountQueue()
    const deleteBtns = queue.findAll('.HomeWorkspaceQueue-Btn.is-danger')
    expect(deleteBtns.length).toBeGreaterThan(0)
    await deleteBtns[0]!.trigger('click')
    expect(queue.emitted('action')).toEqual([['q1', 'remove']])
  })

  it('opens edit modal on edit click and emits update upon saving with updated text', async () => {
    const queue = mountQueue()
    expect(queue.find('.modal-stub').exists()).toBe(false)

    // Click edit button on first item
    const editBtn = queue.find('.HomeWorkspaceQueue-Btn[title="home.workspace.queue.edit"]')
    expect(editBtn.exists()).toBe(true)
    await editBtn.trigger('click')

    // Modal is now open
    expect(queue.find('.modal-stub').exists()).toBe(true)
    const textarea = queue.find('.HomeWorkspaceQueue-EditText')
    expect(textarea.exists()).toBe(true)
    expect((textarea.element as HTMLTextAreaElement).value).toBe('first task')

    // Update text and save
    await textarea.setValue('modified task content')
    const saveBtn = queue.findAll('button').find((b) => b.text().includes('common.save'))
    expect(saveBtn).toBeDefined()
    await saveBtn!.trigger('click')
    await nextTick()

    // Emits update with queueId and new text
    expect(queue.emitted('update')).toBeDefined()
    const updateEvent = queue.emitted('update')![0]!
    expect(updateEvent[0]).toBe('q1')
    expect(updateEvent[1]).toBe('modified task content')

    // Modal closes
    expect(queue.find('.modal-stub').exists()).toBe(false)
  })

  it('renders all items directly for internal scrolling without expand/collapse button', () => {
    const manyItems = [
      queued('q1', 'task 1'),
      queued('q2', 'task 2'),
      queued('q3', 'task 3'),
      queued('q4', 'task 4'),
      queued('q5', 'task 5')
    ]
    const queue = mountQueue({ items: manyItems })
    const rows = queue.findAll('.HomeWorkspaceQueue-Row')
    expect(rows.length).toBe(5)
    expect(queue.find('.HomeWorkspaceQueue-More').exists()).toBe(false)
  })
})

// @vitest-environment jsdom
/* eslint-disable vue/one-component-per-file */

import type { ConversationRecord } from '@talex-touch/utils/transport/sdk/domains/conversation'
import type { VueWrapper } from '@vue/test-utils'
import type { ConversationProjectRow } from '~/modules/conversation/conversation-project-groups'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import {
  resetConversationLoading,
  setConversationLoading
} from '~/modules/conversation/useConversationLoading'
import ShellProjectRows from './ShellProjectRows.vue'

vi.mock('vue-i18n', () => ({
  // Keys as labels, with any parameters spelled out so the title can be asserted.
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key} ${JSON.stringify(params)}` : key
  })
}))

interface DialogButtonStub {
  content: string
  type: string
  onClick?: () => boolean
}

vi.mock('@talex-touch/tuffex/dropdown-menu', () => ({
  TxDropdownMenu: defineComponent({
    name: 'TxDropdownMenu',
    props: { modelValue: { type: Boolean, default: false } },
    emits: ['update:modelValue'],
    setup(_props, { slots }) {
      return () => h('div', { class: 'tx-dropdown' }, [slots.trigger?.(), slots.default?.()])
    }
  }),
  TxDropdownItem: defineComponent({
    name: 'TxDropdownItem',
    props: {
      disabled: { type: Boolean, default: false },
      danger: { type: Boolean, default: false }
    },
    emits: ['select'],
    setup(props, { slots, emit }) {
      return () =>
        h(
          'button',
          {
            type: 'button',
            class: 'tx-dropdown-item',
            disabled: props.disabled,
            onClick: () => emit('select')
          },
          slots.default?.()
        )
    }
  })
}))

vi.mock('@talex-touch/tuffex/dialog', () => ({
  TxBottomDialog: defineComponent({
    name: 'TxBottomDialog',
    props: {
      title: { type: String, default: '' },
      message: { type: String, default: '' },
      btns: { type: Array as () => DialogButtonStub[], default: () => [] },
      close: { type: Function, default: () => {} }
    },
    setup(props) {
      return () =>
        h('div', { class: 'tx-bottom-dialog' }, [
          h('span', { class: 'dialog-title' }, props.title),
          h('span', { class: 'dialog-message' }, props.message),
          props.btns.map((btn) =>
            h(
              'button',
              {
                class: `dialog-btn-${btn.type}`,
                onClick: () => {
                  if (btn.onClick?.() !== false) props.close?.()
                }
              },
              btn.content
            )
          )
        ])
    }
  })
}))

function conversationRow(id: string, title = id): ConversationProjectRow {
  const conversation: ConversationRecord = {
    id,
    title,
    projectId: null,
    createdAt: 1,
    updatedAt: 1
  }
  return { kind: 'conversation', key: `conversation:${id}`, updatedAt: 1, conversation }
}

const mounted: VueWrapper[] = []

function mountRows(rows: ConversationProjectRow[]): VueWrapper {
  const wrapper = mount(ShellProjectRows, {
    attachTo: document.body,
    props: { rows, activeId: null }
  })
  mounted.push(wrapper)
  return wrapper
}
function actionButton(wrapper: VueWrapper, id: string) {
  const row = wrapper
    .findAll('.ShellProjectRows-Row')
    .find((item) => item.find('.ShellProjectRows-Open').text().includes(id))
  if (!row) throw new Error(`Missing conversation row: ${id}`)
  return row.find('.ShellProjectRows-Action')
}

function findDropdownItem(wrapper: VueWrapper, text: string) {
  return wrapper.findAll('.tx-dropdown-item').find((item) => item.text().includes(text))
}

function findDialogBtn(wrapper: VueWrapper, type: string) {
  return wrapper.find(`.dialog-btn-${type}`)
}

function removed(wrapper: VueWrapper): unknown[] {
  return wrapper.emitted('removeConversation') ?? []
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  while (mounted.length) mounted.pop()!.unmount()
  vi.useRealTimers()
})

describe('shellProjectRows delete confirmation', () => {
  it('renders a three-dot action button and opens confirmation dialog when delete is selected', async () => {
    const wrapper = mountRows([conversationRow('c1', 'Weekly notes')])
    const btn = actionButton(wrapper, 'Weekly notes')

    expect(btn.element.tagName).toBe('BUTTON')
    expect(btn.find('.i-ri-more-2-fill').exists()).toBe(true)

    // Dialog is not open initially
    expect(wrapper.find('.tx-bottom-dialog').exists()).toBe(false)

    const deleteItem = findDropdownItem(wrapper, 'shell.history.delete')
    expect(deleteItem?.exists()).toBe(true)

    // Select delete in dropdown
    await deleteItem!.trigger('click')
    await wrapper.vm.$nextTick()

    // Dialog appears with secondary confirmation
    expect(wrapper.find('.tx-bottom-dialog').exists()).toBe(true)
    expect(wrapper.find('.dialog-title').text()).toBe('shell.history.deleteConfirmTitle')
    expect(wrapper.find('.dialog-message').text()).toContain('Weekly notes')

    // Has cancel and delete buttons
    expect(findDialogBtn(wrapper, 'info').text()).toBe('common.cancel')
    expect(findDialogBtn(wrapper, 'error').text()).toBe('shell.history.delete')

    // Not deleted yet
    expect(removed(wrapper)).toEqual([])

    // Click confirm in dialog
    await findDialogBtn(wrapper, 'error').trigger('click')
    await wrapper.vm.$nextTick()

    expect(removed(wrapper)).toEqual([['c1']])
    expect(wrapper.find('.tx-bottom-dialog').exists()).toBe(false)
  })

  it('cancels deletion when cancel is clicked in the dialog', async () => {
    const wrapper = mountRows([conversationRow('c1', 'My chat')])
    const deleteItem = findDropdownItem(wrapper, 'shell.history.delete')

    await deleteItem!.trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.tx-bottom-dialog').exists()).toBe(true)

    await findDialogBtn(wrapper, 'info').trigger('click')
    await wrapper.vm.$nextTick()

    expect(removed(wrapper)).toEqual([])
    expect(wrapper.find('.tx-bottom-dialog').exists()).toBe(false)
  })

  it('names an untitled conversation by its placeholder in confirmation message', async () => {
    const wrapper = mountRows([conversationRow('c1', '')])
    const deleteItem = findDropdownItem(wrapper, 'shell.history.delete')

    await deleteItem!.trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.dialog-message').text()).toContain('shell.history.untitled')
  })
})

describe('shellProjectRows loading state', () => {
  afterEach(() => {
    resetConversationLoading()
  })

  it('shows loading indicator and adds is-loading class when conversation is loading', () => {
    setConversationLoading('loading-conv', true)
    const wrapper = mountRows([
      conversationRow('loading-conv', 'Loading Chat'),
      conversationRow('idle-conv', 'Idle Chat')
    ])

    const rows = wrapper.findAll('.ShellProjectRows-Row')
    expect(rows[0].classes()).toContain('is-loading')
    expect(rows[0].find('.ShellProjectRows-LoadingIndicator').exists()).toBe(true)
    expect(rows[0].find('.ShellProjectRows-Spinner').exists()).toBe(true)

    expect(rows[1].classes()).not.toContain('is-loading')
    expect(rows[1].find('.ShellProjectRows-LoadingIndicator').exists()).toBe(false)
  })

  it('updates reactively when loading status changes', async () => {
    const wrapper = mountRows([conversationRow('dyn-conv', 'Dynamic Chat')])
    const row = wrapper.find('.ShellProjectRows-Row')

    expect(row.classes()).not.toContain('is-loading')
    expect(row.find('.ShellProjectRows-LoadingIndicator').exists()).toBe(false)

    setConversationLoading('dyn-conv', true)
    await wrapper.vm.$nextTick()

    expect(row.classes()).toContain('is-loading')
    expect(row.find('.ShellProjectRows-LoadingIndicator').exists()).toBe(true)

    setConversationLoading('dyn-conv', false)
    await wrapper.vm.$nextTick()

    expect(row.classes()).not.toContain('is-loading')
    expect(row.find('.ShellProjectRows-LoadingIndicator').exists()).toBe(false)
  })

  it('shows spinners on all loading conversations, but only marks active row for border animation', () => {
    setConversationLoading('active-loading', true)
    setConversationLoading('inactive-loading', true)
    const wrapper = mount(ShellProjectRows, {
      attachTo: document.body,
      props: {
        rows: [
          conversationRow('active-loading', 'Active Chat'),
          conversationRow('inactive-loading', 'Inactive Chat')
        ],
        activeId: 'active-loading'
      }
    })
    mounted.push(wrapper)

    const rows = wrapper.findAll('.ShellProjectRows-Row')
    expect(rows).toHaveLength(2)

    // Both rows have the spinner
    expect(rows[0].find('.ShellProjectRows-LoadingIndicator').exists()).toBe(true)
    expect(rows[1].find('.ShellProjectRows-LoadingIndicator').exists()).toBe(true)

    // Active row is both is-loading and active (matches &.is-loading.active for border animation)
    expect(rows[0].classes()).toContain('is-loading')
    expect(rows[0].classes()).toContain('active')

    // Inactive row is loading but NOT active (does not match &.is-loading.active)
    expect(rows[1].classes()).toContain('is-loading')
    expect(rows[1].classes()).not.toContain('active')
  })
})

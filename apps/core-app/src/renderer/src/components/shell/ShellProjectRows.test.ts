// @vitest-environment jsdom
/* eslint-disable vue/one-component-per-file */

import type { ConversationRecord } from '@talex-touch/utils/transport/sdk/domains/conversation'
import type { VueWrapper } from '@vue/test-utils'
import type { ConversationProjectRow } from '~/modules/conversation/conversation-project-groups'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'

import ShellProjectRows from './ShellProjectRows.vue'

vi.mock('vue-i18n', () => ({
  // Keys as labels, with any parameters spelled out so the title can be asserted.
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key} ${JSON.stringify(params)}` : key
  })
}))

// Only conversation rows are rendered here; the session rows' menu needs no real popover.
vi.mock('@talex-touch/tuffex/dropdown-menu', () => ({
  TxDropdownMenu: defineComponent({
    name: 'TxDropdownMenu',
    setup(_props, { slots }) {
      return () => h('div', [slots.trigger?.(), slots.default?.()])
    }
  }),
  TxDropdownItem: defineComponent({
    name: 'TxDropdownItem',
    setup(_props, { slots }) {
      return () => h('button', { type: 'button' }, slots.default?.())
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

function deleteButton(wrapper: VueWrapper, id: string) {
  const row = wrapper
    .findAll('.ShellProjectRows-Row')
    .find((item) => item.find('.ShellProjectRows-Open').text() === id)
  if (!row) throw new Error(`Missing conversation row: ${id}`)
  return row.find('.ShellProjectRows-Delete')
}

function isArmed(wrapper: VueWrapper, id: string): boolean {
  return deleteButton(wrapper, id).classes().includes('is-armed')
}

function removed(wrapper: VueWrapper): unknown[] {
  return wrapper.emitted('removeConversation') ?? []
}

function pressEscape(wrapper: VueWrapper, id: string): KeyboardEvent {
  return pressKey(wrapper, id, { key: 'Escape' })
}

function pressKey(wrapper: VueWrapper, id: string, init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  deleteButton(wrapper, id).element.dispatchEvent(event)
  return event
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  while (mounted.length) mounted.pop()!.unmount()
  vi.useRealTimers()
})

describe('shellProjectRows delete confirmation', () => {
  it('turns the trash can into 「确认？」 on the first press and deletes only on the second', async () => {
    const wrapper = mountRows([conversationRow('c1', 'Weekly notes')])
    const button = deleteButton(wrapper, 'Weekly notes')

    expect(button.element.tagName).toBe('BUTTON')
    expect(button.attributes('type')).toBe('button')
    expect(button.attributes('aria-label')).toBe('shell.history.delete')
    expect(button.find('.i-ri-delete-bin-6-line').exists()).toBe(true)

    await button.trigger('click')

    expect(removed(wrapper)).toEqual([])
    expect(button.classes()).toContain('is-armed')
    expect(button.find('.i-ri-delete-bin-6-line').exists()).toBe(false)
    expect(button.find('.ShellProjectRows-Confirm').text()).toBe('shell.history.deleteConfirm')
    const armedLabel = 'shell.history.deleteConfirmLabel {"title":"Weekly notes"}'
    expect(button.attributes('aria-label')).toBe(armedLabel)
    expect(button.attributes('title')).toBe(armedLabel)
    // The same element in both states, so a keyboard user's focus is not dropped by the swap.
    expect(deleteButton(wrapper, 'Weekly notes').element).toBe(button.element)

    await button.trigger('click')

    expect(removed(wrapper)).toEqual([['c1']])
    expect(button.classes()).not.toContain('is-armed')
  })

  it('names an untitled conversation by its placeholder when armed', async () => {
    const wrapper = mountRows([conversationRow('c1', '')])
    const button = wrapper.find('.ShellProjectRows-Delete')

    await button.trigger('click')

    expect(button.attributes('aria-label')).toBe(
      'shell.history.deleteConfirmLabel {"title":"shell.history.untitled"}'
    )
  })

  it('gives the trash can back when the pointer leaves the row', async () => {
    const wrapper = mountRows([conversationRow('c1')])

    await deleteButton(wrapper, 'c1').trigger('click')
    expect(isArmed(wrapper, 'c1')).toBe(true)

    await wrapper.find('.ShellProjectRows-Row').trigger('mouseleave')
    expect(isArmed(wrapper, 'c1')).toBe(false)

    // Disarmed means the next press arms again rather than deleting.
    await deleteButton(wrapper, 'c1').trigger('click')
    expect(removed(wrapper)).toEqual([])
    expect(isArmed(wrapper, 'c1')).toBe(true)
  })

  it('gives the trash can back when focus leaves the button', async () => {
    const wrapper = mountRows([conversationRow('c1')])
    const button = deleteButton(wrapper, 'c1')
    ;(button.element as HTMLButtonElement).focus()

    await button.trigger('click')
    expect(isArmed(wrapper, 'c1')).toBe(true)
    expect(document.activeElement).toBe(button.element)
    ;(button.element as HTMLButtonElement).blur()
    await wrapper.vm.$nextTick()
    expect(isArmed(wrapper, 'c1')).toBe(false)
  })

  it('backs out on Escape, claiming the key only while armed', async () => {
    const wrapper = mountRows([conversationRow('c1')])

    expect(pressEscape(wrapper, 'c1').defaultPrevented).toBe(false)

    await deleteButton(wrapper, 'c1').trigger('click')
    const event = pressEscape(wrapper, 'c1')
    await wrapper.vm.$nextTick()

    expect(event.defaultPrevented).toBe(true)
    expect(isArmed(wrapper, 'c1')).toBe(false)
    expect(removed(wrapper)).toEqual([])
  })

  it('lets only a fresh Enter take the second step, not one held down', async () => {
    const wrapper = mountRows([conversationRow('c1')])

    // A fresh press is left to the native button, whose click arms and then deletes.
    expect(pressKey(wrapper, 'c1', { key: 'Enter' }).defaultPrevented).toBe(false)
    // Held down, Enter repeats that click; the repeats are swallowed before they become one.
    await deleteButton(wrapper, 'c1').trigger('click')
    expect(pressKey(wrapper, 'c1', { key: 'Enter', repeat: true }).defaultPrevented).toBe(true)
    expect(isArmed(wrapper, 'c1')).toBe(true)
    expect(removed(wrapper)).toEqual([])
  })

  it('gives the trash can back after 3 seconds without a second press', async () => {
    const wrapper = mountRows([conversationRow('c1')])

    await deleteButton(wrapper, 'c1').trigger('click')
    await vi.advanceTimersByTimeAsync(2999)
    expect(isArmed(wrapper, 'c1')).toBe(true)

    await vi.advanceTimersByTimeAsync(1)
    expect(isArmed(wrapper, 'c1')).toBe(false)

    await deleteButton(wrapper, 'c1').trigger('click')
    expect(removed(wrapper)).toEqual([])
  })

  it('restarts the window for a row armed again after it lapsed', async () => {
    const wrapper = mountRows([conversationRow('c1')])

    await deleteButton(wrapper, 'c1').trigger('click')
    await vi.advanceTimersByTimeAsync(3000)
    await deleteButton(wrapper, 'c1').trigger('click')
    await vi.advanceTimersByTimeAsync(2000)

    expect(isArmed(wrapper, 'c1')).toBe(true)
    await deleteButton(wrapper, 'c1').trigger('click')
    expect(removed(wrapper)).toEqual([['c1']])
  })

  it('keeps one row armed at a time within a list', async () => {
    const wrapper = mountRows([conversationRow('c1'), conversationRow('c2')])

    await deleteButton(wrapper, 'c1').trigger('click')
    await deleteButton(wrapper, 'c2').trigger('click')

    expect(isArmed(wrapper, 'c1')).toBe(false)
    expect(isArmed(wrapper, 'c2')).toBe(true)
    expect(wrapper.findAll('.ShellProjectRows-Delete.is-armed')).toHaveLength(1)

    // c1 lost its arming, so its next press arms again and c2 gives way.
    await deleteButton(wrapper, 'c1').trigger('click')
    expect(removed(wrapper)).toEqual([])
    expect(isArmed(wrapper, 'c2')).toBe(false)
  })

  it('keeps one row armed at a time across folders and the Chats section', async () => {
    const folder = mountRows([conversationRow('in-project')])
    const chats = mountRows([conversationRow('loose')])

    await deleteButton(folder, 'in-project').trigger('click')
    await deleteButton(chats, 'loose').trigger('click')

    expect(isArmed(folder, 'in-project')).toBe(false)
    expect(isArmed(chats, 'loose')).toBe(true)

    // The lapse timer belongs to the row armed now; the one that gave way left nothing behind.
    await vi.advanceTimersByTimeAsync(3000)
    expect(isArmed(chats, 'loose')).toBe(false)
    expect(removed(folder)).toEqual([])
    expect(removed(chats)).toEqual([])
  })

  it('clears its lapse timer when it unmounts while armed', async () => {
    const wrapper = mountRows([conversationRow('c1')])

    await deleteButton(wrapper, 'c1').trigger('click')
    expect(vi.getTimerCount()).toBe(1)

    mounted.pop()!.unmount()
    expect(vi.getTimerCount()).toBe(0)

    // A row mounted afterwards arms normally: nothing stale is left in the hand-off.
    const next = mountRows([conversationRow('c2')])
    await deleteButton(next, 'c2').trigger('click')
    expect(isArmed(next, 'c2')).toBe(true)
  })
})
